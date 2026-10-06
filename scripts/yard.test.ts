// node --test scripts/yard.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchPlant, siteContents, siteFromHash, siteLabel } from '../src/lib/yard.ts'
import type { FullPlant, Rule } from '../src/lib/plants.ts'

const plant = (id: string, common: string): FullPlant => ({
  id, key: id, common, latin: null, kind: 'perennial', native: false, tags: [], plant_months: [], bloom_months: [],
  pollinator_months: [], threat_tier: null, threat_reason: null, rank: null, why: null, size: null, pollinators: null,
  photo_url: null, photo_page: null, photo_credit: null,
})
const plants = [plant('sage', 'Sage'), plant('thyme', "Thyme 'Elfin'"), plant('camas', 'Great Camas'), plant('aster', 'Douglas Aster'), plant('kale', 'Perennial kale')]
const rule = (id: string, site_id: string | null): Rule => ({ id, topic: 'castings', verdict: 'no', text: 'No castings: lean site.', plant_id: null, tag: null, kind: null, garden_id: 'g', site_id })
const site = { id: 's1', number: 1, name: 'Under Maple', existing: ['Sage', 'Thyme', 'Chives'] }

test('notes names match catalogue plants by common name, ignoring a cultivar', () => {
  assert.equal(matchPlant('sage', plants), 'sage')
  assert.equal(matchPlant('Thyme', plants), 'thyme')
  assert.equal(matchPlant('Chives', plants), null)
})

test('a site holds what is planted there, what is planned there, and what the notes say grows there', () => {
  const c = siteContents(site, {
    plants,
    items: [
      { plant_id: 'camas', site_id: 's1', season: 'fall-2026', status: 'to buy' },
      { plant_id: 'aster', site_id: 's2', season: 'fall-2026', status: 'to buy' },
      { plant_id: 'kale', site_id: 's1', season: 'spring-2027', status: 'planted' },
    ],
    plantings: [],
    rules: [rule('r1', 's1'), rule('r2', 's2'), rule('r3', null)],
  })
  assert.deepEqual(c.inGround.map((p) => p.id), ['kale', 'sage', 'thyme'])
  assert.deepEqual(c.onLists.map((p) => p.id), ['camas'])
  assert.deepEqual(c.notesOnly, ['Chives'])
  assert.deepEqual(c.rules.map((r) => r.id), ['r1'])
})

test('a plant that died or was moved away is no longer in the ground there', () => {
  const c = siteContents({ ...site, existing: [] }, {
    plants,
    items: [{ plant_id: 'camas', site_id: 's1', season: 'fall-2026', status: 'planted' }],
    plantings: [
      { plant_id: 'camas', site_id: 's1', action: 'planted', happened_on: '2026-10-01' },
      { plant_id: 'camas', site_id: 's1', action: 'died', happened_on: '2027-05-01' },
      { plant_id: 'aster', site_id: 's1', action: 'planted', happened_on: '2026-10-01' },
      { plant_id: 'aster', site_id: 's2', from_site_id: 's1', action: 'moved', happened_on: '2027-03-01' },
    ],
    rules: [],
  })
  assert.deepEqual(c.inGround, [])
})

test('tap targets say what the site is and how much is in it', () => {
  assert.equal(siteLabel(site, 6), 'Site 1, Under Maple, 6 plants')
  assert.equal(siteLabel(site, 0), 'Site 1, Under Maple, no plants yet')
})

test('the chosen site lives in the address, so back works', () => {
  assert.equal(siteFromHash('#garden/site/4'), 4)
  assert.equal(siteFromHash('#plants/site/4'), 4)
  assert.equal(siteFromHash('#plants'), null)
  assert.equal(siteFromHash('#plants/site/x'), null)
})
