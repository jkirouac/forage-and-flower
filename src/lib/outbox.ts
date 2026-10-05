// Every change the app makes goes through this outbox, kept on the phone, so a
// change made without signal shows straight away and is sent later. Changes are
// sent in the order they were made. A refusal from the database (say, the row was
// deleted on the other phone) drops that change; no connection stops and retries.

import { supabase } from './supabase'
import { addOp, type Op } from './ops'

export type { Op } from './ops'

const OUTBOX = 'ff-outbox'

export function readOps(): Op[] {
  try {
    const raw = localStorage.getItem(OUTBOX)
    // Ticks queued before the outbox held other changes had no kind.
    return raw ? (JSON.parse(raw) as Op[]).map((o) => ('kind' in o ? o : { ...(o as object), kind: 'check' }) as Op) : []
  } catch {
    return []
  }
}

function writeOps(ops: Op[]) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(ops))
  } catch {
    // Storage full or blocked: changes still go to the server when online.
  }
  window.dispatchEvent(new Event('ff-outbox'))
}

export function pendingCount() {
  return readOps().length
}

export function queue(op: Op) {
  writeOps(addOp(readOps(), op))
  return flush()
}

let flushing: Promise<void> | null = null

export function flush(): Promise<void> {
  flushing ??= doFlush().finally(() => {
    flushing = null
  })
  return flushing
}

async function send(op: Op) {
  const db = supabase
  switch (op.kind) {
    case 'check':
      return op.outcome === null
        ? db.from('task_checks').delete().match({ task_id: op.taskId, year: op.year, month: op.month })
        : db.from('task_checks').upsert(
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
    case 'plan-insert':
      // Ids are made on the phone, so sending twice is harmless.
      return db.from('plan_items').upsert(op.row, { onConflict: 'id', ignoreDuplicates: true })
    case 'plan-update':
      return db.from('plan_items').update(op.patch).eq('id', op.id)
    case 'plan-delete':
      return db.from('plan_items').delete().eq('id', op.id)
    case 'plant-insert':
      return db.from('plants').upsert(op.row, { onConflict: 'id', ignoreDuplicates: true })
    case 'clear-checks':
      return db
        .from('task_checks')
        .update({ cleared_at: op.at })
        .eq('garden_id', op.gardenId)
        .eq('year', op.year)
        .eq('month', op.month)
        .in('task_id', op.taskIds)
    case 'plan-clear':
      return db.from('plan_items').update({ cleared_at: op.at }).in('id', op.ids)
  }
}

async function doFlush() {
  for (;;) {
    const ops = readOps()
    if (ops.length === 0) return
    const op = ops[0]
    const { error } = await send(op)
    if (error && !error.code) return
    // Remove what was sent (or refused), unless it was changed again meanwhile.
    const sent = JSON.stringify(op)
    writeOps(readOps().filter((o) => JSON.stringify(o) !== sent))
  }
}

export function clearOutbox() {
  try {
    localStorage.removeItem(OUTBOX)
  } catch {
    // ignore
  }
}
