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
  availableFilters,
  describeFilters,
  linkPlantNames,
  matchesFilters,
  plantTraits,
  plantsByPlace,
  summarizeRules,
  whyBullets,
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
  size: null,
  pollinators: null,
  photo_url: null,
  photo_page: null,
  photo_credit: null,
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

test('at a glance: who it feeds from the Pollinators column, what it is like from the why', () => {
  const t = plantTraits({
    pollinators: 'butterflies, bumblebees, bees, Lep larval host, ~8 aster oligolege specialists',
    why: 'BC native; drought-tolerant; persistent seedheads; edible/tea',
    native: true,
  })
  assert.deepEqual(t.pollinators.map((x) => x.key), ['bumblebee', 'bee', 'specialist', 'butterfly', 'caterpillar'])
  assert.deepEqual(t.traits.map((x) => x.key), ['native', 'drought', 'edible', 'seedheads'])
  assert.deepEqual(
    plantTraits({ pollinators: 'hummingbirds, bees', why: null, native: false }).pollinators.map((x) => x.key),
    ['bee', 'hummingbird'],
  )
})

test('why as short bullets', () => {
  assert.deepEqual(whyBullets('Pithy Lamiaceae stems = cavity-nesting habitat; triple pollinator; drought-tolerant'), [
    'Pithy Lamiaceae stems: cavity-nesting habitat',
    'Triple pollinator',
    'Drought-tolerant',
  ])
})

test("rules as one Do line and one Don't line, without repeats", () => {
  const site = (id: string, extra: Partial<Rule>) => rule(id, { garden_id: 'g', site_id: 's2', ...extra })
  const { doLines, dontLines } = summarizeRules([
    site('a', { text: 'No biochar anywhere on this site: acidic, fungal woodland on a sulfur program.' }),
    site('b', { topic: 'castings', text: 'No worm castings: lean site. Over-fed natives flop and lose drought tolerance.' }),
    site('c', { topic: 'mulch', verdict: 'yes', text: 'Mulch with fine fir, 2–3". Never alder or cedar on the bed.' }),
    site('d', { topic: 'mulch', verdict: 'yes', text: 'Mulch with fine fir, 2–3". Never alder or cedar on the bed.' }),
    rule('e', { garden_id: 'g', text: 'Biochar goes in planting holes and potting mix only, never on bed surfaces.' }),
    rule('f', {
      garden_id: 'g',
      topic: 'compost',
      text: 'No rich compost (Sea Soil, manure) in planting holes on native beds. Use grit for drainage.',
    }),
  ])
  assert.deepEqual(doLines, ['Mulch with fine fir, 2–3"', 'Grit for drainage'])
  assert.deepEqual(dontLines, ['biochar', 'worm castings', 'alder or cedar on the bed', 'rich compost (Sea Soil, manure)'])
})

test('rules: biochar in planting holes only, when nothing says no biochar here', () => {
  const { doLines } = summarizeRules([
    rule('e', { garden_id: 'g', text: 'Biochar goes in planting holes and potting mix only, never on bed surfaces.' }),
  ])
  assert.deepEqual(doLines, ['Biochar only in planting holes and potting mix, not on the bed'])
})

test('plants by place: in the ground, on a list, the rest', () => {
  const plants = [plant('A'), plant('B'), plant('C'), plant('D'), plant('E')]
  const { inGround, onLists, others } = plantsByPlace(
    plants,
    [
      { plant_id: 'A', status: 'planted' },
      { plant_id: 'B', status: 'to buy' },
      { plant_id: 'D', status: 'skipped' },
    ],
    [
      { plant_id: 'C', action: 'planted', happened_on: '2026-04-01' },
      { plant_id: 'E', action: 'planted', happened_on: '2026-04-01' },
      { plant_id: 'E', action: 'died', happened_on: '2026-08-01' },
    ],
  )
  assert.deepEqual(inGround.map((p) => p.id), ['A', 'C'])
  assert.deepEqual(onLists.map((p) => p.id), ['B'])
  assert.deepEqual(others.map((p) => p.id), ['D', 'E'])
})

test('plant names in a task title become links, longest name first', () => {
  const plants = [
    { id: 'loquat', common: 'Loquat' },
    { id: 'fig', common: 'Fig' },
    { id: 'heather', common: 'Heather' },
    { id: 'winter-heather', common: 'Winter Heather' },
    { id: 'nepeta-wl', common: "Nepeta 'Walker's Low'" },
    { id: 'nepeta', common: 'Nepeta' },
  ]
  const linked = (title: string) => linkPlantNames(title, plants).map((p) => (p.plantId ? `[${p.text}:${p.plantId}]` : p.text)).join('')
  assert.equal(linked('Transplant: Loquat, potted fig (early October)'), 'Transplant: [Loquat:loquat], potted [fig:fig] (early October)')
  assert.equal(linked('Transplant: Hellebore, Winter Heather starts'), 'Transplant: Hellebore, [Winter Heather:winter-heather] starts')
  assert.equal(linked('Light trim of nepeta where it smothers'), 'Light trim of [nepeta:nepeta] where it smothers')
  assert.equal(linked('Harvest figs'), 'Harvest [figs:fig]')
  assert.equal(linked('Configure the bin'), 'Configure the bin')
})

test('edible: an edible kind, the why, or a fruit by name', () => {
  const edible = (extra: Partial<FullPlant>) => plantTraits(plant('x', extra)).traits.some((t) => t.key === 'edible')
  assert.equal(edible({ common: 'Good King Henry', kind: 'edible' }), true)
  assert.equal(edible({ common: "Sour Cherry 'Evans (Bali)'", kind: 'tree or shrub' }), true)
  assert.equal(edible({ common: 'Loquat', kind: 'tree or shrub' }), true)
  assert.equal(edible({ common: 'Fig', kind: 'tree or shrub' }), true)
  assert.equal(edible({ common: 'Agastache', why: 'drought-tolerant; edible/tea' }), true)
  assert.equal(edible({ common: 'Snowberry', kind: 'tree or shrub' }), false)
  assert.equal(edible({ common: 'Configure', kind: 'perennial flower' }), false)
})

test('filters: every chosen chip must match; unusable chips are hidden, chosen ones stay', () => {
  const plants = [
    plant('Aster', { pollinators: 'bees, butterflies', why: 'drought-tolerant' }),
    plant('Salvia', { pollinators: 'hummingbirds, bumblebees' }),
    plant('Kale', { kind: 'edible' }),
  ]
  assert.deepEqual(plants.filter((p) => matchesFilters(p, ['bees'])).map((p) => p.common), ['Aster', 'Salvia'])
  assert.deepEqual(plants.filter((p) => matchesFilters(p, ['bees', 'drought'])).map((p) => p.common), ['Aster'])
  assert.deepEqual(plants.filter((p) => matchesFilters(p, ['humans'])).map((p) => p.common), ['Kale'])
  const shown = availableFilters(plants, ['hummingbirds']).map((f) => f.key)
  assert.deepEqual(shown, ['bees', 'hummingbirds'])
  assert.ok(availableFilters([], ['nest']).some((f) => f.key === 'nest'))
})

test('the summary line reads like a sentence', () => {
  assert.equal(describeFilters(12, ['bees', 'drought']), '12 plants feed bees and are drought-tolerant.')
  assert.equal(describeFilters(1, ['bees', 'butterflies', 'nest']), '1 plant feeds bees and butterflies and has nesting stems for bees.')
  assert.equal(describeFilters(3, ['humans']), '3 plants feed us.')
})
