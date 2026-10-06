// Pollinator plants: the ranking from the garden notes, and the year ring that sets
// what flowers each month against when pollinators most need food. Pure, so it can
// be tested without a database (scripts/pollinators.test.ts).

import { plantsByPlace, type FullPlant } from './plants.ts'
import { matchPlant } from './yard.ts'

// The critical windows from the ranking's rubric ("critical-window forage"):
// emerging bumblebee queens and early hummingbirds in Feb–Apr, the late season in
// Oct–Dec, and winter bloom in Dec–Mar.
export const CRITICAL: { months: number[]; label: string }[] = [
  { months: [12, 1, 2, 3], label: 'Winter: queens awake on mild days' },
  { months: [2, 3, 4], label: 'Bumblebee queens emerge; first hummingbirds' },
  { months: [10, 11, 12], label: 'Late season, before queens hibernate' },
]

export function criticalLabels(month: number) {
  return CRITICAL.filter((w) => w.months.includes(month)).map((w) => w.label)
}

export const isCritical = (month: number) => criticalLabels(month).length > 0

const TIER = { high: 0, medium: 1, low: 2 } as const

// The notes' ranking order (rank, then the threat-status tiebreaker), then plants
// with a threat reason but no rank. Plants with neither aren't picks.
export function rankPicks(plants: FullPlant[]) {
  const tier = (p: FullPlant) => (p.threat_tier ? TIER[p.threat_tier] : 3)
  return plants
    .filter((p) => p.rank !== null || p.threat_tier !== null)
    .sort(
      (a, b) =>
        (a.rank ?? Infinity) - (b.rank ?? Infinity) || tier(a) - tier(b) || a.common.localeCompare(b.common),
    )
}

// Month (1-12) -> the plants flowering then.
export function bloomByMonth(plants: FullPlant[]) {
  const out: FullPlant[][] = Array.from({ length: 12 }, () => [])
  for (const p of plants) for (const m of p.bloom_months) if (m >= 1 && m <= 12) out[m - 1].push(p)
  return out
}

// Critical months where none of these plants flower.
export function gaps(plants: FullPlant[]) {
  const bloom = bloomByMonth(plants)
  return Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => isCritical(m) && bloom[m - 1].length === 0)
}

// ---------- our garden, month by month (tap a month on the ring) ----------

// Ours, split the way the Plants tab splits it: in the ground (planted, logged and
// not since died, named in a site's notes as already growing there, or marked in
// flower here) and planned
// (to buy or bought, not in the ground). Every plant counts, ranked or not.
export function ourPlants(
  plants: FullPlant[],
  items: { plant_id: string; status: string }[],
  plantings: { plant_id: string; action: string; happened_on: string }[],
  sites: { existing?: string[] }[],
  marks: { plant_id: string }[] = [],
) {
  const { inGround, onLists } = plantsByPlace(plants, items, plantings)
  const ground = new Set(inGround.map((p) => p.id))
  // Seen in flower here, so it grows here.
  for (const m of marks) ground.add(m.plant_id)
  for (const s of sites) for (const name of s.existing ?? []) {
    const id = matchPlant(name, plants)
    if (id) ground.add(id)
  }
  const byName = (a: FullPlant, b: FullPlant) => a.common.localeCompare(b.common)
  return {
    inGround: plants.filter((p) => ground.has(p.id)).sort(byName),
    planned: onLists.filter((p) => !ground.has(p.id)),
  }
}

// One month: ours in flower, planned and in flower, and ranked pollinator plants in
// flower that we neither have nor plan (in ranking order).
export function monthPlants(month: number, ours: { inGround: FullPlant[]; planned: FullPlant[] }, ranked: FullPlant[]) {
  const flowers = (p: FullPlant) => p.bloom_months.includes(month)
  const have = new Set([...ours.inGround, ...ours.planned].map((p) => p.id))
  return {
    inFlower: ours.inGround.filter(flowers),
    planned: ours.planned.filter(flowers),
    couldAdd: ranked.filter((p) => flowers(p) && !have.has(p.id)),
  }
}

// Ours that can't go on the ring yet: no flowering months in the notes.
export function noBloomMonths(ours: { inGround: FullPlant[]; planned: FullPlant[] }) {
  return [...ours.inGround, ...ours.planned].filter((p) => p.bloom_months.length === 0)
}

// #pollinators/month/12 -> 12
export function monthFromHash(hash: string): number | null {
  const m = hash.replace(/^#/, '').match(/^pollinators\/month\/(\d{1,2})$/)
  const n = m ? Number(m[1]) : null
  return n && n >= 1 && n <= 12 ? n : null
}

// ---------- in-flower marks: what's actually flowering in this garden ----------

export interface BloomMark {
  id: string
  plant_id: string
  year: number
  month: number
  marked_by: string | null
  marked_at: string
}

// Plants with their flowering months widened by this garden's marks (any year), so
// the ring learns the garden's real bloom times on top of the notes' calendar.
export function withMarks(plants: FullPlant[], marks: Pick<BloomMark, 'plant_id' | 'month'>[]): FullPlant[] {
  const seen = new Map<string, Set<number>>()
  for (const m of marks) {
    if (!seen.has(m.plant_id)) seen.set(m.plant_id, new Set())
    seen.get(m.plant_id)!.add(m.month)
  }
  return plants.map((p) => {
    const extra = seen.get(p.id)
    if (!extra) return p
    const months = [...new Set([...p.bloom_months, ...extra])].sort((a, b) => a - b)
    return months.length === p.bloom_months.length ? p : { ...p, bloom_months: months }
  })
}

// Months this garden has seen a plant in flower (any year), for the plant page's bar.
export function markedMonths(plantId: string, marks: Pick<BloomMark, 'plant_id' | 'month'>[]) {
  return [...new Set(marks.filter((m) => m.plant_id === plantId).map((m) => m.month))].sort((a, b) => a - b)
}
