// The signed-in person's garden: who's in it, its tasks, and its ticks.
//
// Ticks go through an outbox kept on the phone, so one made without signal shows
// straight away and is sent later. The last good load is kept too, so the list
// still opens in the garden with no connection.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { checkKey, type Check, type Outcome, type Task } from './month'

export interface Garden {
  gardenId: string | null // null: this account isn't in a garden yet
  members: Record<string, string> // user id -> initials
  tasks: Task[]
  checks: Check[]
  // True when the server couldn't be reached and this is what the phone last saw.
  fromPhone?: boolean
}

interface Op {
  gardenId: string
  taskId: string
  year: number
  month: number
  outcome: Outcome | null // null removes the tick
  doneBy: string
  at: string
}

const OUTBOX = 'ff-outbox'
const CACHE = 'ff-garden'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: ticks still go to the server when online.
  }
}

const opKey = (op: Op) => checkKey(op.taskId, op.year, op.month)

export function pendingCount() {
  return read<Op[]>(OUTBOX, []).length
}

function applyOps(checks: Check[], ops: Op[]): Check[] {
  const byKey = new Map(checks.map((c) => [checkKey(c.task_id, c.year, c.month), c]))
  for (const op of ops) {
    if (op.outcome === null) byKey.delete(opKey(op))
    else
      byKey.set(opKey(op), {
        task_id: op.taskId,
        year: op.year,
        month: op.month,
        outcome: op.outcome,
        done_by: op.doneBy,
        done_at: op.at,
      })
  }
  return [...byKey.values()]
}

// Ticks from last year on, which covers this month and anything pushed into it.
export async function loadGarden(userId: string, year: number): Promise<Garden> {
  const cached = read<(Garden & { userId: string }) | null>(CACHE, null)
  const fromCache = (): Garden | null =>
    cached?.userId === userId ? { ...cached, checks: applyOps(cached.checks, read<Op[]>(OUTBOX, [])), fromPhone: true } : null

  try {
    const me = await supabase.from('members').select('garden_id').eq('user_id', userId).maybeSingle()
    if (me.error) throw me.error
    if (!me.data) return { gardenId: null, members: {}, tasks: [], checks: [] }
    const gardenId = me.data.garden_id as string

    const [members, tasks, checks] = await Promise.all([
      supabase.from('members').select('user_id, initials').eq('garden_id', gardenId),
      supabase
        .from('tasks')
        .select('id, section, title, detail, link, month, every_month, position')
        .eq('garden_id', gardenId)
        .order('position'),
      supabase
        .from('task_checks')
        .select('task_id, year, month, outcome, done_by, done_at')
        .eq('garden_id', gardenId)
        .gte('year', year - 1),
    ])
    if (members.error || tasks.error || checks.error) throw members.error ?? tasks.error ?? checks.error

    const garden: Garden = {
      gardenId,
      members: Object.fromEntries(members.data.map((m) => [m.user_id as string, m.initials as string])),
      tasks: tasks.data as Task[],
      checks: checks.data as Check[],
    }
    write(CACHE, { ...garden, userId })
    // Unsent ticks on this phone win over what the server has.
    return { ...garden, checks: applyOps(garden.checks, read<Op[]>(OUTBOX, [])) }
  } catch (error) {
    const offline = fromCache()
    if (offline) return offline
    throw error
  }
}

export function queue(op: Op) {
  const ops = read<Op[]>(OUTBOX, []).filter((o) => opKey(o) !== opKey(op))
  ops.push(op)
  write(OUTBOX, ops)
  return flush()
}

let flushing: Promise<void> | null = null

export function flush(): Promise<void> {
  flushing ??= doFlush().finally(() => {
    flushing = null
  })
  return flushing
}

// Sends queued ticks one at a time, re-reading the outbox each round so ticks made
// meanwhile go too. A refusal from the database (the task was deleted, or the
// account left the garden) drops that tick; no connection stops and tries later.
async function doFlush() {
  for (;;) {
    const ops = read<Op[]>(OUTBOX, [])
    if (ops.length === 0) return
    const op = ops[0]
    const { error } =
      op.outcome === null
        ? await supabase.from('task_checks').delete().match({ task_id: op.taskId, year: op.year, month: op.month })
        : await supabase.from('task_checks').upsert(
            {
              garden_id: op.gardenId,
              task_id: op.taskId,
              year: op.year,
              month: op.month,
              outcome: op.outcome,
              done_by: op.doneBy,
              done_at: op.at,
            },
            { onConflict: 'task_id,year,month' },
          )
    if (error && !error.code) return
    // Remove what was sent (or refused), unless it was changed again meanwhile.
    const sent = JSON.stringify(op)
    write(
      OUTBOX,
      read<Op[]>(OUTBOX, []).filter((o) => JSON.stringify(o) !== sent),
    )
  }
}

export function clearLocal() {
  for (const key of [OUTBOX, CACHE]) {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
}

// ---------- hook ----------

export function useGarden(userId: string, year: number) {
  const [garden, setGarden] = useState<Garden | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(pendingCount)

  const reload = useCallback(() => {
    loadGarden(userId, year)
      .then((g) => {
        setGarden(g)
        setError('')
      })
      .catch(() => setError("Couldn't load the garden. Check your connection and try again."))
      .finally(() => setPending(pendingCount()))
  }, [userId, year])

  // Load now, again when the app comes back to the front or the phone gets signal.
  useEffect(() => {
    reload()
    const onFocus = () => {
      if (document.visibilityState === 'visible') void flush().then(reload)
    }
    const onOnline = () => void flush().then(reload)
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [reload])

  // The other phone's ticks arrive while this one is open.
  const gardenId = garden?.gardenId
  useEffect(() => {
    if (!gardenId) return
    const channel = supabase
      .channel(`task-checks-${gardenId}`)
      .on('postgres_changes', { event: '*', schema: 'garden', table: 'task_checks', filter: `garden_id=eq.${gardenId}` }, () => reload())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gardenId, reload])

  const tick = useCallback(
    (taskId: string, y: number, m: number, outcome: Outcome | null) => {
      if (!gardenId) return
      const op: Op = { gardenId, taskId, year: y, month: m, outcome, doneBy: userId, at: new Date().toISOString() }
      setGarden((prev) => (prev ? { ...prev, checks: applyOps(prev.checks, [op]) } : prev))
      void queue(op).finally(() => setPending(pendingCount()))
      setPending(pendingCount())
    },
    [gardenId, userId],
  )

  return { garden, error, pending, reload, tick }
}
