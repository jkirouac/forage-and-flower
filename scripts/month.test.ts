// node --test scripts/month.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMonth, openCount, previousMonth, nextMonth, upcomingMonths, shownItems, pushOrigin, moveTicks, type Check, type Task } from '../src/lib/month.ts'

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  section: 'do',
  title: id,
  detail: null,
  link: null,
  month: 10,
  every_month: false,
  position: 0,
  ...extra,
})

const check = (task_id: string, year: number, month: number, outcome: Check['outcome'] = 'done'): Check => ({
  task_id,
  year,
  month,
  outcome,
  done_by: 'u1',
  done_at: '2026-10-05T00:00:00Z',
  cleared_at: null,
})

test('a month shows its own tasks and every-month tasks, by section', () => {
  const list = buildMonth(
    [task('prune', { month: 1 }), task('garlic', { section: 'plant' }), task('crank', { month: null, every_month: true })],
    [],
    2026,
    10,
  )
  assert.deepEqual(list.do.map((i) => i.task.id), ['crank'])
  assert.deepEqual(list.plant.map((i) => i.task.id), ['garlic'])
  assert.deepEqual(list.buy, [])
})

test('ticks belong to one month of one year', () => {
  const tasks = [task('crank', { month: null, every_month: true })]
  const checks = [check('crank', 2026, 9), check('crank', 2025, 10)]
  assert.equal(buildMonth(tasks, checks, 2026, 10).do[0].check, null)
  assert.equal(buildMonth(tasks, checks, 2026, 9).do[0].check?.outcome, 'done')
})

test('a task pushed last month shows this month, marked where it came from', () => {
  const tasks = [task('mulch', { month: 9 })]
  const list = buildMonth(tasks, [check('mulch', 2026, 9, 'pushed')], 2026, 10)
  assert.equal(list.do[0].task.id, 'mulch')
  assert.equal(list.do[0].pushedFrom, 9)
  assert.equal(list.do[0].check, null)
})

test('pushing from December lands in January of the next year', () => {
  const list = buildMonth([task('plan', { month: 12 })], [check('plan', 2026, 12, 'pushed')], 2027, 1)
  assert.equal(list.do[0].pushedFrom, 12)
})

test('a pushed task can be pushed again, and leaves the month it was pushed from', () => {
  const tasks = [task('mulch', { month: 9 })]
  const checks = [check('mulch', 2026, 9, 'pushed'), check('mulch', 2026, 10, 'pushed')]
  assert.equal(buildMonth(tasks, checks, 2026, 10).do[0].check?.outcome, 'pushed')
  assert.equal(buildMonth(tasks, checks, 2026, 11).do[0].pushedFrom, 10)
  assert.equal(buildMonth(tasks, checks, 2026, 12).do.length, 0)
})

test('an every-month task pushed last month is not labelled as carried over', () => {
  const tasks = [task('crank', { month: null, every_month: true })]
  const list = buildMonth(tasks, [check('crank', 2026, 9, 'pushed')], 2026, 10)
  assert.equal(list.do.length, 1)
  assert.equal(list.do[0].pushedFrom, null)
})

test('carried-over first, then every-month, then the schedule order', () => {
  const tasks = [
    task('b', { position: 1 }),
    task('a', { position: 0 }),
    task('crank', { month: null, every_month: true }),
    task('late', { month: 9, position: 5 }),
  ]
  const list = buildMonth(tasks, [check('late', 2026, 9, 'pushed')], 2026, 10)
  assert.deepEqual(list.do.map((i) => i.task.id), ['late', 'crank', 'a', 'b'])
})

test('open count leaves out done and pushed tasks', () => {
  const tasks = [task('a'), task('b'), task('c')]
  const list = buildMonth(tasks, [check('a', 2026, 10), check('b', 2026, 10, 'pushed')], 2026, 10)
  assert.equal(openCount(list), 1)
})

test('month arithmetic wraps the year', () => {
  assert.deepEqual(previousMonth(2027, 1), { year: 2026, month: 12 })
  assert.deepEqual(nextMonth(2026, 12), { year: 2027, month: 1 })
})

test('upcoming months run on from this one, over the new year', () => {
  assert.deepEqual(upcomingMonths(2026, 11, 3), [
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
    { year: 2027, month: 1 },
  ])
})

test('a pushed task leaves its month when the next month is on screen', () => {
  const tasks = [task('mulch'), task('prune')]
  const checks = [check('mulch', 2026, 10, 'pushed')]
  const oct = buildMonth(tasks, checks, 2026, 10)
  assert.deepEqual(shownItems(oct.do, true, false).map((i) => i.task.id), ['prune'])
  assert.deepEqual(shownItems(oct.do, false, false).map((i) => i.task.id), ['mulch', 'prune'])
  assert.equal(buildMonth(tasks, checks, 2026, 11).do[0].pushedFrom, 10)
})

test('moving a task later pushes it through each month on the way', () => {
  const oct = { year: 2026, month: 10 }
  assert.deepEqual(moveTicks(oct, oct, { year: 2026, month: 12 }), [
    { year: 2026, month: 10, outcome: 'pushed' },
    { year: 2026, month: 11, outcome: 'pushed' },
  ])
  assert.deepEqual(moveTicks({ year: 2026, month: 12 }, { year: 2026, month: 12 }, { year: 2027, month: 1 }), [
    { year: 2026, month: 12, outcome: 'pushed' },
  ])
})

test('moving it back removes those pushes, but never before where it started', () => {
  const checks = [check('mulch', 2026, 10, 'pushed'), check('mulch', 2026, 11, 'pushed')]
  const origin = pushOrigin(checks, 'mulch', 2026, 12)
  assert.deepEqual(origin, { year: 2026, month: 10 })
  assert.deepEqual(moveTicks(origin, { year: 2026, month: 12 }, { year: 2026, month: 10 }), [
    { year: 2026, month: 10, outcome: null },
    { year: 2026, month: 11, outcome: null },
  ])
  assert.equal(moveTicks(origin, { year: 2026, month: 12 }, { year: 2026, month: 9 }), null)
  assert.deepEqual(moveTicks(origin, { year: 2026, month: 12 }, { year: 2026, month: 12 }), [])
})
