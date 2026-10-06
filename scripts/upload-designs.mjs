// Uploads the shrunk design files (npm run designs) to the garden's private bucket
// and writes each site's list of designs (sites.designs):
//
//   npm run upload:designs -- <garden-id>
//
// Run by whoever manages the shared project. The service key is fetched at run time
// with the Supabase CLI (logged in), used for this run only, and never written to
// disk. GARDEN_PROJECT_REF comes from .env.local. Running it again replaces the
// files and the lists.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const gardenId = process.argv[2]
if (!/^[0-9a-f-]{36}$/.test(gardenId ?? '')) throw new Error('Pass the garden id: npm run upload:designs -- <garden-id>')
const ref = process.env.GARDEN_PROJECT_REF
if (!ref) throw new Error('Set GARDEN_PROJECT_REF in .env.local')

const dir = path.resolve('scripts/private/designs')
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'designs.json'), 'utf8'))

const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
const service = keys.find((k) => k.name === 'service_role')?.api_key
if (!service) throw new Error('No service_role key; is the Supabase CLI logged in?')

const db = createClient(`https://${ref}.supabase.co`, service, { db: { schema: 'garden' }, auth: { persistSession: false } })
const TYPES = { '.svg': 'image/svg+xml', '.webp': 'image/webp' }

let files = 0
let bytes = 0
for (const [n, entries] of Object.entries(manifest)) {
  const names = entries.flatMap((e) => [e.file, e.thumb].filter(Boolean))
  for (const name of names) {
    const body = fs.readFileSync(path.join(dir, n, name))
    const { error } = await db.storage
      .from('garden-designs')
      .upload(`${gardenId}/${n}/${name}`, body, { contentType: TYPES[path.extname(name)], upsert: true, cacheControl: '31536000' })
    if (error) throw new Error(`Site ${n}, ${name}: ${error.message}`)
    files++
    bytes += body.length
  }
  const { error, count } = await db.from('sites').update({ designs: entries }, { count: 'exact' }).eq('garden_id', gardenId).eq('number', Number(n))
  if (error) throw new Error(`Site ${n}: ${error.message}`)
  console.log(`Site ${n}: ${names.length} files uploaded${count === 1 ? '' : ` (no site ${n} in this garden!)`}`)
}
console.log(`\nDone: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB.`)
