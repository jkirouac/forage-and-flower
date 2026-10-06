// node --test scripts/notes.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanItems, intoWindow, rawNote, toOps } from '../src/lib/notes.ts'
import { addOp, type Op } from '../src/lib/ops.ts'

const today = { year: 2026, month: 10 }
const known = { plantIds: new Set(['camas', 'aster']), ruleIds: new Set(['no-castings']), today }

test('a month already past this year means next year', () => {
  assert.deepEqual(intoWindow(today, 2026, 3), { year: 2027, month: 3 })
  assert.deepEqual(intoWindow(today, 2026, 11), { year: 2026, month: 11 })
  assert.deepEqual(intoWindow(today, 2031, 11), { year: 2026, month: 11 })
  assert.deepEqual(intoWindow(today, 2027, 10), { year: 2026, month: 10 })
  assert.deepEqual(intoWindow(today, 'soon', 13), today)
})

test("Claude's reply keeps only this garden's plants and rules", () => {
  const items = cleanItems(
    {
      items: [
        { kind: 'task', section: 'buy', text: ' Pick up fir mulch ', year: 2026, month: 11, plant_ids: ['made-up'], clashes: [] },
        { kind: 'note', section: 'do', text: 'Camas by the path came up thin.', year: 2026, month: 10, plant_ids: ['camas', 'camas'], clashes: [{ rule_id: 'invented', text: 'x' }] },
        { kind: 'task', section: 'weed', text: 'Castings on the berm', month: 4, plant_ids: [], clashes: [{ rule_id: 'no-castings', text: 'Site 4 is a lean site: no castings.' }] },
        { kind: 'task', text: '   ' },
      ],
    },
    known,
  )
  assert.equal(items.length, 3)
  assert.deepEqual(items[0], { kind: 'task', section: 'buy', text: 'Pick up fir mulch', year: 2026, month: 11, plant_ids: [], clashes: [], site_id: null })
  assert.deepEqual([items[1].section, items[1].plant_ids, items[1].clashes], [null, ['camas'], []])
  assert.deepEqual([items[2].section, items[2].year, items[2].clashes.length], ['do', 2027, 1])
})

test('a reply that is not the expected shape gives nothing', () => {
  assert.deepEqual(cleanItems(null, known), [])
  assert.deepEqual(cleanItems({ items: 'no' }, known), [])
})

test('without Claude, what was said is saved as a note this month', () => {
  assert.deepEqual(rawNote('  the camas uh came up thin ', today), {
    kind: 'note', section: null, text: 'the camas uh came up thin', year: 2026, month: 10, plant_ids: [], clashes: [],
  })
})

test('reviewed items save as a one-off task and a note, with what was said', () => {
  const ops = toOps(
    [
      { kind: 'task', section: 'buy', text: 'Fir mulch', year: 2026, month: 11, plant_ids: [], clashes: [] },
      { kind: 'note', section: null, text: 'Camas came up thin.', year: 2026, month: 10, plant_ids: ['camas'], clashes: [] },
    ],
    'um fir mulch and the camas',
    'g1',
    'u1',
    '2026-10-05T10:00:00Z',
  )
  assert.equal(ops[0].kind, 'task-insert')
  assert.equal(ops[1].kind, 'note-insert')
  const task = (ops[0] as Extract<Op, { kind: 'task-insert' }>).row
  assert.deepEqual(
    [task.section, task.title, task.month, task.year, task.every_month, task.spoken, task.created_by],
    ['buy', 'Fir mulch', 11, 2026, false, 'um fir mulch and the camas', 'u1'],
  )
  const note = (ops[1] as Extract<Op, { kind: 'note-insert' }>).row
  assert.deepEqual([note.text, note.written_by, note.written_at], ['Camas came up thin.', 'u1', '2026-10-05T10:00:00Z'])
})

test('removing an unsent note or task forgets it, and the task takes its ticks along', () => {
  const [task, note] = toOps(
    [
      { kind: 'task', section: 'do', text: 'A', year: 2026, month: 10, plant_ids: [], clashes: [] },
      { kind: 'note', section: null, text: 'B', year: 2026, month: 10, plant_ids: [], clashes: [] },
    ],
    '',
    'g1',
    'u1',
  )
  const taskId = (task as Extract<Op, { kind: 'task-insert' }>).row.id
  const noteId = (note as Extract<Op, { kind: 'note-insert' }>).row.id
  let ops: Op[] = [task, note]
  ops = addOp(ops, { kind: 'check', gardenId: 'g1', taskId, year: 2026, month: 10, outcome: 'done', doneBy: 'u1', at: 'now' })
  ops = addOp(ops, { kind: 'task-delete', id: taskId })
  ops = addOp(ops, { kind: 'note-delete', id: noteId })
  assert.deepEqual(ops, [])
  // Already sent: the delete goes out.
  assert.deepEqual(addOp([], { kind: 'note-delete', id: 'sent' }), [{ kind: 'note-delete', id: 'sent' }])
})

test('a task about one site gets that site; a note, or a site the garden lacks, gets none', () => {
  const sites = new Map([[4, 'site-4']])
  const items = cleanItems(
    {
      items: [
        { kind: 'task', section: 'do', text: 'Weed the berm', year: 2026, month: 10, site_number: 4, plant_ids: [], clashes: [] },
        { kind: 'task', section: 'do', text: 'Crank the worm bin', year: 2026, month: 10, site_number: 0, plant_ids: [], clashes: [] },
        { kind: 'task', section: 'do', text: 'Somewhere odd', year: 2026, month: 10, site_number: 42, plant_ids: [], clashes: [] },
        { kind: 'note', section: 'none', text: 'Berm looks dry', year: 2026, month: 10, site_number: 4, plant_ids: [], clashes: [] },
      ],
    },
    { ...known, sites },
  )
  assert.deepEqual(items.map((i) => i.site_id), ['site-4', null, null, null])
  const [op] = toOps([items[0]], '', 'g1', 'u1')
  assert.equal((op as Extract<Op, { kind: 'task-insert' }>).row.site_id, 'site-4')
})
