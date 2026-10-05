// node --test scripts/plants.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  baseName,
  matchesSearch,
  plantingMonths,
  rulesFor,
  splitPlants,
  taskForPlanting,
  taskNamesPlant,
  type FullPlant,
  type Rule,
} from '../src/lib/plants.ts'
import type { Task } from '../src/lib/month.ts'
import { addOp } from '../src/lib/ops.ts'

const plant = (common: string, extra: Partial<FullPlant> = {}): FullPlant => ({
  id: common,
  key: common,
  common,
  latin: null,
  kind: 'perennial flower',
  native: false,
  tags: [],
  plant_months: [],
  bloom_months: [],
  pollinator_months: [],
  threat_tier: null,
  threat_reason: null,
  rank: null,
  why: null,
  ...extra,
})

const task = (title: string, extra: Partial<Task> = {}): Task => ({
  id: title,
  section: 'plant',
  title,
  detail: null,
  link: null,
  month: 10,
  every_month: false,
  position: 0,
  ...extra,
})

const rule = (id: string, extra: Partial<Rule>): Rule => ({
  id,
  topic: 'biochar',
  verdict: 'no',
  text: id,
  plant_id: null,
  tag: null,
  kind: null,
  garden_id: null,
  site_id: null,
  ...extra,
})

test('the name a schedule line would use', () => {
  assert.equal(baseName("Sour Cherry 'Evans (Bali)'"), 'sour cherry')
  assert.equal(baseName('Great Camas'), 'great camas')
})

test('a task names a plant by whole words, plural allowed', () => {
  assert.equal(taskNamesPlant(task('Transplant: Loquat, potted fig (early October)'), plant('Loquat')), true)
  assert.equal(taskNamesPlant(task('Direct sow: Broad Beans, Peas, Mesclun'), plant('Pea')), true)
  assert.equal(taskNamesPlant(task('Harvest peaches'), plant('Pea')), false)
  assert.equal(taskNamesPlant(task('Plant the sour cherry at the island'), plant("Sour Cherry 'Evans (Bali)'")), true)
})

test('planting months come from the catalogue and the schedule', () => {
  const p = plant('Garlic', { plant_months: [11] })
  const months = plantingMonths(p, [task('Plant garlic', { month: 10 }), task('Harvest garlic', { section: 'do', month: 7 })])
  assert.deepEqual(months, [10, 11])
})

test('a planting finishes a Plant task that names it, before any other', () => {
  const p = plant('Loquat')
  const open = [task('Water the loquat', { section: 'do' }), task('Transplant: Loquat, potted fig')]
  assert.equal(taskForPlanting(open, p)?.title, 'Transplant: Loquat, potted fig')
  assert.equal(taskForPlanting([task('Plant garlic')], p), null)
})

test('rules: the plant’s own, then its sites, then the whole garden', () => {
  const p = plant('Salal', { id: 'salal', tags: ['acid-loving'] })
  const rules = [
    rule('garden-wide', { garden_id: 'g' }),
    rule('site-9', { garden_id: 'g', site_id: 's9' }),
    rule('site-2', { garden_id: 'g', site_id: 's2' }),
    rule('site-4', { garden_id: 'g', site_id: 's4' }),
    rule('acid', { tag: 'acid-loving' }),
    rule('mediterranean', { tag: 'mediterranean subshrub' }),
  ]
  const shown = rulesFor(p, rules, ['s9', 's2'], (id) => Number(id.slice(1)))
  assert.deepEqual(shown.map((r) => r.id), ['acid', 'site-2', 'site-9', 'garden-wide'])
})

test('your plants first, then the rest, each by name; search by either name', () => {
  const plants = [plant('Zinnia'), plant('Aster'), plant('Camas', { latin: 'Camassia quamash' })]
  const { yours, others } = splitPlants(plants, new Set(['Zinnia', 'Camas']))
  assert.deepEqual(yours.map((p) => p.common), ['Camas', 'Zinnia'])
  assert.deepEqual(others.map((p) => p.common), ['Aster'])
  assert.equal(matchesSearch(plants[2], 'quamash'), true)
  assert.equal(matchesSearch(plants[2], 'aster'), false)
})

test('outbox: removing a log entry not yet sent just forgets it', () => {
  const ops = addOp([], { kind: 'planting-insert', row: { id: 'x' } })
  assert.deepEqual(addOp(ops, { kind: 'planting-delete', id: 'x' }), [])
  assert.deepEqual(addOp([], { kind: 'planting-delete', id: 'y' }), [{ kind: 'planting-delete', id: 'y' }])
})
