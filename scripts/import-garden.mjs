// One-time import of the garden's markdown into the app's data shape (PLAN.md, "Moving your content in").
//
//   npm run import:garden            (GARDEN_DIR and REMINDER_TASKS_JSON from .env.local)
//   node scripts/import-garden.mjs <path-to-garden-folder>
//
// Reads the garden folder and never changes it. Writes, all git-ignored:
//   scripts/private/garden-import.json   sites, nurseries, plants, rules, plan items, tasks
//   scripts/private/import-report.md     everything that needs a decision before loading
//   scripts/private/spring-2026-review.md  the spring 2026 list, to mark what was bought
//
// Tables and supplier entries are parsed. Rules written as prose in the garden's CLAUDE.md
// are written out below as data, each pointing at its source, because prose can't be parsed safely.

import fs from 'node:fs'
import path from 'node:path'

const gardenArg = process.argv[2] ?? process.env.GARDEN_DIR
if (!gardenArg) throw new Error('Pass the garden folder, or set GARDEN_DIR in .env.local')
const gardenDir = path.resolve(gardenArg)
const outDir = path.resolve('scripts/private')
const read = (rel) => fs.readFileSync(path.join(gardenDir, rel), 'utf8').replace(/\r\n/g, '\n')

const report = { decide: [], inferred: [], skipped: [], mismatch: [] }
const note = (kind, text) => report[kind].push(text)

// ---------- helpers ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_NAMES = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

// "**Bold** [video](url)" -> { text: "Bold", link: "url" }
function plain(md) {
  let link = null
  const text = md
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (_, label, url) => {
      link ??= url
      return label === 'video' ? '' : label
    })
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { text, link }
}

// Markdown tables under each heading: [{ heading, h1, rows: [{col: value}] }]
function tables(md) {
  const out = []
  let h1 = null
  let heading = null
  let current = null
  for (const line of md.split('\n')) {
    const h = line.match(/^(#{1,3}) (.+)/)
    if (h) {
      if (h[1] === '#') h1 = h[2].trim()
      heading = h[2].trim()
      current = null
      continue
    }
    if (!line.startsWith('|')) {
      current = null
      continue
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue
    if (!current) {
      current = { h1, heading, headers: cells.map((c) => c.toLowerCase()), rows: [] }
      out.push(current)
      continue
    }
    current.rows.push(Object.fromEntries(current.headers.map((k, i) => [k, cells[i] ?? ''])))
  }
  return out
}

function slug(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// "4–5" -> [4, 5]; "57" -> [57, 57]; "5 small starts" -> [5, 5]
function qty(cell) {
  const m = cell.match(/(\d+)\s*(?:[–-]\s*(\d+))?/)
  if (!m) return [null, null]
  return [Number(m[1]), Number(m[2] ?? m[1])]
}

// "Sep–Oct", "Dec–Mar", "Apr–May" -> month numbers, wrapping over the new year.
function monthRange(text) {
  const m = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*[–-]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)
  if (!m) return []
  const a = MONTHS.indexOf(m[1].toLowerCase())
  const b = MONTHS.indexOf(m[2].toLowerCase())
  const out = []
  for (let i = a; ; i = (i + 1) % 12) {
    out.push(i + 1)
    if (i === b) break
  }
  return out
}

// "Oregon Grape (*Mahonia aquifolium*)" / "*Solidago simplex* (sticky goldenrod, clumping)" / "Hardy Fuchsia"
function splitName(variety) {
  const raw = variety.trim()
  let m = raw.match(/^\*([^*]+)\*\s*(?:\((?:or\s+)?\*[^*]+\*\))?\s*\(([^)]+)\)\s*$/)
  if (m) {
    const latin = m[1].trim()
    const paren = m[2].trim()
    // Parens that describe the plant rather than name it, e.g. "(STRAIGHT native, not cultivar)".
    const firstPart = paren.split(',')[0].trim()
    if (/\b(not|native|or)\b|[A-Z]{3,}/.test(firstPart)) {
      note('decide', `Common name for *${latin}*: the list says "(${paren})". Using the Latin name until you give one.`)
      return { common: latin, latin, aside: paren }
    }
    // "Lindley's / fringed aster" -> "Lindley's aster"; "sulphur/arrowleaf buckwheat" -> "Sulphur buckwheat".
    let common = firstPart
    if (common.includes('/')) {
      const alt = common.split('/')[0].trim()
      const rest = common.split('/').slice(1).join('/').trim()
      common = alt.includes(' ') ? alt : `${alt} ${rest.split(' ').slice(1).join(' ')}`.trim()
    }
    return { common: common[0].toUpperCase() + common.slice(1), latin }
  }
  m = raw.match(/^(.+?)\s*\(\*?([A-Z][a-z]*\.?\s*(?:×\s*)?[a-z][a-z-]+)\*?\)\s*$/)
  if (m) {
    const common = m[1].trim()
    let latin = m[2].trim()
    const abbr = latin.match(/^([A-Z])\.\s*(.+)/)
    const genus = abbr && common.split(/\s+/).find((w) => w.startsWith(abbr[1]) && /^[A-Z][a-z]{3,}$/.test(w))
    if (genus) latin = `${genus} ${abbr[2]}`
    return { common, latin }
  }
  m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (m) return { common: m[1].trim(), latin: null, aside: m[2].trim() }
  return { common: plain(raw).text, latin: null }
}

// ---------- sites (garden CLAUDE.md, "Planting Sites") ----------

const claude = read('CLAUDE.md')
const sites = []
for (const line of claude.split('\n')) {
  const m = line.match(/^(\d)\. (.+?) — (.+)$/)
  if (!m) continue
  // Split on the first semicolon that isn't inside parentheses.
  let depth = 0
  let cut = -1
  for (let i = 0; i < m[3].length && cut < 0; i++) {
    if (m[3][i] === '(') depth++
    else if (m[3][i] === ')') depth--
    else if (m[3][i] === ';' && depth === 0) cut = i
  }
  const conditions = cut < 0 ? m[3] : m[3].slice(0, cut)
  const notes = cut < 0 ? '' : m[3].slice(cut + 1)
  sites.push({ number: Number(m[1]), name: m[2].trim(), conditions: conditions.trim(), notes: notes.trim() })
}
sites.sort((a, b) => a.number - b.number)
if (sites.length !== 9) note('decide', `Expected 9 sites in CLAUDE.md, found ${sites.length}.`)

// ---------- nurseries (planning/suppliers.md) ----------

const nurseries = []
{
  let h1 = null
  let cur = null
  const flush = () => cur && nurseries.push(cur)
  for (const line of read('planning/suppliers.md').split('\n')) {
    if (line.startsWith('# ')) {
      flush()
      cur = null
      h1 = line.slice(2).trim()
      continue
    }
    if (line.startsWith('## ')) {
      flush()
      const name = line.slice(3).trim()
      if (/Vermicomposting/.test(h1)) {
        note('skipped', `Supplies, not a nursery: "${name}" (stays in suppliers.md).`)
        cur = null
        continue
      }
      const category = /Native Plant Sales/.test(h1) ? 'plant sale' : /Seed|Nurser/.test(h1) ? 'nursery' : 'soil and mulch'
      cur = { key: slug(name), name, category, url: null, location: null, notes: [], last_checked: null }
      continue
    }
    if (!cur) continue
    const kv = line.match(/^- (URL|Location|Source): (.+)/)
    if (kv) {
      if (kv[1] === 'URL') cur.url = kv[2].trim()
      else if (kv[1] === 'Location') cur.location = kv[2].trim()
      else cur.notes.push(plain(kv[2]).text)
    } else if (line.startsWith('- ')) cur.notes.push(plain(line.slice(2)).text)
  }
  flush()
  for (const n of nurseries) {
    n.notes = n.notes.join(' ')
    if (n.notes.includes('Verify URL')) note('decide', `${n.name}: suppliers.md says "Verify URL".`)
  }
}
// Referenced by the shopping lists but missing from suppliers.md.
nurseries.push({
  key: 'fruit-trees-and-more',
  name: 'Fruit Trees and More',
  category: 'nursery',
  url: null,
  location: 'North Saanich, BC',
  notes: 'Fruit tree specialist. Special orders; bare-root Nov–Feb. See plants/fruit-trees-and-more-2026.md for the address and ordering.',
  last_checked: null,
})
note('inferred', 'Added "Fruit Trees and More" as a nursery. The shopping lists use it but suppliers.md has no entry.')
const nurseryKey = (name) => {
  const k = nurseries.find((n) => n.name.toLowerCase().startsWith(name.toLowerCase()))?.key
  if (!k) throw new Error(`No nursery named ${name}`)
  return k
}

// ---------- plants ----------

const plants = new Map()
function addPlant({ common, latin = null, kind, native = false, source, aside }) {
  const key = slug(latin ?? common)
  const existing = plants.get(key)
  if (existing) {
    existing.sources.add(source)
    existing.native ||= native
    return existing
  }
  const p = { key, common, latin, kind, native, tags: [], plant_months: [], bloom_months: [], pollinator_months: [], threat: null, rank: null, why: null, sources: new Set([source]) }
  if (aside) p.aside = aside
  plants.set(key, p)
  return p
}

// ---------- plan items (fall 2026, spring 2027) ----------

const planItems = []

// Where each fall item is bought, from the list's "Sourcing Quick Reference".
function fallNursery(section, plant) {
  if (/Camas/i.test(plant.common)) return nurseryKey("Fraser's Thimble Farms")
  if (/Korean Rock Fern/i.test(plant.common)) return nurseryKey("Fraser's Thimble Farms")
  if (/Sour Cherry/i.test(plant.common)) return 'fruit-trees-and-more'
  // BC-native specialists carry the natives, the native shrubs, Sword Fern and Madia seed.
  return nurseryKey('Satinflower')
}

function kindFor(section) {
  if (/Trees|Shrubs|woodies/i.test(section)) return 'tree or shrub'
  if (/Fern/i.test(section)) return 'fern'
  if (/Bulb/i.test(section)) return 'bulb'
  if (/Seed/i.test(section)) return 'annual from seed'
  if (/Vegetable|Herb/i.test(section)) return 'edible'
  return 'perennial flower'
}

// "1 (×1), 4 (×1), 6 (×1–2)" -> [{site, qty:[1,1]}, ...]; "6 only" -> [{site:6}]
function siteAllocations(cell) {
  const out = []
  for (const m of cell.replace(/\bonly\b/g, '').matchAll(/(?:^|[,\s])(\d)\b\s*(?:\(([^)]*)\))?/g)) {
    const inner = m[2] ?? ''
    const x = inner.match(/×\s*~?(\d+)(?:\s*[–-]\s*(\d+))?/)
    const extra = inner.replace(/×\s*~?\d+(?:\s*[–-]\s*\d+)?/, '').replace(/^[,\s]+|[,\s]+$/g, '')
    out.push({ site: Number(m[1]), qty: x ? [Number(x[1]), Number(x[2] ?? x[1])] : null, where: extra || null, approx: inner.includes('~') })
  }
  return out
}

// The full 2026 list (shopping-list-2026.md) has a Sites column for nearly everything; use its Year-1 split
// when a seasonal list gives no sites, or several sites with no split.
const fullListSites = new Map()
for (const t of tables(read('plants/shopping-list-2026.md'))) {
  if (!t.headers.includes('sites')) continue
  for (const row of t.rows) {
    const n = splitName(row.variety)
    fullListSites.set(slug(n.latin ?? n.common), row.sites.split(/;\s*Y2/)[0].replace(/^Y1:\s*/, ''))
  }
}

function addPlan({ file, season, sectionNursery }) {
  for (const t of tables(read(file))) {
    if (!t.headers.includes('variety')) continue
    const kind = kindFor(t.heading)
    const nativeSection = /native/i.test(t.heading)
    for (const row of t.rows) {
      const name = splitName(row.variety)
      const notes = plain(row.notes ?? '').text
      const native = nativeSection || /BC native|native/i.test(notes) || /Native/i.test(name.common)
      const plant = addPlant({ ...name, kind, native, source: file })
      const [qmin, qmax] = qty(row.qty ?? '')
      const nursery = sectionNursery(t.heading, plant)
      const base = { plant: plant.key, season, status: 'to buy', nursery, notes, source: `${file} · ${t.heading}` }

      let allocations = row.sites ? siteAllocations(row.sites) : []
      if (!row.sites) {
        // Spring 2027 keeps sites in the notes: "Site 7", "Sites 2 / 6 / 9".
        const m = notes.match(/Sites?\s+([\d\s/,+]+)/)
        if (m) allocations = [...m[1].matchAll(/\d/g)].map((d) => ({ site: Number(d[0]), qty: null, where: null }))
        // Fall back to the older full list only when this list names no sites. When this list names
        // sites, it is newer and wins; a different split in the older list is flagged.
        const full = fullListSites.get(plant.key)
        if (full && allocations.length === 0) {
          allocations = siteAllocations(full)
          note('inferred', `${plant.common} (${season}): sites from shopping-list-2026.md: ${full}.`)
        } else if (full && allocations.length > 0) {
          const older = siteAllocations(full).map((a) => a.site).join(', ')
          const newer = allocations.map((a) => a.site).join(', ')
          if (older !== newer) note('decide', `${plant.common} (${season}): this list says Sites ${newer}; shopping-list-2026.md says ${full}. Using Sites ${newer}.`)
        }
      }

      if (allocations.length === 0) {
        planItems.push({ ...base, site: null, qty_min: qmin, qty_max: qmax })
        note('decide', `${plant.common} (${season}): no site given. Which site?`)
      } else if (allocations.length === 1) {
        const a = allocations[0]
        planItems.push({ ...base, site: a.site, where: a.where, qty_min: a.qty?.[0] ?? qmin, qty_max: a.qty?.[1] ?? qmax })
      } else if (allocations.every((a) => a.qty)) {
        for (const a of allocations) {
          planItems.push({ ...base, site: a.site, where: a.where, qty_min: a.qty[0], qty_max: a.qty[1] })
          if (a.approx) note('decide', `${plant.common} at Site ${a.site}: quantity is an estimate (~${a.qty[0]}).`)
        }
      } else {
        // Several sites but no split given: one item per site, total left to decide.
        for (const a of allocations) planItems.push({ ...base, site: a.site, where: a.where, qty_min: null, qty_max: null })
        note('decide', `${plant.common} (${season}): ${qmin === qmax ? qmin : `${qmin}–${qmax}`} ${kind === 'annual from seed' ? 'packet' : 'plants'} across Sites ${allocations.map((a) => a.site).join(', ')}, with no split. How many at each?`)
      }
      if (qmin !== qmax && allocations.length <= 1) note('decide', `${plant.common} (${season}): quantity is a range (${qmin}–${qmax}). Pick a number, or keep the range.`)
    }
  }
}

addPlan({ file: 'plants/shopping-list-2026-fall.md', season: 'fall-2026', sectionNursery: fallNursery })
addPlan({
  file: 'plants/shopping-list-2027-spring.md',
  season: 'spring-2027',
  // "General nurseries cover the whole list — Russell Nursery (biggest haul)"; S. spathacea is mail-order.
  sectionNursery: (_section, plant) => (/spathacea/i.test(plant.latin ?? plant.common) ? null : nurseryKey('Russell')),
})
note('inferred', 'Fall 2026 nurseries come from the list\'s Sourcing Quick Reference: Satinflower for natives, native shrubs, Sword Fern and Madia; Fraser\'s Thimble Farms for Camas and Korean Rock Fern; Fruit Trees and More for the sour cherry.')
note('inferred', 'Spring 2027 items are set to Russell Nursery ("biggest haul"). Salvia spathacea has no nursery (likely mail-order).')

// Native columbine was carried over to fall 2026 in its own section; make sure its kind is right.
for (const p of plants.values()) if (/Aquilegia formosa/.test(p.latin ?? '')) p.kind = 'perennial flower'

// ---------- plants from the schedule (moves, cuttings, potted trees) ----------

for (const [common, latin, kind, tags] of [
  ['Loquat', 'Eriobotrya japonica', 'tree or shrub', []],
  ['Fig', 'Ficus carica', 'tree or shrub', []],
  ['Good King Henry', 'Blitum bonus-henricus', 'edible', []],
  ['Profusion Sorrel', null, 'edible', []],
  ['Perennial kale', null, 'edible', []],
  ['Caucasian spinach', 'Hablitzia tamnoides', 'edible', []],
  ['Blueberry', 'Vaccinium corymbosum', 'edible', ['ericaceous']],
  ['Nepeta', 'Nepeta', 'perennial flower', []],
]) {
  const p = addPlant({ common, latin, kind, source: 'planning/schedule.md' })
  p.tags.push(...tags)
}

// ---------- threatened-species support (plants/perennial-flowers.md) ----------

// From the ranking's threat-status tiebreaker. HIGH: COSEWIC Threatened/Endangered or BC red/blue-listed.
const THREAT = [
  ['high', /Mahonia|Oregon Grape/i, 'Mahonia aquifolium', 'Oregon Grape', 'Feb–Mar food for western bumblebee queens (COSEWIC Threatened)'],
  ['high', /Hellebore/i, null, 'Hellebore', 'Winter food for western bumblebee queens (COSEWIC Threatened), Dec–Mar'],
  ['high', /Erica|Winter Heather/i, 'Erica × darleyensis', 'Winter Heather', 'Winter food for western bumblebee queens (COSEWIC Threatened), Dec–Apr'],
  ['high', /Lupinus polyphyllus/i, 'Lupinus polyphyllus', 'Large-leaved lupine', 'Larval host for the Persius duskywing (COSEWIC Endangered)'],
  ['high', /Sidalcea hendersonii/i, 'Sidalcea hendersonii', "Henderson's checkermallow", 'BC blue-listed plant (S3); larval host for the West Coast lady'],
  ['medium', /Aquilegia formosa|Native Columbine/i, 'Aquilegia formosa', 'Native Columbine', 'Spring nectar for the rufous hummingbird (COSEWIC Special Concern)'],
  ['medium', /Hardy Fuchsia/i, null, 'Hardy Fuchsia', 'Nectar for the rufous hummingbird (COSEWIC Special Concern)'],
  ['medium', /Big Blue Salvia|guaranitica/i, 'Salvia guaranitica', 'Big Blue Salvia', 'Nectar for the rufous hummingbird (COSEWIC Special Concern)'],
  ['medium', /spathacea/i, 'Salvia spathacea', 'Hummingbird sage', 'Nectar for the rufous hummingbird (COSEWIC Special Concern)'],
  ['medium', /Camassia|Camas/i, 'Camassia leichtlinii', 'Great Camas', 'Garry oak meadow keystone; spring food for emerging bumblebee queens'],
  ['medium', /Symphyotrichum|Eurybia/i, null, null, 'Garry oak meadow forage; fall food before bumblebee queens hibernate'],
  ['medium', /Solidago/i, null, null, 'Garry oak meadow forage; late-summer food for specialist bees'],
  ['medium', /Eriogonum/i, null, null, 'Garry oak meadow forage; blue butterfly larval host'],
  ['medium', /Sedum spathulifolium/i, 'Sedum spathulifolium', 'Broadleaf stonecrop', "Larval host for Moss's elfin, a regionally tracked butterfly"],
]

// Threatened-species plants that aren't on a list yet still belong in Pollinator picks.
for (const [tier, re, latin, common, reason] of THREAT) {
  if (!common || [...plants.values()].some((p) => re.test(`${p.common} ${p.latin ?? ''}`))) continue
  const p = addPlant({ common, latin, kind: 'perennial flower', native: true, source: 'plants/perennial-flowers.md' })
  p.threat = { tier, reason }
  const onSpring2026 = new RegExp(re.source, 'i').test(read('plants/shopping-list-2026-spring.md'))
  note('inferred', `Added ${common} to the plant list for Pollinator picks (threat tier ${tier}). It isn't on the fall 2026 or spring 2027 list${onSpring2026 ? '; it is on spring 2026, so check the purchase review' : ''}.`)
}
// Bloom Calendar: one row per month, naming what flowers.
const calendar = tables(read('plants/perennial-flowers.md'))
  .find((t) => t.headers.includes('month'))
  .rows.map((r) => ({ month: MONTHS.indexOf(plain(r.month).text.toLowerCase()) + 1, text: plain(r["what's blooming"] ?? '').text.toLowerCase() }))
  .filter((r) => r.month > 0)

// Rank, sites and "why" from the Stack Ranking table, matched by name.
const ranking = tables(read('plants/perennial-flowers.md')).find((t) => t.headers.includes('rank'))
const ranked = ranking.rows.map((r) => ({ rank: Number(r.rank), name: plain(r.plant ?? '').text, why: plain(r.why ?? '').text }))

for (const p of plants.values()) {
  const label = `${p.common} ${p.latin ?? ''}`
  const t = THREAT.find(([, re]) => re.test(label))
  if (t) {
    p.threat = { tier: t[0], reason: t[4] }
    // Listed under its Latin name only ("Salvia spathacea"): take the common name from the threat list.
    if (t[3] && t[2] && (p.common === p.latin || p.common === t[2])) {
      p.common = t[3]
      p.latin = t[2]
    }
  }
  const r = ranked.find(
    (x) =>
      x.name &&
      ((p.latin && x.name.includes(p.latin)) ||
        x.name.toLowerCase().startsWith(p.common.toLowerCase()) ||
        x.name.toLowerCase().includes(`(${p.common.toLowerCase()})`)),
  )
  if (r) {
    p.rank = r.rank
    p.why = r.why
    p.bloom_months = monthRange(r.why)
  }
  // Fall back to the Bloom Calendar at the top of the file.
  if (p.bloom_months.length === 0) {
    const names = [p.common.toLowerCase(), p.latin?.toLowerCase()].filter(Boolean)
    p.bloom_months = calendar.filter((c) => names.some((n) => c.text.includes(n))).map((c) => c.month)
  }
}
for (const p of plants.values()) {
  if (p.threat && p.bloom_months.length === 0) note('decide', `${p.common}: no bloom months found in the ranking. Add them for the 12-month bar.`)
}

// Tags the rules below hang on.
for (const p of plants.values()) {
  const label = `${p.common} ${p.latin ?? ''}`
  if (/Vaccinium|Erica|Heather|salal|Gaultheria|kinnikinnick|Arctostaphylos|Rhododendron|strawberr|raspberr|blackberr/i.test(label) && !p.tags.includes('ericaceous')) p.tags.push('acid-loving')
  if (p.tags.includes('ericaceous')) p.tags.splice(p.tags.indexOf('ericaceous'), 1, 'acid-loving')
  if (/Lavender|Thyme|Perovskia|Russian sage|Rosemary|^Sage\b/i.test(label)) p.tags.push('mediterranean subshrub')
}

// ---------- rules (garden CLAUDE.md: Mulch & Topdress, Biochar Rule, Worm Castings Rule) ----------

const rules = [
  // Biochar Rule, "Don't apply biochar to"
  { topic: 'biochar', scope: 'tag', target: 'acid-loving', verdict: 'no', text: 'No biochar: acid-loving plant. Biochar (pH 8–10) pushes the wrong way.' },
  { topic: 'biochar', scope: 'tag', target: 'mediterranean subshrub', verdict: 'no', text: 'No biochar: Mediterranean subshrub. Its water retention and potassium work against it.' },
  { topic: 'biochar', scope: 'site', target: 2, verdict: 'no', text: 'No biochar anywhere on this site: acidic, fungal woodland on a sulfur program.' },
  { topic: 'biochar', scope: 'site', target: 9, verdict: 'no', text: 'No biochar in the acid pocket around the rhododendron.' },
  { topic: 'biochar', scope: 'garden', target: null, verdict: 'no', text: 'Biochar goes in planting holes and potting mix only, never on bed surfaces.' },
  // Worm Castings Rule
  ...[1, 2, 4, 7, 9].map((site) => ({ topic: 'castings', scope: 'site', target: site, verdict: 'no', text: 'No worm castings: lean site. Over-fed natives flop and lose drought tolerance.' })),
  // Mulch & Topdress Strategy
  ...[1, 2, 4, 5, 6, 7, 8, 9].map((site) => ({ topic: 'mulch', scope: 'site', target: site, verdict: 'yes', text: 'Mulch with fine fir, 2–3". Never alder or cedar on the bed.' })),
  { topic: 'compost', scope: 'garden', target: null, verdict: 'no', text: 'No rich compost (Sea Soil, manure) in planting holes on native, perennial or Mediterranean beds. Use grit for drainage.' },
].map((r) => ({ ...r, source: 'CLAUDE.md' }))

// ---------- tasks (planning/schedule.md, checked against garden-tasks.json) ----------

const schedule = read('planning/schedule.md')
const tasks = []
const recurring = []
{
  const standing = schedule.match(/## Standing Monthly Tasks[\s\S]*?\n- (.+)/)
  if (standing) {
    const { text } = plain(standing[1])
    const [title, ...rest] = text.split('. ')
    recurring.push({ title: title.replace(/\s*\(.*$/, ''), detail: rest.join('. ') || null, section: 'do', every: 'month' })
  }
}
const ACTION = { 'start indoors': 'plant', 'direct sow': 'plant', transplant: 'plant', harvest: 'do', other: 'do' }
for (const t of tables(schedule)) {
  if (!t.headers.includes('action')) continue
  const months = t.heading
    .toLowerCase()
    .split(/[–-]/)
    .map((m) => MONTH_NAMES[m.trim()])
  if (months.some((m) => !m)) {
    note('skipped', `Schedule section "${t.heading}" isn't a month name.`)
    continue
  }
  for (const row of t.rows) {
    const action = row.action.toLowerCase()
    const { text, link } = plain(row.plants)
    let target = months
    if (months.length > 1) {
      // The October–November section: hints in the text pick the month.
      if (/\((early )?october\)/i.test(text)) target = [10]
      else if (/\(nov[^)]*\)/i.test(text)) target = [11]
      else note('inferred', `"${text}" is in the October–November section with no month hint; added to both.`)
    }
    const title = action === 'other' ? text : `${row.action}: ${text}`
    for (const month of target) tasks.push({ month, section: ACTION[action] ?? 'do', title, link, source: `planning/schedule.md · ${t.heading}` })
  }
}

// Cross-check: every reminder-email item should have a schedule task in the same month.
// The reminder job's task file is optional: REMINDER_TASKS_JSON in .env.local.
const remindersPath = process.env.REMINDER_TASKS_JSON
const json = remindersPath ? JSON.parse(fs.readFileSync(path.resolve(remindersPath), 'utf8')) : {}
if (!remindersPath) note('skipped', 'No REMINDER_TASKS_JSON set, so the reminder email was not cross-checked.')
const words = (s) => s.toLowerCase().replace(/https?:\S+/g, '').match(/[a-z]{4,}/g) ?? []
for (const [m, entry] of Object.entries(json)) {
  const monthText = tasks.filter((t) => t.month === Number(m)).map((t) => t.title.toLowerCase()).join(' ') + ' worm wigwam crank'
  for (const item of [...entry.start_indoors, ...entry.direct_sow, ...entry.transplant, ...entry.other]) {
    const key = words(item).slice(0, 3)
    if (key.length && !key.every((w) => monthText.includes(w))) note('mismatch', `${entry.month}: the reminder email has "${item}" but schedule.md has no matching task.`)
  }
}

// ---------- spring 2026: what was bought? ----------

const spring = read('plants/shopping-list-2026-spring.md')
const review = ['# Spring 2026: what did we buy?', '', 'Mark each line: **bought**, **planted**, **not bought**, or **moved to a later list**. Items already on the fall 2026 or spring 2027 lists are marked.', '']
const laterKeys = new Set(planItems.map((p) => p.plant))
for (const t of tables(spring)) {
  if (!t.headers.includes('variety')) continue
  review.push(`## ${t.heading}`, '', '| Plant | Qty | Notes | Already on a later list | Status |', '|---|---|---|---|---|')
  for (const row of t.rows) {
    const name = splitName(row.variety)
    const key = slug(name.latin ?? name.common)
    const later = laterKeys.has(key) ? 'yes' : ''
    review.push(`| ${plain(row.variety).text} | ${row.qty} | ${plain(row.notes ?? '').text} | ${later} | |`)
  }
  review.push('')
}
const seeds = spring.match(/## Seeds[^\n]*\n\n((?:- .+\n)+)/)
if (seeds) {
  review.push('## Seeds', '', '| Plant | Status |', '|---|---|')
  for (const line of seeds[1].trim().split('\n')) review.push(`| ${line.slice(2)} | |`)
  review.push('')
}

// ---------- write ----------

const out = {
  generated_at: new Date().toISOString(),
  garden: { name: 'Our garden', region: 'Victoria, BC', zone: '9a', last_frost: '03-06', first_frost: '11-16' },
  sites,
  nurseries,
  plants: [...plants.values()].map((p) => ({ ...p, sources: [...p.sources] })),
  rules,
  plan_items: planItems,
  tasks,
  recurring_tasks: recurring,
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'garden-import.json'), JSON.stringify(out, null, 2) + '\n')
fs.writeFileSync(path.join(outDir, 'spring-2026-review.md'), review.join('\n'))

const section = (title, items, intro) =>
  items.length ? [`## ${title} (${items.length})`, '', intro, '', ...items.map((i) => `- ${i}`), ''].join('\n') : ''
fs.writeFileSync(
  path.join(outDir, 'import-report.md'),
  [
    '# Import report',
    '',
    `From \`${gardenDir}\`, ${new Date().toLocaleString('en-CA')}.`,
    '',
    `Imported: ${sites.length} sites, ${nurseries.length} nurseries, ${plants.size} plants, ${rules.length} rules, ${planItems.length} plan items, ${tasks.length} monthly tasks, ${recurring.length} recurring task.`,
    '',
    section('Needs a decision', report.decide, 'Nothing is loaded until these are answered.'),
    section('Inferred', report.inferred, 'The script filled these in. Check they are right.'),
    section('Reminder email vs schedule', report.mismatch, 'In the reminder email but not in schedule.md. Add these to the app, or drop them?'),
    section('Skipped', report.skipped, 'Left out on purpose.'),
  ].join('\n'),
)

console.log(
  `sites ${sites.length} · nurseries ${nurseries.length} · plants ${plants.size} · rules ${rules.length} · plan items ${planItems.length} · tasks ${tasks.length}`,
)
console.log(`decide ${report.decide.length} · inferred ${report.inferred.length} · mismatch ${report.mismatch.length} · skipped ${report.skipped.length}`)
console.log(`written to ${outDir}`)
