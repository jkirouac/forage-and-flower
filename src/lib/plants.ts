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
  size: string | null // "1–2 ft × 1–2 ft"
  pollinators: string | null // "hummingbirds, bees, butterflies"
  photo_url: string | null
  photo_page: string | null
  photo_credit: string | null
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
    // A cultivar in quotes may hold an apostrophe ('Walker's Low'): trim from the
    // first quote to the last.
    .replace(/'.*'|"[^"]*"|\([^)]*\)/g, ' ')
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

// ---------- plant pages: at a glance, why, rules ----------

export interface Trait {
  key: string // also the icon's name
  label: string
}

const POLLINATORS: [RegExp, Trait][] = [
  [/bumble ?bee|bombus/, { key: 'bumblebee', label: 'Bumblebees' }],
  [/(^|[^a-z])bees?([^a-z]|$)/, { key: 'bee', label: 'Bees' }],
  [/specialist|oligolege/, { key: 'specialist', label: 'Specialist bees' }],
  [/butterfl/, { key: 'butterfly', label: 'Butterflies' }],
  [/hummingbird/, { key: 'hummingbird', label: 'Hummingbirds' }],
  [/larval host|caterpillar|(^|[^a-z])lep([^a-z]|$)/, { key: 'caterpillar', label: 'Caterpillars' }],
  [/moth/, { key: 'moth', label: 'Moths' }],
  [/hoverfl/, { key: 'hoverfly', label: 'Hoverflies' }],
  [/goldfinch|(^|[^g])birds?([^a-z]|$)|seed source/, { key: 'bird', label: 'Birds' }],
]

const TRAITS: [RegExp, Trait][] = [
  [/drought/, { key: 'drought', label: 'Drought-tolerant' }],
  [/evergreen/, { key: 'evergreen', label: 'Evergreen' }],
  [/edible|(^|[^a-z])tea([^a-z]|$)|berries|fruit|culinary|herbal/, { key: 'edible', label: 'Edible' }],
  [/self-?seed|self-?sow/, { key: 'seeds', label: 'Self-seeds' }],
  [/nitrogen/, { key: 'nitrogen', label: 'Fixes nitrogen' }],
  [/shade/, { key: 'shade', label: 'Part shade' }],
  [/wet[- ]feet|moisture[- ]loving|moist soil/, { key: 'wet', label: 'Likes wet soil' }],
  [/cavity|pithy|hollow/, { key: 'nest', label: 'Nesting stems for bees' }],
  [/seedhead/, { key: 'seedheads', label: 'Winter seedheads' }],
]

// Fruit by name, for plants whose notes don't say "edible" (the fruit trees).
const FRUIT = /cherr|(^|[^a-z])figs?([^a-z]|$)|loquat|plum|apple|pear|huckleberr|blueberr|grape/

// What the plant feeds and what it's like, for the icon rows on its page and the
// Plants filters. Who it feeds comes from the notes' Pollinators column (or the
// "why" when there's none). Edible: an edible kind, "edible" (or tea, berries…) in
// the why, or a fruit by name.
export function plantTraits(
  plant: Pick<FullPlant, 'pollinators' | 'why' | 'native'> & Partial<Pick<FullPlant, 'kind' | 'common' | 'tags'>>,
) {
  const who = (plant.pollinators ?? plant.why ?? '').toLowerCase()
  const what = (plant.why ?? '').toLowerCase()
  const pollinators = POLLINATORS.filter(([re]) => re.test(who)).map(([, t]) => t)
  const traits = [
    ...(plant.native ? [{ key: 'native', label: 'BC native' }] : []),
    ...TRAITS.filter(([re]) => re.test(what)).map(([, t]) => t),
  ]
  const edible = plant.kind === 'edible' || FRUIT.test((plant.common ?? '').toLowerCase())
  if (edible && !traits.some((t) => t.key === 'edible')) traits.push({ key: 'edible', label: 'Edible' })
  // Sun from the notes' Sun column (imported as tags): full-sun, part-shade, shade.
  const tags = plant.tags ?? []
  if (tags.includes('full-sun')) traits.unshift({ key: 'sun', label: 'Full sun' })
  if ((tags.includes('part-shade') || tags.includes('shade')) && !traits.some((t) => t.key === 'shade'))
    traits.push({ key: 'shade', label: 'Part shade' })
  return { pollinators, traits }
}

// "Pithy Lamiaceae stems = cavity-nesting habitat; triple pollinator" ->
// ["Pithy Lamiaceae stems: cavity-nesting habitat", "Triple pollinator"].
export function whyBullets(why: string | null) {
  return (why ?? '')
    .split(/;\s*/)
    .map((s) => s.replace(/\s+=\s+/g, ': ').trim())
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
}

const NOT_ON: Record<string, string> = {
  biochar: 'biochar',
  castings: 'worm castings',
  compost: 'rich compost (Sea Soil, manure)',
}

// The rules for a plant as two short lines: what to do, and what not to use. The
// full rules, with their reasons and sites, stay one tap away.
export function summarizeRules(rules: Rule[]) {
  const doLines: string[] = []
  const dontLines: string[] = []
  const add = (list: string[], line: string) => {
    const l = line.replace(/\.$/, '').trim()
    if (l && !list.some((x) => x.toLowerCase() === l.toLowerCase())) list.push(l)
  }
  const specific = (r: Rule) => Boolean(r.site_id || r.tag || r.plant_id || r.kind)
  // "Biochar goes in planting holes only" isn't needed once a rule says no biochar here.
  const noBiocharHere = rules.some((r) => r.topic === 'biochar' && r.verdict === 'no' && specific(r))
  for (const r of rules) {
    const sentences = r.text.split(/(?<=\.)\s+/)
    if (r.verdict === 'no') {
      if (r.topic === 'biochar' && !specific(r)) {
        if (!noBiocharHere) add(doLines, 'Biochar only in planting holes and potting mix, not on the bed')
        continue
      }
      add(dontLines, NOT_ON[r.topic] ?? sentences[0].replace(/^No /, '').replace(/:.*/, ''))
    } else {
      const first = sentences.find((s) => !/^never /i.test(s))
      if (first) add(doLines, first)
    }
    for (const s of sentences) {
      if (/^never /i.test(s)) add(dontLines, s.replace(/^never /i, ''))
      if (/^use /i.test(s)) add(doLines, s.replace(/^use /i, '').replace(/^./, (c) => c.toUpperCase()))
    }
  }
  return { doLines, dontLines }
}

// The Plants list: what's in the ground (marked planted, or logged and not since
// died), what's on a shopping list and not planted yet, and the rest.
export function plantsByPlace(
  plants: FullPlant[],
  items: { plant_id: string; status: string }[],
  log: { plant_id: string; action: string; happened_on: string }[],
) {
  const latest = new Map<string, string>()
  for (const e of [...log].sort((a, b) => a.happened_on.localeCompare(b.happened_on))) latest.set(e.plant_id, e.action)
  const inGround = new Set<string>()
  for (const [id, action] of latest) if (action !== 'died') inGround.add(id)
  for (const i of items) if (i.status === 'planted' && latest.get(i.plant_id) !== 'died') inGround.add(i.plant_id)
  const onLists = new Set(items.filter((i) => i.status === 'to buy' || i.status === 'bought').map((i) => i.plant_id))
  const byName = (a: FullPlant, b: FullPlant) => a.common.localeCompare(b.common)
  return {
    inGround: plants.filter((p) => inGround.has(p.id)).sort(byName),
    onLists: plants.filter((p) => !inGround.has(p.id) && onLists.has(p.id)).sort(byName),
    others: plants.filter((p) => !inGround.has(p.id) && !onLists.has(p.id)).sort(byName),
  }
}

// ---------- plant names as links in task titles ----------

export interface TitlePart {
  text: string
  plantId?: string
}

// "Transplant: Loquat, potted fig" -> ["Transplant: ", Loquat->loquat, ", potted ", fig->fig].
// Whole words, plural allowed, each plant once. Longer names first, so "Winter
// Heather" isn't split by "Heather"; for names shared by several plants ("Nepeta"),
// the plant called exactly that wins.
export function linkPlantNames(title: string, plants: Pick<FullPlant, 'id' | 'common'>[]): TitlePart[] {
  const lower = title.toLowerCase()
  const candidates = plants
    .map((p) => ({ id: p.id, name: baseName(p.common), exact: baseName(p.common) === p.common.toLowerCase() }))
    .filter((c) => c.name.length > 2)
    .sort((a, b) => b.name.length - a.name.length || Number(b.exact) - Number(a.exact))
  const found: { start: number; end: number; id: string }[] = []
  for (const c of candidates) {
    const m = new RegExp(`(^|[^a-z])(${escape(c.name)}s?)(?=[^a-z]|$)`).exec(lower)
    if (!m) continue
    const start = m.index + m[1].length
    const end = start + m[2].length
    if (found.some((f) => start < f.end && end > f.start)) continue
    found.push({ start, end, id: c.id })
  }
  found.sort((a, b) => a.start - b.start)
  const parts: TitlePart[] = []
  let at = 0
  for (const f of found) {
    if (f.start > at) parts.push({ text: title.slice(at, f.start) })
    parts.push({ text: title.slice(f.start, f.end), plantId: f.id })
    at = f.end
  }
  if (at < title.length) parts.push({ text: title.slice(at) })
  return parts
}

// ---------- Plants filters (chips in two rows, as in Mealboard) ----------

export interface PlantFilter {
  key: string
  label: string // on the chip
  icon: string // Icons.tsx name
  row: 'feeds' | 'traits'
  traits: string[] // matches a plant with any of these trait keys
  phrase: string // for the summary line
}

export const FILTERS: PlantFilter[] = [
  { key: 'bees', label: 'Bees', icon: 'bee', row: 'feeds', traits: ['bee', 'bumblebee', 'specialist'], phrase: 'bees' },
  { key: 'butterflies', label: 'Butterflies', icon: 'butterfly', row: 'feeds', traits: ['butterfly'], phrase: 'butterflies' },
  { key: 'hummingbirds', label: 'Hummingbirds', icon: 'hummingbird', row: 'feeds', traits: ['hummingbird'], phrase: 'hummingbirds' },
  { key: 'caterpillars', label: 'Caterpillars', icon: 'caterpillar', row: 'feeds', traits: ['caterpillar'], phrase: 'caterpillars' },
  { key: 'humans', label: 'Humans', icon: 'edible', row: 'feeds', traits: ['edible'], phrase: 'us' },
  { key: 'sun', label: 'Full sun', icon: 'sun', row: 'traits', traits: ['sun'], phrase: 'like full sun' },
  { key: 'drought', label: 'Drought-tolerant', icon: 'drought', row: 'traits', traits: ['drought'], phrase: 'are drought-tolerant' },
  { key: 'nest', label: 'Nesting stems', icon: 'nest', row: 'traits', traits: ['nest'], phrase: 'have nesting stems for bees' },
  { key: 'native', label: 'BC native', icon: 'native', row: 'traits', traits: ['native'], phrase: 'are BC natives' },
  { key: 'evergreen', label: 'Evergreen', icon: 'evergreen', row: 'traits', traits: ['evergreen'], phrase: 'are evergreen' },
  { key: 'shade', label: 'Part shade', icon: 'shade', row: 'traits', traits: ['shade'], phrase: 'take part shade' },
]

type Traitable = Parameters<typeof plantTraits>[0]

const traitKeys = (plant: Traitable) => {
  const t = plantTraits(plant)
  return new Set([...t.pollinators, ...t.traits].map((x) => x.key))
}

// Every selected chip must match (AND), as in Mealboard.
export function matchesFilters(plant: Traitable, selected: string[]) {
  if (selected.length === 0) return true
  const keys = traitKeys(plant)
  return selected.every((f) => FILTERS.find((x) => x.key === f)?.traits.some((t) => keys.has(t)) ?? true)
}

// The chips worth showing: those that, with what's already chosen, still match a
// plant. Chosen chips always show, so an active filter never disappears.
export function availableFilters(plants: Traitable[], selected: string[]) {
  return FILTERS.filter((f) => selected.includes(f.key) || plants.some((p) => matchesFilters(p, [...selected, f.key])))
}

// "12 plants feed bees and butterflies and are drought-tolerant."
export function describeFilters(count: number, selected: string[]) {
  const chosen = FILTERS.filter((f) => selected.includes(f.key))
  const feeds = chosen.filter((f) => f.row === 'feeds').map((f) => f.phrase)
  const traits = chosen.filter((f) => f.row === 'traits').map((f) => f.phrase)
  const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  const parts = [feeds.length ? `feed ${list(feeds)}` : '', list(traits)].filter(Boolean)
  const what = count === 1 ? '1 plant' : `${count} plants`
  const verb = (x: string) => (count === 1 ? x.replace(/^feed /, 'feeds ').replace(/^are /, 'is ').replace(/^have /, 'has ').replace(/^take /, 'takes ').replace(/^like /, 'likes ') : x)
  return `${what} ${parts.map(verb).join(' and ')}.`
}

// The notes are written in a naturalist's shorthand. Shown on a plant page, a few
// terms read better in plain words; the notes themselves stay as written.
const PLAIN: [RegExp, string][] = [
  [/\bLamiaceae\b/g, 'mint-family'],
  [/\bBombus\b/g, 'bumblebee'],
  [/\bLepidoptera\b/g, 'butterfly and moth'],
  [/\bLep\b/g, 'butterfly and moth'],
  [/\boligoleges?\b/g, 'specialist bee'],
  [/\bCOSEWIC Threatened\b/g, 'threatened in Canada'],
  [/\bCOSEWIC Endangered\b/g, 'endangered in Canada'],
  [/\bCOSEWIC Special Concern\b/g, 'a species of concern in Canada'],
  [/\s\+\s/g, ' and '],
]
export function plain(text: string | null) {
  return PLAIN.reduce((s, [re, to]) => s.replace(re, to), text ?? '')
}
