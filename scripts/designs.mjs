// Shrinks each site's design files from the garden notes for the site pages:
// the latest plan drawing (SVG, minified) and the concept images (WebP at phone
// size, with a thumbnail). The originals in the garden notes are not touched.
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

  // The latest plan drawing.
  const svgs = fs.readdirSync(site).filter((f) => /-plan(-v\d+)?\.svg$/.test(f))
  const latest = svgs.sort((a, b) => version(b) - version(a))[0]
  if (latest) {
    const src = path.join(site, latest)
    const raw = fs.readFileSync(src, 'utf8')
    const { data } = optimize(raw, { multipass: true })
    const file = 'plan.svg'
    fs.writeFileSync(path.join(dest, file), data)
    before += Buffer.byteLength(raw)
    after += Buffer.byteLength(data)
    const v = version(latest)
    entries.push({ kind: 'plan', file, title: v > 1 ? `Plan, version ${v}` : 'Plan' })
  }

  // A rendered plan, where there is one (Saskatoon's v3).
  for (const f of fs.readdirSync(site).filter((x) => /-plan(-v\d+)?-render\.png$/.test(x))) {
    const src = path.join(site, f)
    const file = 'plan-render.webp'
    const thumb = 'plan-render-thumb.webp'
    const full = await webp(src, path.join(dest, file), FULL)
    const small = await webp(src, path.join(dest, thumb), THUMB)
    before += fs.statSync(src).size
    after += full.size + small.size
    entries.push({ kind: 'concept', file, thumb, title: 'Plan, drawn up', width: full.width, height: full.height })
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
  console.log(`Site ${n} ${folder}: ${entries.length} files, ${kb(size)}`)
}

fs.writeFileSync(path.join(out, 'designs.json'), JSON.stringify(manifest, null, 2))
console.log(`\nOriginals used: ${mb(before)}. For the app: ${mb(after)} (${Math.round((1 - after / before) * 100)}% smaller).`)
