// Plant pages: which rules apply to a plant, when it's planted and in flower, and
// which of this month's tasks a planting finishes. Pure, so it can be tested
// without a database (scripts/plants.test.ts).

import type { Task } from './month.ts'

export interface FullPlant {
  id: string
  key: string
  common: string
  latin: string | null
  kind: string
  native: boolean
  tags: string[]
  plant_months: number[]
  bloom_months: number[]
  pollinator_months: number[]
  threat_tier: 'high' | 'medium' | 'low' | null
  threat_reason: string | null
  rank: number | null
  why: string | null
}

export interface Rule {
  id: string
  topic: string
  verdict: 'yes' | 'no'
  text: string
  plant_id: string | null
  tag: string | null
  kind: string | null
  garden_id: string | null
  site_id: string | null
}

export type Action = 'planted' | 'sown' | 'moved' | 'divided' | 'died'
export const ACTIONS: Action[] = ['planted', 'sown', 'moved', 'divided', 'died']

export interface Planting {
  id: string
  garden_id: string
  plant_id: string
  action: Action
  site_id: string | null
  from_site_id: string | null
  plan_item_id: string | null
  quantity: number | null
  happened_on: string // yyyy-mm-dd
  notes: string | null
  done_by: string | null
}

// "Sour Cherry 'Evans (Bali)'" -> "sour cherry": the name a schedule line would use.
export function baseName(common: string) {
  return common
    .toLowerCase()
    .replace(/'[^']*'|"[^"]*"|\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Does this task name the plant? Whole words only, so "pea" doesn't match "peach".
export function taskNamesPlant(task: Pick<Task, 'title'> & { plant_id?: string | null }, plant: Pick<FullPlant, 'id' | 'common'>) {
  if (task.plant_id && task.plant_id === plant.id) return true
  const name = baseName(plant.common)
  if (!name) return false
  return new RegExp(`(^|[^a-z])${escape(name)}s?([^a-z]|$)`).test(task.title.toLowerCase())
}

// Months the plant goes in the ground: the catalogue's, plus any month whose
// Plant tasks name it.
export function plantingMonths(plant: FullPlant, tasks: Task[]) {
  const months = new Set(plant.plant_months)
  for (const t of tasks) if (t.section === 'plant' && t.month && taskNamesPlant(t, plant)) months.add(t.month)
  return [...months].sort((a, b) => a - b)
}

// The open task a planting finishes: one of this month's tasks that names the
// plant, Plant tasks first. `open` is this month's list minus anything ticked.
export function taskForPlanting(open: Task[], plant: FullPlant): Task | null {
  const named = open.filter((t) => taskNamesPlant(t, plant))
  return named.find((t) => t.section === 'plant') ?? named[0] ?? null
}

// Rules for this plant: its own, its tags' and its kind's from the catalogue, then
// the garden's rules for the sites it's in, then rules for the whole garden.
export function rulesFor(plant: FullPlant, rules: Rule[], siteIds: string[], siteNumber: (id: string) => number) {
  const own = rules.filter(
    (r) =>
      r.garden_id === null &&
      (r.plant_id === plant.id || (r.tag !== null && plant.tags.includes(r.tag)) || (r.kind !== null && r.kind === plant.kind)),
  )
  const sites = rules
    .filter((r) => r.garden_id !== null && r.site_id !== null && siteIds.includes(r.site_id))
    .sort((a, b) => siteNumber(a.site_id!) - siteNumber(b.site_id!))
  const garden = rules.filter((r) => r.garden_id !== null && r.site_id === null)
  return [...own, ...sites, ...garden]
}

// Your plants first (on a list or in the log), then the rest of the catalogue,
// each by name.
export function splitPlants(plants: FullPlant[], yours: Set<string>) {
  const byName = (a: FullPlant, b: FullPlant) => a.common.localeCompare(b.common)
  return {
    yours: plants.filter((p) => yours.has(p.id)).sort(byName),
    others: plants.filter((p) => !yours.has(p.id)).sort(byName),
  }
}

export function matchesSearch(plant: FullPlant, q: string) {
  const s = q.trim().toLowerCase()
  return !s || plant.common.toLowerCase().includes(s) || (plant.latin ?? '').toLowerCase().includes(s)
}
