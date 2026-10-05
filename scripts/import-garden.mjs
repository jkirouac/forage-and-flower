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

// Answers to earlier reports (git-ignored), so a re-run applies them instead of asking again.
const decisionsPath = path.resolve(process.env.IMPORT_DECISIONS ?? 'scripts/private/import-decisions.json')
const decisions = fs.existsSync(decisionsPath) ? JSON.parse(fs.readFileSync(decisionsPath, 'utf8')) : {}
const applied = []

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
      const named = decisions.plant_names?.[slug(latin)]
      if (named) return { common: named, latin, aside: paren }
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
    const d = decisions.nurseries?.[n.key]
    if (d) {
      n.url = d.url ?? n.url
      n.notes = [n.notes.replace(/\s*Verify URL\.?/g, ''), d.notes_add].filter(Boolean).join(' ')
      n.last_checked = decisions.decided_on ?? null
      applied.push(`${n.name}: website and notes`)
    } else if (n.notes.includes('Verify URL')) note('decide', `${n.name}: suppliers.md says "Verify URL".`)
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

      const decisionKey = `${plant.key}|${season}`
      const single = decisions.single_item?.[decisionKey]
      if (single) {
        planItems.push({ ...base, site: null, where: single.where, qty_min: single.qty[0], qty_max: single.qty[1] })
        applied.push(`${plant.common} (${season}): ${single.where}`)
        continue
      }
      const split = decisions.splits?.[decisionKey]

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
          if (older !== newer && !split) note('decide', `${plant.common} (${season}): this list says Sites ${newer}; shopping-list-2026.md says ${full}. Using Sites ${newer}.`)
        }
      }

      if (split) {
        allocations = Object.entries(split).map(([site, q]) => ({ site: Number(site), qty: q, where: null }))
        applied.push(`${plant.common} (${season}): ${allocations.map((a) => `Site ${a.site} ×${a.qty[0] === a.qty[1] ? a.qty[0] : a.qty.join('–')}`).join(', ')}`)
      }
      const estimateOk = decisions.estimates_ok?.includes(plant.key)

      if (allocations.length === 0) {
        planItems.push({ ...base, site: null, qty_min: qmin, qty_max: qmax })
        note('decide', `${plant.common} (${season}): no site given. Which site?`)
      } else if (allocations.length === 1) {
        const a = allocations[0]
        planItems.push({ ...base, site: a.site, where: a.where, qty_min: a.qty?.[0] ?? qmin, qty_max: a.qty?.[1] ?? qmax })
      } else if (allocations.every((a) => a.qty)) {
        for (const a of allocations) {
          const estimate = a.approx ? { estimate: true } : {}
          planItems.push({ ...base, ...estimate, site: a.site, where: a.where, qty_min: a.qty[0], qty_max: a.qty[1] })
          if (a.approx && estimateOk) applied.push(`${plant.common} at Site ${a.site}: ${a.qty[0]}, kept as an estimate`)
          else if (a.approx) note('decide', `${plant.common} at Site ${a.site}: quantity is an estimate (~${a.qty[0]}).`)
        }
      } else {
        // Several sites but no split given: one item per site, total left to decide.
        for (const a of allocations) planItems.push({ ...base, site: a.site, where: a.where, qty_min: null, qty_max: null })
        note('decide', `${plant.common} (${season}): ${qmin === qmax ? qmin : `${qmin}–${qmax}`} ${kind === 'annual from seed' ? 'packet' : 'plants'} across Sites ${allocations.map((a) => a.site).join(', ')}, with no split. How many at each?`)
      }
      if (qmin !== qmax && allocations.length <= 1 && !decisions.keep_ranges) note('decide', `${plant.common} (${season}): quantity is a range (${qmin}–${qmax}). Pick a number, or keep the range.`)
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
  // Also named in the tiebreaker; no common name, so they're only tagged when ranked.
  ['high', /Asclepias|Swamp Milkweed/i, null, null, 'Larval host for the monarch (COSEWIC Special Concern, globally Endangered)'],
  ['medium', /Penstemon/i, null, null, 'Nectar for the rufous hummingbird (COSEWIC Special Concern)'],
  ['medium', /Dicentra|Bleeding Heart/i, null, null, 'Spring nectar for the rufous hummingbird (COSEWIC Special Concern), Mar–May'],
  ['medium', /Monarda|Bee Balm/i, null, null, 'Nectar for the rufous hummingbird (COSEWIC Special Concern)'],
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
// The rest of the Stack Ranking, so Pollinator picks runs 1 to 48 (added 2026-10-06).
// Catalogue only: these plants aren't on a list. Names come as "*Latin* (common)",
// "Common (Latin)", "Common (another common name)" or just a name; ★ marks a
// self-seeding annual.
const LATIN_NAME = /^([A-Z][a-z]+( [a-z][a-z-]+)?|[A-Z]\. [a-z][a-z-]+)$/
function rankedNames(raw) {
  const annual = raw.includes('★')
  const s = raw.replace('★', '').trim()
  const italic = s.match(/^\*([^*]+)\*\s*\(([^)]+)\)$/)
  if (italic) return { common: italic[2][0].toUpperCase() + italic[2].slice(1), latin: italic[1], annual }
  const m = s.match(/^(.*?)\s*\(([^)]+)\)$/)
  if (m) {
    const inside = m[2].replace(/,.*$/, '').trim()
    // "Phacelia (P. tanacetifolia)": spell the genus out.
    if (LATIN_NAME.test(inside)) return { common: m[1], latin: inside.replace(/^[A-Z]\. /, `${m[1].split(' ')[0]} `), annual }
    return { common: s, latin: null, annual }
  }
  return { common: s, latin: LATIN_NAME.test(s) ? s : null, annual }
}
const rankedTaken = new Set([...plants.values()].map((p) => p.rank).filter(Boolean))
for (const row of ranking.rows) {
  const rank = Number(row.rank)
  if (!rank || rankedTaken.has(rank)) continue
  const raw = (row.plant ?? '').trim()
  const { common, latin, annual } = rankedNames(raw)
  const why = plain(row.why ?? '').text
  const p = addPlant({
    common,
    latin,
    kind: annual ? 'annual from seed' : 'perennial flower',
    native: /\bBC (coastal )?native\b/i.test(why),
    source: 'plants/perennial-flowers.md',
  })
  p.rank = rank
  p.why = why
  // The Bloom Calendar by name first ("Tall Yarrow 'Coronation Gold'" is listed as
  // "Tall Yarrow"): a range in "why" is sometimes seedheads or winter form. Then the
  // range in "why", then the genus in the calendar ("Penstemon").
  const inCalendar = (names) =>
    calendar.filter((c) => names.some((n) => n && n.length > 3 && c.text.includes(n))).map((c) => c.month)
  const before = p.common.split(/\s*['(]/)[0].toLowerCase()
  p.bloom_months = inCalendar([p.common.toLowerCase(), p.latin?.toLowerCase(), before])
  if (p.bloom_months.length === 0) p.bloom_months = monthRange(why)
  if (p.bloom_months.length === 0 && p.latin) p.bloom_months = inCalendar([p.latin.split(' ')[0].toLowerCase()])
  const t = THREAT.find(([, re]) => re.test(`${raw} ${p.common} ${p.latin ?? ''}`))
  if (t) p.threat = { tier: t[0], reason: t[4] }
  note('inferred', `Ranked #${rank}: added ${p.common}${p.latin ? ` (${p.latin})` : ''}, ${p.kind}${p.native ? ', BC native' : ''}, blooms ${p.bloom_months.join(',') || 'unknown'}${p.threat ? `, ${p.threat.tier} threat tier` : ''}.`)
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
const MONTH_LIST = Object.keys(MONTH_NAMES).map((m) => m[0].toUpperCase() + m.slice(1))
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
    for (const month of target) tasks.push({ month, section: ACTION[action] ?? 'do', title, link, source: `planning/schedule.md · ${t.heading}`, combined: months.length > 1 })
  }
}

// Decided months for tasks that sat in a combined section, and tasks added from the reminder email.
for (const { match, month } of decisions.task_months ?? []) {
  const before = tasks.length
  for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].combined && tasks[i].title.includes(match) && tasks[i].month !== month) tasks.splice(i, 1)
  report.inferred = report.inferred.filter((n) => !n.includes(match))
  if (tasks.length < before) applied.push(`"${match}": ${MONTH_LIST[month - 1]} only`)
}
for (const t of decisions.extra_tasks ?? []) {
  tasks.push({ month: t.month, section: t.section, title: t.title, link: null, source: 'reminder email (added by decision)' })
  applied.push(`Added to ${MONTH_LIST[t.month - 1]}: ${t.title}`)
}
const fromEmail = new Set((decisions.extra_tasks ?? []).map((t) => t.from_email).filter(Boolean))

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
    if (key.length && !fromEmail.has(item) && !key.every((w) => monthText.includes(w))) note('mismatch', `${entry.month}: the reminder email has "${item}" but schedule.md has no matching task.`)
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

// Inferences you've confirmed (regexes in the decisions file) leave the report.
const acceptRes = (decisions.accept_inferred ?? []).map((r) => new RegExp(r, 'i'))
const acceptedCount = report.inferred.filter((n) => acceptRes.some((re) => re.test(n))).length
report.inferred = report.inferred.filter((n) => !acceptRes.some((re) => re.test(n)))

// ---------- plant pages: size, pollinators, photo (added 2026-10-06) ----------

// Size and Pollinators from the ranked lists, matched like rank and "why" above.
const DETAIL_FILES = ['plants/perennial-flowers.md', 'plants/trees-shrubs.md', 'plants/perennial-herbs.md', 'plants/ferns-foliage.md']
const detailRows = DETAIL_FILES.flatMap((file) =>
  tables(read(file))
    .filter((t) => t.headers.includes('rank') && (t.headers.includes('size (h×w)') || t.headers.includes('pollinators')))
    .flatMap((t) =>
      t.rows.map((r) => ({
        name: plain([r.plant, r.variety].filter(Boolean).join(' ')).text.replace('★', '').trim(),
        size: plain(r['size (h×w)'] ?? '').text,
        pollinators: plain(r.pollinators ?? '').text,
        image: r.image ?? '',
      })),
    ),
)
const findDetail = (p) =>
  detailRows.find(
    (x) =>
      x.name &&
      ((p.latin && x.name.toLowerCase().includes(p.latin.toLowerCase())) ||
        x.name.toLowerCase().startsWith(p.common.toLowerCase()) ||
        x.name.toLowerCase().includes(`(${p.common.toLowerCase()})`)),
  )

// Photos: the notes' Wikimedia image where there is one, otherwise the Wikipedia
// page's image for the Latin name, then the common name, then the genus. Author and
// licence come from the Commons file. Lookups are cached; PHOTO_REFRESH=1 redoes them.
const photoCachePath = path.join(outDir, 'photo-cache.json')
const photoCache = !process.env.PHOTO_REFRESH && fs.existsSync(photoCachePath) ? JSON.parse(fs.readFileSync(photoCachePath, 'utf8')) : {}
const UA = { 'User-Agent': 'forage-and-flower-importer/1.0 (https://github.com/jkirouac/forage-and-flower)' }
const getJson = async (url) => {
  const res = await fetch(url, { headers: UA })
  return res.ok ? res.json() : null
}
// Wikimedia adds tracking parameters to image addresses; the file is the path's last part.
const cleanUrl = (u) => {
  const url = new URL(u)
  url.search = ''
  return url.toString()
}
const fileOf = (u) => decodeURIComponent(new URL(u).pathname.split('/').pop())
const stripHtml = (s) => (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

async function commonsFile(fileName) {
  const q = new URLSearchParams({
    action: 'query',
    titles: `File:${fileName}`,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '330',
    format: 'json',
  })
  const j = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`)
  const info = j && Object.values(j.query?.pages ?? {})[0]?.imageinfo?.[0]
  if (!info?.thumburl) return null
  const meta = info.extmetadata ?? {}
  const artist = stripHtml(meta.Artist?.value) || 'Unknown author'
  const licence = stripHtml(meta.LicenseShortName?.value) || 'see file page'
  return { url: cleanUrl(info.thumburl), page: info.descriptionurl, credit: `${artist}, ${licence}` }
}

async function wikipediaImage(title) {
  const j = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
  if (!j || j.type === 'disambiguation' || !j.originalimage?.source) return null
  return fileOf(j.originalimage.source)
}

async function findPhoto(p, detail) {
  // The notes' image: [![Alt](thumb)](https://upload.wikimedia.org/.../File.jpg)
  const fromNotes = detail?.image.match(/\]\((https:\/\/upload\.wikimedia\.org\/[^)\s]+)\)\s*$/)?.[1]
  if (fromNotes) {
    const file = await commonsFile(fileOf(fromNotes))
    if (file) return { ...file, found: 'notes' }
  }
  const tries = [
    [p.latin, 'latin'],
    [p.common.replace(/'[^']*'|\([^)]*\)/g, '').trim(), 'common'],
    [p.latin?.split(' ')[0], 'genus'],
  ]
  for (const [title, how] of tries) {
    if (!title) continue
    const fileName = await wikipediaImage(title)
    if (!fileName) continue
    const file = await commonsFile(fileName)
    if (file) return { ...file, found: how }
  }
  return null
}

const photoReport = { notes: [], latin: [], common: [], genus: [], missing: [] }
for (const p of plants.values()) {
  const detail = findDetail(p)
  p.size = detail?.size || null
  p.pollinators = detail?.pollinators || null
  if (!(p.key in photoCache)) photoCache[p.key] = await findPhoto(p, detail)
  const photo = photoCache[p.key]
  p.photo = photo ? { url: photo.url, page: photo.page, credit: photo.credit } : null
  const cultivar = /'[^']+'/.test(p.common) && photo && photo.found !== 'notes' ? ' (the species, not this cultivar)' : ''
  photoReport[photo ? photo.found : 'missing'].push(`${p.common}${cultivar}`)
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(photoCachePath, JSON.stringify(photoCache, null, 2) + '\n')
const detailCount = [...plants.values()].filter((p) => p.size || p.pollinators).length

// ---------- write ----------

const out = {
  generated_at: new Date().toISOString(),
  garden: { name: 'Our garden', region: 'Victoria, BC', zone: '9a', last_frost: '03-06', first_frost: '11-16' },
  sites,
  nurseries,
  plants: [...plants.values()].map((p) => ({ ...p, sources: [...p.sources] })),
  rules,
  plan_items: planItems,
  tasks: tasks.map(({ combined: _combined, ...t }) => t),
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
    decisions.decided_on ? `Decisions file from ${decisions.decided_on}: ${applied.length} answers applied, ${acceptedCount} inferences confirmed.\n` : '',
    section('Needs a decision', report.decide, 'Nothing is loaded until these are answered.'),
    section('Applied from the decisions file', applied, 'Your earlier answers.'),
    section('Inferred', report.inferred, 'The script filled these in. Check they are right.'),
    section('Reminder email vs schedule', report.mismatch, 'In the reminder email but not in schedule.md. Add these to the app, or drop them?'),
    section('Skipped', report.skipped, 'Left out on purpose.'),
    `## Plant pages\n\nSize or pollinators found for ${detailCount} of ${plants.size} plants.\n`,
    section('Photos missing', photoReport.missing, 'No photo found in the notes or on Wikipedia. These show a drawn icon instead.'),
    section('Photos from the genus only', photoReport.genus, 'Wikipedia had no page for the species, so the photo shows a relative. Check these look right.'),
    section('Photos by common name', photoReport.common, 'Found by the common name. Check these are the right plant.'),
    section('Photos by Latin name', photoReport.latin, 'From the Wikipedia page for the species.'),
    section('Photos from the notes', photoReport.notes, 'The image already linked in perennial-flowers.md.'),
  ].join('\n'),
)

console.log(
  `sites ${sites.length} · nurseries ${nurseries.length} · plants ${plants.size} · rules ${rules.length} · plan items ${planItems.length} · tasks ${tasks.length}`,
)
console.log(`decide ${report.decide.length} · inferred ${report.inferred.length} · mismatch ${report.mismatch.length} · skipped ${report.skipped.length}`)
console.log(`written to ${outDir}`)
