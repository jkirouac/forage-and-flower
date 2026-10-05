// Pollinator picks: the ranking from the garden notes, and the year ring that sets
// what flowers each month against when pollinators most need food. Pure, so it can
// be tested without a database (scripts/pollinators.test.ts).

import type { FullPlant } from './plants.ts'

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
