// Shrinks each site's design files from the garden notes for the site pages: the
// latest plan, split into its bed drawing (SVG, cropped and minified) and its Plant
// Schedule (read into data, so the app shows the schedule and the bloom chart
// natively), and the concept images (WebP at phone size, with a thumbnail). The
// originals in the garden notes are not touched.
//
//   npm run designs
//
// Reads GARDEN_DIR (.env.local); writes scripts/private/designs/<site>/ and
// scripts/private/designs/designs.json (git-ignored), and prints the sizes before
// anything is uploaded (scripts/upload-designs.mjs does that).

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { optimize } from 'svgo'
import { parseBloom } from '../src/lib/schedule.ts'

const dir = process.env.GARDEN_DIR
if (!dir) throw new Error('Set GARDEN_DIR in .env.local')
const out = path.resolve('scripts/private/designs')

// The garden notes' site folders, by site number.
const FOLDERS = {
  1: 'under-maple',
  2: 'douglas-fir-area',
  3: 'driveway-fence',
  4: 'road-berm',
  5: 'saskatoon-berry',
  6: 'grape-area',
  7: 'driveway-boulevard',
  8: 'backyard-entrance',
  9: 'rhodo-area',
}
const CONCEPT_FOLDERS = ['Gemini images', 'Gemini', 'Design Concepts']
const FULL = 1400
const THUMB = 480
const QUALITY = 80

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

// ---------- splitting a plan SVG ----------

// The plan's sections that the app shows natively (or already shows: the title is
// the site's name), and so leaves out of the drawing.
const NOT_DRAWING = ['title', 'legend', 'bloom-calendar', 'footer']

// Removes <g id="…"> … </g>, counting nested groups.
function removeGroup(svg, id) {
  const start = svg.search(new RegExp(`<g[^>]*\\sid="${id}"`))
  if (start < 0) return svg
  let depth = 0
  const tag = /<g\b[^>]*?(\/?)>|<\/g>/g
  tag.lastIndex = start
  for (let m; (m = tag.exec(svg)); ) {
    if (m[0] === '</g>') depth--
    else if (m[1] !== '/') depth++
    if (depth === 0) return svg.slice(0, start) + svg.slice(m.index + m[0].length)
  }
  return svg
}

const unescape = (t) =>
  t
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, ' ')
    .trim()

// The Plant Schedule's rows: a swatch circle and two-letter key, then text at
// fixed columns.
const COLUMNS = { 120: 'latin', 370: 'common', 615: 'qty', 680: 'size', 830: 'bloom', 950: 'pollinators', 1140: 'role' }
function readSchedule(svg, unread) {
  const start = svg.indexOf('id="legend"')
  if (start < 0) return { schedule: [], note: '' }
  const end = svg.indexOf('id="bloom-calendar"', start)
  const legend = svg.slice(start, end < 0 ? undefined : end)
  const note = unescape(legend.match(/<text[^>]*\sy="22"[^>]*>([^<]*)</)?.[1] ?? '')
  const schedule = []
  for (const [, body] of legend.matchAll(/<g transform="translate\(0,\s*[\d.]+\)">([\s\S]*?)<\/g>/g)) {
    const row = { key: '', fill: null, stroke: null }
    for (const [, x, text] of body.matchAll(/<text x="(\d+)"[^>]*>([^<]*)</g)) {
      if (x === '48') row.key = unescape(text)
      else if (COLUMNS[x]) row[COLUMNS[x]] = unescape(text)
    }
    if (!row.latin && !row.common) continue
    for (const [c] of body.matchAll(/<circle[^>]*>/g)) {
      const fill = c.match(/fill="([^"]+)"/)?.[1]
      const stroke = c.match(/stroke="([^"]+)"/)?.[1]
      if (fill && fill !== 'none' && !row.fill) row.fill = fill
      if (stroke && fill === 'none' && !row.stroke) row.stroke = stroke
    }
    for (const k of Object.values(COLUMNS)) row[k] ??= ''
    const months = parseBloom(row.bloom)
    if (months === null) unread.push(row.bloom)
    schedule.push({ ...row, months: months ?? [] })
  }
  return { schedule, note }
}

// The bed drawing alone: no title, schedule, chart, footer or page background,
// cropped to what's left (rendered once to find its edges).
async function drawingOnly(svg) {
  let s = svg
  for (const id of NOT_DRAWING) s = removeGroup(s, id)
  const [, , , vw, vh] = s.match(/viewBox="(\S+) (\S+) (\S+) (\S+)"/)
  // The parchment: a rect covering the whole page.
  s = s.replace(/<rect\b[^>]*>/g, (r) => {
    const w = r.match(/\swidth="([^"]+)"/)?.[1]
    const h = r.match(/\sheight="([^"]+)"/)?.[1]
    return (w === vw || w === '100%') && (h === vh || h === '100%') ? '' : r
  })
  const { info } = await sharp(Buffer.from(s)).png().trim({ threshold: 0 }).toBuffer({ resolveWithObject: true })
  const pad = 16
  const x = Math.max(0, -info.trimOffsetLeft - pad)
  const y = Math.max(0, -info.trimOffsetTop - pad)
  const w = Math.min(Number(vw) - x, info.width + pad * 2)
  const h = Math.min(Number(vh) - y, info.height + pad * 2)
  return s
    .replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`)
    .replace(/(<svg\b[^>]*?)\s(width|height)="[^"]*"/g, '$1')
    .replace(/(<svg\b[^>]*?)\s(width|height)="[^"]*"/g, '$1')
}

// "saskatoon-berry-plan-v3.svg" -> 3; no version -> 1.
const version = (file) => Number(file.match(/-v(\d+)\b/)?.[1] ?? 1)

async function webp(src, dest, width) {
  const info = await sharp(src).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(dest)
  return info
}

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

const manifest = {}
let before = 0
let after = 0
for (const [n, folder] of Object.entries(FOLDERS)) {
  const site = path.join(dir, 'spaces', folder)
  if (!fs.existsSync(site)) continue
  const dest = path.join(out, n)
  fs.mkdirSync(dest, { recursive: true })
  const entries = []

  // The latest plan: the bed drawing, and its Plant Schedule as data.
  const svgs = fs.readdirSync(site).filter((f) => /-plan(-v\d+)?\.svg$/.test(f))
  const latest = svgs.sort((a, b) => version(b) - version(a))[0]
  let rows = 0
  if (latest) {
    const src = path.join(site, latest)
    const raw = fs.readFileSync(src, 'utf8')
    const unread = []
    const { schedule, note } = readSchedule(raw, unread)
    const { data } = optimize(await drawingOnly(raw), { multipass: true })
    const file = 'plan.svg'
    fs.writeFileSync(path.join(dest, file), data)
    before += Buffer.byteLength(raw)
    after += Buffer.byteLength(data)
    rows = schedule.length
    const v = version(latest)
    entries.push({ kind: 'plan', file, title: v > 1 ? `Plan, version ${v}` : 'Plan', schedule, scheduleNote: note })
    if (unread.length) console.log(`  Site ${n}: couldn't read bloom text: ${unread.map((u) => JSON.stringify(u)).join(', ')}`)
  }

  // Concept images.
  let i = 0
  for (const sub of CONCEPT_FOLDERS) {
    const folderPath = path.join(site, sub)
    if (!fs.existsSync(folderPath)) continue
    for (const f of fs.readdirSync(folderPath).filter((x) => /\.(png|jpe?g)$/i.test(x)).sort()) {
      i++
      const src = path.join(folderPath, f)
      const file = `concept-${i}.webp`
      const thumb = `concept-${i}-thumb.webp`
      const full = await webp(src, path.join(dest, file), FULL)
      const small = await webp(src, path.join(dest, thumb), THUMB)
      before += fs.statSync(src).size
      after += full.size + small.size
      entries.push({ kind: 'concept', file, thumb, title: `Concept ${i}`, width: full.width, height: full.height })
    }
  }

  if (entries.length) manifest[n] = entries
  const size = fs.readdirSync(dest).reduce((s, f) => s + fs.statSync(path.join(dest, f)).size, 0)
  console.log(`Site ${n} ${folder}: ${entries.length} files, ${kb(size)}${rows ? `, ${rows} plants in the schedule` : ''}`)
}

fs.writeFileSync(path.join(out, 'designs.json'), JSON.stringify(manifest, null, 2))
console.log(`\nOriginals used: ${mb(before)}. For the app: ${mb(after)} (${Math.round((1 - after / before) * 100)}% smaller).`)
