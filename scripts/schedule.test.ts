// node --test scripts/schedule.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloomRows, parseBloom, scheduleStatus, type ScheduleRow } from '../src/lib/schedule.ts'

test('bloom text in every form the site plans use', () => {
  assert.deepEqual(parseBloom('Jun–Aug'), [6, 7, 8])
  assert.deepEqual(parseBloom('Apr (white)'), [4])
  assert.deepEqual(parseBloom('May–Sep (rebloom)'), [5, 6, 7, 8, 9])
  assert.deepEqual(parseBloom('May–Jun (Ch)'), [5, 6])
  assert.deepEqual(parseBloom('Nov–Mar'), [11, 12, 1, 2, 3])
  assert.deepEqual(parseBloom('Dec–Apr'), [12, 1, 2, 3, 4])
  assert.deepEqual(parseBloom('Jun–frost'), [6, 7, 8, 9, 10, 11])
  assert.deepEqual(parseBloom('Mar'), [3])
  assert.deepEqual(parseBloom('non-flowering'), [])
  assert.deepEqual(parseBloom('—'), [])
  assert.equal(parseBloom('whenever'), null)
})

const row = (common: string, latin: string, bloom: string): ScheduleRow => ({
  key: '', fill: null, stroke: null, latin, common, qty: '1', size: '', bloom, months: parseBloom(bloom) ?? [], pollinators: '', role: '',
})

test('each schedule row against the garden: in the ground, planned, or not yet', () => {
  const here = {
    inGround: [{ id: 'sask', common: 'Saskatoon berry', latin: 'Amelanchier alnifolia' }],
    onLists: [{ id: 'nep', common: "Nepeta 'Walker's Low'", latin: null }],
  }
  assert.deepEqual(scheduleStatus(row('Saskatoon (existing)', 'Amelanchier alnifolia', 'Apr'), here), { status: 'in the ground', plantId: 'sask' })
  assert.deepEqual(scheduleStatus(row('Nepeta', "Nepeta 'Walker's Low'", 'May–Sep'), here), { status: 'planned', plantId: 'nep' })
  assert.deepEqual(scheduleStatus(row('Bee balm', 'Monarda didyma', 'Jun–Aug'), here), { status: 'not planned', plantId: null })
})

test('the bloom chart reads as a season, counts each month, and marks critical gaps', () => {
  const { rows, counts, gaps } = bloomRows([
    row('Sedum', 'Hylotelephium', 'Aug–Oct'),
    row('Hellebore', 'Helleborus', 'Feb–Apr'),
    row('Heather', 'Erica', 'Nov–Mar'),
    row('Fern', 'Polystichum', 'non-flowering'),
  ])
  assert.deepEqual(rows.map((r) => r.common), ['Hellebore', 'Sedum', 'Heather', 'Fern'])
  assert.deepEqual(counts, [1, 2, 2, 1, 0, 0, 0, 1, 1, 1, 1, 1])
  assert.equal(gaps.filter(Boolean).length, 0)
  assert.equal(bloomRows([row('Sedum', 'Hylotelephium', 'Aug–Oct')]).gaps[0], true)
})
