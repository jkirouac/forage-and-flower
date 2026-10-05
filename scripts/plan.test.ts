// node --test scripts/plan.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countByStatus,
  currentSeason,
  groupByNursery,
  nextSeason,
  nextStatus,
  plantKey,
  qtyLabel,
  seasonLabel,
  seasonOptions,
  type PlanItem,
} from '../src/lib/plan.ts'
import { addOp, type Op } from '../src/lib/ops.ts'
import { clearSummary } from '../src/lib/clear.ts'

const item = (id: string, extra: Partial<PlanItem> = {}): PlanItem => ({
  id,
  garden_id: 'g',
  plant_id: 'p-' + id,
  site_id: null,
  season: 'fall-2026',
  status: 'to buy',
  qty_min: 1,
  qty_max: 1,
  nursery_id: null,
  spot: null,
  notes: null,
  ...extra,
})

test('season labels and order', () => {
  assert.equal(seasonLabel('fall-2026'), 'Fall 2026')
  assert.equal(seasonLabel('spring-2027'), 'Spring 2027')
  assert.equal(nextSeason('fall-2026'), 'spring-2027')
  assert.equal(nextSeason('spring-2027'), 'fall-2027')
})

test('the current season follows the planting year', () => {
  assert.equal(currentSeason(new Date(2026, 9, 5)), 'fall-2026')
  assert.equal(currentSeason(new Date(2027, 0, 10)), 'spring-2027')
  assert.equal(currentSeason(new Date(2027, 6, 31)), 'spring-2027')
  assert.equal(currentSeason(new Date(2027, 7, 1)), 'fall-2027')
})

test('season choices include this season and the next, in order', () => {
  const items = [item('a', { season: 'spring-2027' }), item('b', { season: 'spring-2026' })]
  assert.deepEqual(seasonOptions(items, new Date(2026, 9, 5)), ['spring-2026', 'fall-2026', 'spring-2027'])
})

test('quantities and the next step at the nursery', () => {
  assert.equal(qtyLabel(2, 2), '2')
  assert.equal(qtyLabel(2, 3), '2–3')
  assert.equal(nextStatus('to buy'), 'bought')
  assert.equal(nextStatus('bought'), 'planted')
  assert.equal(nextStatus('planted'), null)
  assert.equal(nextStatus('skipped'), null)
})

test('grouped by nursery name, no nursery last, still-to-buy first', () => {
  const nurseries = [
    { id: 'n1', name: 'Satinflower', location: null, last_checked: null },
    { id: 'n2', name: 'Fruit Trees and More', location: null, last_checked: null },
  ]
  const plants = [
    { id: 'p-a', key: 'a', common: 'Zinnia', latin: null, kind: 'edible' },
    { id: 'p-b', key: 'b', common: 'Aster', latin: null, kind: 'edible' },
    { id: 'p-c', key: 'c', common: 'Camas', latin: null, kind: 'bulb' },
  ]
  const groups = groupByNursery(
    [
      item('a', { nursery_id: 'n1' }),
      item('b', { nursery_id: 'n1', status: 'bought' }),
      item('c', { nursery_id: 'n2' }),
      item('d'),
      item('e', { nursery_id: 'gone' }),
    ],
    nurseries,
    plants,
  )
  assert.deepEqual(groups.map((g) => g.nursery?.name ?? null), ['Fruit Trees and More', 'Satinflower', null])
  assert.deepEqual(groups[1].items.map((i) => i.id), ['a', 'b'])
  assert.deepEqual(groups[2].items.map((i) => i.id).sort(), ['d', 'e'])
})

test('counts by status', () => {
  const c = countByStatus([item('a'), item('b', { status: 'planted' }), item('c')])
  assert.equal(c['to buy'], 2)
  assert.equal(c.planted, 1)
})

test('catalogue keys for plants added in the app', () => {
  assert.equal(plantKey("Bee Balm 'Jacob Cline'", new Set()), 'bee-balm-jacob-cline')
  assert.equal(plantKey('Mâche', new Set(['mache'])), 'mache-2')
})

test('outbox: a second tick on the same task and month replaces the first', () => {
  const tick = (outcome: 'done' | null): Op => ({
    kind: 'check', gardenId: 'g', taskId: 't', year: 2026, month: 10, outcome, doneBy: 'u', at: 'x',
  })
  const ops = addOp(addOp([], tick('done')), tick(null))
  assert.equal(ops.length, 1)
  assert.equal(ops[0].kind === 'check' && ops[0].outcome, null)
})

test('outbox: edits to an unsent new item join it, and deleting it forgets it', () => {
  let ops = addOp([], { kind: 'plan-insert', row: { id: 'i', qty_min: 1 } })
  ops = addOp(ops, { kind: 'plan-update', id: 'i', patch: { qty_min: 3 } })
  assert.equal(ops.length, 1)
  assert.equal(ops[0].kind === 'plan-insert' && ops[0].row.qty_min, 3)
  ops = addOp(ops, { kind: 'plan-delete', id: 'i' })
  assert.deepEqual(ops, [])
})

test('outbox: edits to a saved item merge, and deleting it replaces them', () => {
  let ops = addOp([], { kind: 'plan-update', id: 's', patch: { status: 'bought' } })
  ops = addOp(ops, { kind: 'plan-update', id: 's', patch: { qty_min: 2 } })
  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0].kind === 'plan-update' && ops[0].patch, { status: 'bought', qty_min: 2 })
  ops = addOp(ops, { kind: 'plan-delete', id: 's' })
  assert.deepEqual(ops, [{ kind: 'plan-delete', id: 's' }])
})

test('clear: the button is yours once you checked something off; others need a confirm', () => {
  assert.deepEqual(clearSummary(['me', 'me', 'them'], 'me'), { mine: 2, others: 1, total: 3 })
  assert.deepEqual(clearSummary(['them'], 'me'), { mine: 0, others: 1, total: 1 })
})

test('clear: unknown names count as yours', () => {
  assert.deepEqual(clearSummary([null, 'them'], 'me'), { mine: 1, others: 1, total: 2 })
  assert.deepEqual(clearSummary(['them'], null), { mine: 1, others: 0, total: 1 })
})
