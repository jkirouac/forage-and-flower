// The Seasons lists: plan items for a season, grouped by nursery so each group is
// one shopping trip. Pure, so it can be tested without a database (scripts/plan.test.ts).

export type Status = 'to buy' | 'bought' | 'planted' | 'skipped'
export const STATUSES: Status[] = ['to buy', 'bought', 'planted', 'skipped']

export interface PlanItem {
  id: string
  garden_id: string
  plant_id: string
  site_id: string | null
  season: string // 'fall-2026', 'spring-2027'
  status: Status
  qty_min: number
  qty_max: number
  nursery_id: string | null
  spot: string | null
  notes: string | null
  cleared_at: string | null // hidden from the list since then (Clear checked off)
  status_by: string | null // who last changed the status
}

export interface Plant {
  id: string
  key: string
  common: string
  latin: string | null
  kind: string
}

export interface Site {
  id: string
  number: number
  name: string
}

export interface Nursery {
  id: string
  name: string
  location: string | null
  last_checked: string | null
}

export interface Group {
  nursery: Nursery | null // null: no nursery chosen yet
  items: PlanItem[]
}

// ---------- seasons ----------

const SEASON = /^(spring|fall)-(\d{4})$/

function parts(season: string) {
  const m = SEASON.exec(season)
  return m ? { half: m[1] as 'spring' | 'fall', year: Number(m[2]) } : null
}

export function seasonLabel(season: string) {
  const p = parts(season)
  return p ? `${p.half === 'fall' ? 'Fall' : 'Spring'} ${p.year}` : season
}

// Spring comes before fall in the same year.
function seasonOrder(season: string) {
  const p = parts(season)
  return p ? p.year * 2 + (p.half === 'fall' ? 1 : 0) : 0
}

export function nextSeason(season: string) {
  const p = parts(season)
  if (!p) return season
  return p.half === 'spring' ? `fall-${p.year}` : `spring-${p.year + 1}`
}

// The season being planted or shopped for now: spring from February to July,
// fall from August to December. January is already looking at spring.
export function currentSeason(date = new Date()) {
  const m = date.getMonth() + 1
  const y = date.getFullYear()
  return m >= 8 ? `fall-${y}` : `spring-${y}`
}

// Every season with items, plus this one and the next, in order.
export function seasonOptions(items: PlanItem[], date = new Date()) {
  const now = currentSeason(date)
  const all = new Set([...items.map((i) => i.season), now, nextSeason(now)])
  return [...all].filter((s) => SEASON.test(s)).sort((a, b) => seasonOrder(a) - seasonOrder(b))
}

// ---------- items ----------

export function qtyLabel(min: number, max: number) {
  return min === max ? String(min) : `${min}–${max}`
}

// The next step from the list at the nursery: to buy, then bought, then planted.
export function nextStatus(status: Status): Status | null {
  return status === 'to buy' ? 'bought' : status === 'bought' ? 'planted' : null
}

export function countByStatus(items: PlanItem[]) {
  const counts: Record<Status, number> = { 'to buy': 0, bought: 0, planted: 0, skipped: 0 }
  for (const i of items) counts[i.status]++
  return counts
}

// Nurseries by name, with "no nursery yet" last; within each, what's still to buy
// first, then by plant name.
export function groupByNursery(items: PlanItem[], nurseries: Nursery[], plants: Plant[]): Group[] {
  const nurseryById = new Map(nurseries.map((n) => [n.id, n]))
  const plantName = new Map(plants.map((p) => [p.id, p.common]))
  const groups = new Map<string, Group>()
  for (const item of items) {
    const nursery = (item.nursery_id && nurseryById.get(item.nursery_id)) || null
    const key = nursery?.id ?? ''
    if (!groups.has(key)) groups.set(key, { nursery, items: [] })
    groups.get(key)!.items.push(item)
  }
  const statusRank = (s: Status) => STATUSES.indexOf(s)
  for (const g of groups.values()) {
    g.items.sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        (plantName.get(a.plant_id) ?? '').localeCompare(plantName.get(b.plant_id) ?? ''),
    )
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.nursery) return 1
    if (!b.nursery) return -1
    return a.nursery.name.localeCompare(b.nursery.name)
  })
}

// A catalogue key for a plant added in the app: "Bee Balm 'Jacob Cline'" -> "bee-balm-jacob-cline".
export function plantKey(common: string, taken: Set<string>) {
  const base =
    common
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'plant'
  let key = base
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`
  return key
}

// The list being shopped for in a month, for Buy on This month: the fall list from
// September to November (natives and bulbs go in while the rains come), the spring
// list from February to May. Other months have nothing to buy.
export function buyingSeason(year: number, month: number): string | null {
  if (month >= 9 && month <= 11) return `fall-${year}`
  if (month >= 2 && month <= 5) return `spring-${year}`
  return null
}
