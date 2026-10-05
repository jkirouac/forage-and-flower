// This month's data: who's in the garden, its tasks, and its ticks. Ticks go
// through the outbox (outbox.ts); the last good load is kept on the phone.

import { useCallback, useState } from 'react'
import { supabase } from './supabase'
import { checkKey, type Check, type Note, type Outcome, type Task } from './month'
import { queue, readOps, type Op } from './outbox'
import { toOps, type DraftItem } from './notes'
import { CACHES, findGardenId, readJson, useLiveTable, useLoadWhenBack, usePending, writeJson } from './local'

export interface Garden {
  gardenId: string | null // null: this account isn't in a garden yet
  members: Record<string, string> // user id -> initials
  tasks: Task[]
  checks: Check[]
  notes: Note[]
  // True when the server couldn't be reached and this is what the phone last saw.
  fromPhone?: boolean
}

// Unsent ticks on this phone win over what the server has.
function applyTicks(checks: Check[], ops: Op[]): Check[] {
  const byKey = new Map(checks.map((c) => [checkKey(c.task_id, c.year, c.month), c]))
  for (const op of ops) {
    if (op.kind === 'clear-checks') {
      for (const taskId of op.taskIds) {
        const key = checkKey(taskId, op.year, op.month)
        const c = byKey.get(key)
        if (c) byKey.set(key, { ...c, cleared_at: op.at })
      }
      continue
    }
    if (op.kind !== 'check') continue
    const key = checkKey(op.taskId, op.year, op.month)
    if (op.outcome === null) byKey.delete(key)
    else
      byKey.set(key, {
        task_id: op.taskId,
        year: op.year,
        month: op.month,
        outcome: op.outcome,
        done_by: op.doneBy,
        done_at: op.at,
        // Changing a tick (say, done to pushed) doesn't bring a cleared one back.
        cleared_at: byKey.get(key)?.cleared_at ?? null,
      })
  }
  return [...byKey.values()]
}

// Unsent voice notes on this phone: one-off tasks and notes added or removed.
function applyNotes(g: Garden, ops: Op[]): Garden {
  let { tasks, notes } = g
  for (const op of ops) {
    if (op.kind === 'task-insert' && !tasks.some((t) => t.id === op.row.id)) tasks = [...tasks, op.row as unknown as Task]
    else if (op.kind === 'task-delete') tasks = tasks.filter((t) => t.id !== op.id)
    else if (op.kind === 'note-insert' && !notes.some((n) => n.id === op.row.id)) notes = [...notes, op.row as unknown as Note]
    else if (op.kind === 'note-delete') notes = notes.filter((n) => n.id !== op.id)
  }
  return { ...g, tasks, notes, checks: applyTicks(g.checks, ops) }
}

// Ticks from last year on, which covers this month and anything pushed into it.
export async function loadGarden(userId: string, year: number): Promise<Garden> {
  try {
    const gardenId = await findGardenId(userId)
    if (!gardenId) return { gardenId: null, members: {}, tasks: [], checks: [], notes: [] }

    const [members, tasks, checks, notes] = await Promise.all([
      supabase.from('members').select('user_id, initials').eq('garden_id', gardenId),
      supabase
        .from('tasks')
        .select('id, section, title, detail, link, month, every_month, position, year, spoken')
        .eq('garden_id', gardenId)
        .order('position'),
      supabase
        .from('task_checks')
        .select('task_id, year, month, outcome, done_by, done_at, cleared_at')
        .eq('garden_id', gardenId)
        .gte('year', year - 1),
      supabase
        .from('notes')
        .select('id, year, month, text, spoken, written_by, written_at')
        .eq('garden_id', gardenId)
        .gte('year', year - 1),
    ])
    const error = members.error ?? tasks.error ?? checks.error ?? notes.error
    if (error) throw error

    const garden: Garden = {
      gardenId,
      members: Object.fromEntries((members.data ?? []).map((m) => [m.user_id as string, m.initials as string])),
      tasks: tasks.data as Task[],
      checks: checks.data as Check[],
      notes: notes.data as Note[],
    }
    writeJson(CACHES.garden, { ...garden, userId })
    return applyNotes(garden, readOps())
  } catch (error) {
    const cached = readJson<(Garden & { userId: string }) | null>(CACHES.garden, null)
    // A cache from before notes existed has none.
    if (cached?.userId === userId) return { ...applyNotes({ ...cached, notes: cached.notes ?? [] }, readOps()), fromPhone: true }
    throw error
  }
}

export function useGarden(userId: string, year: number) {
  const [garden, setGarden] = useState<Garden | null>(null)
  const [error, setError] = useState('')
  const pending = usePending()

  const reload = useCallback(() => {
    loadGarden(userId, year)
      .then((g) => {
        setGarden(g)
        setError('')
      })
      .catch(() => setError("Couldn't load the garden. Check your connection and try again."))
  }, [userId, year])

  useLoadWhenBack(reload)
  const gardenId = garden?.gardenId
  useLiveTable('task_checks', gardenId, reload)
  useLiveTable('tasks', gardenId, reload)
  useLiveTable('notes', gardenId, reload)

  const change = useCallback((ops: Op[]) => {
    setGarden((prev) => (prev ? applyNotes(prev, ops) : prev))
    for (const op of ops) void queue(op)
  }, [])

  // Saves reviewed voice-note items; returns the ids, for Undo.
  const addItems = useCallback(
    (items: DraftItem[], spoken: string) => {
      if (!gardenId) return []
      const ops = toOps(items, spoken, gardenId, userId)
      change(ops)
      return ops.map((o) => ('row' in o ? { kind: o.kind, id: o.row.id } : null)).filter((x) => x !== null)
    },
    [change, gardenId, userId],
  )
  const removeTask = useCallback((id: string) => change([{ kind: 'task-delete', id }]), [change])
  const removeNote = useCallback((id: string) => change([{ kind: 'note-delete', id }]), [change])

  const tick = useCallback(
    (taskId: string, y: number, m: number, outcome: Outcome | null) => {
      if (!gardenId) return
      const op: Op = { kind: 'check', gardenId, taskId, year: y, month: m, outcome, doneBy: userId, at: new Date().toISOString() }
      setGarden((prev) => (prev ? { ...prev, checks: applyTicks(prev.checks, [op]) } : prev))
      void queue(op)
    },
    [gardenId, userId],
  )

  const clear = useCallback(
    (taskIds: string[], y: number, m: number) => {
      if (!gardenId || taskIds.length === 0) return
      const op: Op = { kind: 'clear-checks', gardenId, year: y, month: m, taskIds, at: new Date().toISOString() }
      setGarden((prev) => (prev ? { ...prev, checks: applyTicks(prev.checks, [op]) } : prev))
      void queue(op)
    },
    [gardenId],
  )

  return { garden, error, pending, reload, tick, clear, addItems, removeTask, removeNote }
}
