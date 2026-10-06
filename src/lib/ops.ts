// The changes waiting in the outbox (outbox.ts), and how a new change folds into
// them. Pure, so it can be tested without a database (scripts/plan.test.ts).

import { checkKey, type Outcome } from './month.ts'

export type Op =
  | {
      kind: 'check'
      gardenId: string
      taskId: string
      year: number
      month: number
      outcome: Outcome | null // null removes the tick
      doneBy: string
      at: string
    }
  | { kind: 'plan-insert'; row: Record<string, unknown> & { id: string } }
  | { kind: 'plan-update'; id: string; patch: Record<string, unknown> }
  | { kind: 'plan-delete'; id: string }
  | { kind: 'plant-insert'; row: Record<string, unknown> & { id: string } }
  // Clear checked off: hide these ticks (one month) or plan items. Nothing is deleted.
  | { kind: 'clear-checks'; gardenId: string; year: number; month: number; taskIds: string[]; at: string }
  | { kind: 'plan-clear'; ids: string[]; at: string }
  | { kind: 'planting-insert'; row: Record<string, unknown> & { id: string } }
  | { kind: 'planting-delete'; id: string }
  // Voice notes: a one-off task, or a journal note under a month.
  | { kind: 'task-insert'; row: Record<string, unknown> & { id: string } }
  | { kind: 'task-delete'; id: string }
  // A task's site (set from its note on To do, or the site page).
  | { kind: 'task-update'; id: string; patch: Record<string, unknown> }
  | { kind: 'note-insert'; row: Record<string, unknown> & { id: string } }
  | { kind: 'note-delete'; id: string }
  // What's growing at a site (sites.existing), edited on the Plants map.
  | { kind: 'site-update'; id: string; patch: Record<string, unknown> }
  // "In flower" marks for a plant in a month.
  | { kind: 'bloom-insert'; row: Record<string, unknown> & { id: string } }
  | { kind: 'bloom-delete'; id: string }

const INSERT_FOR = {
  'planting-delete': 'planting-insert',
  'task-delete': 'task-insert',
  'note-delete': 'note-insert',
  'bloom-delete': 'bloom-insert',
} as const

// Folds a new change into what's waiting, so the outbox never sends work that a
// later change undoes: a second tick on the same task and month replaces the
// first, edits to a row not yet sent join its insert, and deleting a row not yet
// sent just forgets it.
export function addOp(ops: Op[], op: Op): Op[] {
  switch (op.kind) {
    case 'check': {
      const key = checkKey(op.taskId, op.year, op.month)
      return [...ops.filter((o) => !(o.kind === 'check' && checkKey(o.taskId, o.year, o.month) === key)), op]
    }
    case 'plan-update': {
      const insert = ops.find((o): o is Extract<Op, { kind: 'plan-insert' }> => o.kind === 'plan-insert' && o.row.id === op.id)
      if (insert) return ops.map((o) => (o === insert ? { ...insert, row: { ...insert.row, ...op.patch } } : o))
      const update = ops.find((o) => o.kind === 'plan-update' && o.id === op.id)
      if (update && update.kind === 'plan-update')
        return [...ops.filter((o) => o !== update), { ...op, patch: { ...update.patch, ...op.patch } }]
      return [...ops, op]
    }
    case 'plan-delete': {
      const wasNew = ops.some((o) => o.kind === 'plan-insert' && o.row.id === op.id)
      const rest = ops.filter(
        (o) => !((o.kind === 'plan-insert' && o.row.id === op.id) || (o.kind === 'plan-update' && o.id === op.id)),
      )
      return wasNew ? rest : [...rest, op]
    }
    case 'task-update': {
      // An unsent new task takes the change into its insert; later edits win.
      const insert = ops.find((o): o is Extract<Op, { kind: 'task-insert' }> => o.kind === 'task-insert' && o.row.id === op.id)
      if (insert) return ops.map((o) => (o === insert ? { ...insert, row: { ...insert.row, ...op.patch } } : o))
      const earlier = ops.find((o) => o.kind === 'task-update' && o.id === op.id)
      if (earlier && earlier.kind === 'task-update')
        return [...ops.filter((o) => o !== earlier), { ...op, patch: { ...earlier.patch, ...op.patch } }]
      return [...ops, op]
    }
    case 'site-update': {
      // Later edits to the same site win; one update goes out.
      const earlier = ops.find((o) => o.kind === 'site-update' && o.id === op.id)
      if (earlier && earlier.kind === 'site-update')
        return [...ops.filter((o) => o !== earlier), { ...op, patch: { ...earlier.patch, ...op.patch } }]
      return [...ops, op]
    }
    case 'planting-delete':
    case 'task-delete':
    case 'note-delete':
    case 'bloom-delete': {
      const insert = INSERT_FOR[op.kind]
      const isIt = (o: Op) => o.kind === insert && 'row' in o && o.row.id === op.id
      // A task's ticks waiting to be sent go with it.
      const tickOf = (o: Op) => op.kind === 'task-delete' && o.kind === 'check' && o.taskId === op.id
      const wasNew = ops.some(isIt)
      const rest = ops.filter((o) => !isIt(o) && !(wasNew && tickOf(o)))
      return wasNew ? rest : [...rest, op]
    }
    default:
      return [...ops, op]
  }
}
