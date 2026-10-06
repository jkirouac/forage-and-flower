// node --test scripts/pollinators.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloomByMonth, criticalLabels, gaps, isCritical, markedMonths, monthFromHash, monthPlants, noBloomMonths, ourPlants, rankPicks, withMarks } from '../src/lib/pollinators.ts'
import type { FullPlant } from '../src/lib/plants.ts'

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

test('critical windows from the rubric', () => {
  assert.equal(isCritical(2), true)
  assert.equal(criticalLabels(12).length, 2)
  assert.equal(criticalLabels(3).length, 2)
  assert.equal(isCritical(7), false)
})

test('picks follow the ranking, then threat tier for ties and unranked plants', () => {
  const picks = rankPicks([
    plant('Unranked high', { threat_tier: 'high' }),
    plant('Second', { rank: 2 }),
    plant('Tied medium', { rank: 1, threat_tier: 'medium' }),
    plant('Tied high', { rank: 1, threat_tier: 'high' }),
    plant('Not a pick'),
  ])
  assert.deepEqual(picks.map((p) => p.common), ['Tied high', 'Tied medium', 'Second', 'Unranked high'])
})

test('what flowers each month, and critical months with nothing in flower', () => {
  const plants = [plant('Mahonia', { bloom_months: [2, 3] }), plant('Aster', { bloom_months: [9, 10] })]
  const bloom = bloomByMonth(plants)
  assert.deepEqual(bloom[1].map((p) => p.common), ['Mahonia'])
  assert.deepEqual(bloom[6], [])
  assert.deepEqual(gaps(plants), [1, 4, 11, 12])
})

test('our garden counts every plant of ours, ranked or not, and keeps in the ground apart from planned', () => {
  const sage = plant('Sage', { bloom_months: [6, 7] })
  const camas = plant('Great Camas', { rank: 3, bloom_months: [4, 5] })
  const hellebore = plant('Hellebore', { rank: 9, threat_tier: 'high', bloom_months: [12, 1, 2] })
  const heather = plant('Winter Heather', { rank: 5, bloom_months: [12, 1, 2, 3] })
  const aster = plant('Douglas Aster', { rank: 2, bloom_months: [9, 10] })
  const plants = [sage, camas, hellebore, heather, aster]
  const ours = ourPlants(
    plants,
    [
      { plant_id: 'Great Camas', status: 'to buy' },
      { plant_id: 'Douglas Aster', status: 'planted' },
    ],
    [],
    [{ existing: ['Sage'] }],
  )
  assert.deepEqual(ours.inGround.map((p) => p.id), ['Douglas Aster', 'Sage'])
  assert.deepEqual(ours.planned.map((p) => p.id), ['Great Camas'])

  const ranked = rankPicks(plants)
  const dec = monthPlants(12, ours, ranked)
  assert.deepEqual([dec.inFlower, dec.planned].map((l) => l.length), [0, 0])
  assert.deepEqual(dec.couldAdd.map((p) => p.id), ['Winter Heather', 'Hellebore'])
  const apr = monthPlants(4, ours, ranked)
  assert.deepEqual(apr.planned.map((p) => p.id), ['Great Camas'])
  assert.deepEqual(monthPlants(7, ours, ranked).inFlower.map((p) => p.id), ['Sage'])
})

test('ours with no flowering months are counted so an empty month is not mistaken for a gap', () => {
  const ours = { inGround: [plant('Loquat'), plant('Sage', { bloom_months: [6] })], planned: [] }
  assert.deepEqual(noBloomMonths(ours).map((p) => p.id), ['Loquat'])
})

test('the chosen month lives in the address', () => {
  assert.equal(monthFromHash('#pollinators/month/12'), 12)
  assert.equal(monthFromHash('#pollinators/month/13'), null)
  assert.equal(monthFromHash('#pollinators'), null)
})

test('a mark widens a plant\'s flowering months and makes it ours', () => {
  const bee = plant('Bee Balm', { bloom_months: [6, 7, 8] })
  const sun = plant('Sunflower')
  const marks = [
    { plant_id: 'Bee Balm', month: 10 },
    { plant_id: 'Sunflower', month: 10 },
    { plant_id: 'Sunflower', month: 9 },
  ]
  const seen = withMarks([bee, sun], marks)
  assert.deepEqual(seen.map((p) => p.bloom_months), [[6, 7, 8, 10], [9, 10]])
  assert.deepEqual(markedMonths('Sunflower', marks), [9, 10])
  const ours = ourPlants(seen, [], [], [], marks)
  assert.deepEqual(ours.inGround.map((p) => p.id), ['Bee Balm', 'Sunflower'])
  assert.deepEqual(monthPlants(10, ours, []).inFlower.map((p) => p.id), ['Bee Balm', 'Sunflower'])
})
