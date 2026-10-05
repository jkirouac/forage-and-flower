// node --test scripts/pollinators.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloomByMonth, criticalLabels, gaps, isCritical, rankPicks } from '../src/lib/pollinators.ts'
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
