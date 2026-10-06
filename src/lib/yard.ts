// The yard map on Plants: the garden drawn in feet (gardens.map, loaded from the
// garden notes by scripts/load-map.mjs), and what each site holds. Pure, so it can
// be tested without a database (scripts/yard.test.ts).

import { baseName, type FullPlant, type Rule } from './plants.ts'

export interface YardTree {
  at: [number, number]
  r: number
  name?: string
  label?: string // shorter name for the map ("Plum")
  side?: 'right' // label beside the trunk instead of under it
}

export interface YardMap {
  width: number
  height: number
  lot: string // SVG path, feet
  house: string
  roof: string[]
  hardscape: { kind: string; d: string }[]
  fence?: string
  drain?: [number, number]
  water?: { kind: string; d: string }[]
  beds?: { site: number; d: string }[]
  trees: YardTree[]
  sites: Record<string, { d: string; label: [number, number] }>
}

export interface YardSite {
  id: string
  number: number
  name: string
  conditions?: string | null
  existing?: string[]
}

interface Item {
  plant_id: string
  site_id: string | null
  season: string
  status: string
}

interface Entry {
  plant_id: string
  site_id: string | null
  from_site_id?: string | null
  action: string
  happened_on: string
}

// A name from the notes ("Douglas fir", "Plum") matched to a catalogue plant by
// its common name, ignoring case and a cultivar in quotes; null if none.
export function matchPlant(name: string, plants: Pick<FullPlant, 'id' | 'common'>[]): string | null {
  const n = name.trim().toLowerCase()
  const exact = plants.find((p) => p.common.toLowerCase() === n)
  if (exact) return exact.id
  const base = plants.filter((p) => baseName(p.common) === n)
  return base.length === 1 ? base[0].id : null
}

// What a site holds:
// - in the ground: planted there (log or a list item marked planted, and not since
//   died or moved away), or named in the notes as already growing there;
// - on lists: to buy or bought for this site, not in the ground;
// - from the notes: names the catalogue doesn't have, shown as plain words;
// - rules: the garden's rules about this site.
export function siteContents(
  site: YardSite,
  data: { plants: FullPlant[]; items: Item[]; plantings: Entry[]; rules: Rule[] },
) {
  const here = new Map<string, string>() // plant id -> latest action at this site
  for (const e of [...data.plantings].sort((a, b) => a.happened_on.localeCompare(b.happened_on))) {
    if (e.site_id === site.id) here.set(e.plant_id, e.action)
    else if (e.action === 'moved' && e.from_site_id === site.id) here.set(e.plant_id, 'moved away')
  }
  const inGround = new Set<string>()
  for (const [id, action] of here) if (action !== 'died' && action !== 'moved away') inGround.add(id)
  for (const i of data.items)
    if (i.site_id === site.id && i.status === 'planted' && !['died', 'moved away'].includes(here.get(i.plant_id) ?? '')) inGround.add(i.plant_id)

  const notesOnly: string[] = []
  for (const name of site.existing ?? []) {
    const id = matchPlant(name, data.plants)
    if (id) inGround.add(id)
    else notesOnly.push(name)
  }

  const onLists = new Set(
    data.items
      .filter((i) => i.site_id === site.id && (i.status === 'to buy' || i.status === 'bought') && !inGround.has(i.plant_id))
      .map((i) => i.plant_id),
  )
  const byName = (a: FullPlant, b: FullPlant) => a.common.localeCompare(b.common)
  return {
    inGround: data.plants.filter((p) => inGround.has(p.id)).sort(byName),
    onLists: data.plants.filter((p) => onLists.has(p.id)).sort(byName),
    notesOnly,
    rules: data.rules.filter((r) => r.site_id === site.id),
  }
}

// "Site 4, Road Berm, 6 plants", for the map's tap targets.
export function siteLabel(site: YardSite, count: number) {
  return `Site ${site.number}, ${site.name}, ${count === 0 ? 'no plants yet' : count === 1 ? '1 plant' : `${count} plants`}`
}

// #garden/site/4 -> 4 (and the old #plants/site/4)
export function siteFromHash(hash: string): number | null {
  const m = hash.replace(/^#/, '').match(/^(?:garden|plants)\/site\/(\d+)$/)
  return m ? Number(m[1]) : null
}
