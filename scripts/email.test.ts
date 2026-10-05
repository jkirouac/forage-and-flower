// node --test scripts/email.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEmail, recap, type EmailData } from '../src/lib/email.ts'
import type { Task, Check } from '../src/lib/month.ts'
import type { PlanItem } from '../src/lib/plan.ts'

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

const check = (task_id: string, month: number, outcome: Check['outcome'], done_by = 'u1'): Check => ({
  task_id,
  year: 2026,
  month,
  outcome,
  done_by,
  done_at: '2026-09-20T00:00:00Z',
  cleared_at: null,
})

const item = (id: string, extra: Partial<PlanItem> = {}): PlanItem => ({
  id,
  garden_id: 'g',
  plant_id: 'camas',
  site_id: null,
  season: 'fall-2026',
  status: 'to buy',
  qty_min: 3,
  qty_max: 3,
  nursery_id: 'n1',
  spot: null,
  notes: null,
  cleared_at: null,
  status_by: null,
  ...extra,
})

const data = (extra: Partial<EmailData> = {}): EmailData => ({
  gardenName: 'Tea House Garden',
  region: 'Victoria, BC',
  zone: '9a',
  members: { u1: 'JK', u2: 'JD' },
  tasks: [
    task('Trim nepeta'),
    task('Plant garlic', { section: 'plant' }),
    task('Crank the worm bin', { month: null, every_month: true }),
    task('Mulch the berm', { month: 9 }),
    task('Prune raspberries', { month: 1 }),
    task('Harvest mason bee cocoons', { link: 'https://www.youtube.com/watch?v=9_1WlEDTyhk' }),
  ],
  checks: [check('Mulch the berm', 9, 'pushed'), check('Prune raspberries', 9, 'done'), check('Trim nepeta', 9, 'done', 'u2')],
  items: [item('a'), item('b', { qty_min: 7, qty_max: 7 }), item('c', { status: 'bought' })],
  plants: [{ id: 'camas', key: 'camas', common: 'Great Camas', latin: null, kind: 'bulb' }],
  nurseries: [{ id: 'n1', name: "Fraser's Thimble Farms", location: 'Salt Spring Island, BC', last_checked: null }],
  ...extra,
})

test('the month, its jobs, and tasks moved on from last month', () => {
  const { subject, html } = buildEmail(data(), 2026, 10)
  assert.equal(subject, 'Garden tasks — October 2026')
  assert.match(html, /Trim nepeta/)
  assert.match(html, /Plant garlic/)
  assert.match(html, /Crank the worm bin <span[^>]*>\(every month\)/)
  assert.match(html, /Mulch the berm <span[^>]*>\(moved on from September\)/)
  assert.doesNotMatch(html, /Prune raspberries/)
  assert.match(html, /img\.youtube\.com\/vi\/9_1WlEDTyhk/)
})

test('Buy: the list being shopped for, one line per nursery, a plant once', () => {
  const { html } = buildEmail(data(), 2026, 10)
  assert.match(html, /From the Fall 2026 list, 1 plant still to buy/)
  assert.match(html, /Fraser&#39;s Thimble Farms|Fraser's Thimble Farms/)
  assert.match(html, /Great Camas<\/td><td[^>]*>× 10</)
  assert.match(html, /Salt Spring Island, BC · 1 plant/)
  assert.doesNotMatch(buildEmail(data(), 2026, 7).html, /still to buy/)
})

test('a kind recap of last month, by initials', () => {
  assert.equal(recap(data(), 2026, 10), 'In September you ticked off 2 jobs (JK 1, JD 1).')
  assert.equal(recap(data({ checks: [] }), 2026, 10), null)
})

test('text is escaped', () => {
  const { html } = buildEmail(data({ tasks: [task('Sow <peas> & beans')] }), 2026, 10)
  assert.match(html, /Sow &lt;peas&gt; &amp; beans/)
})
