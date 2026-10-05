// The monthly email, served to the reminder job (PLAN.md, build step 7).
//
//   GET /functions/v1/garden-email            this month, in Victoria's time zone
//   GET /functions/v1/garden-email?month=2026-11
//   Authorization: Bearer <GARDEN_EMAIL_TOKEN>
//
// Returns { subject, html }. The token can do nothing but fetch this email; the
// project's service key, which reads the garden, never leaves Supabase.
//
// Secrets (supabase secrets set): GARDEN_EMAIL_TOKEN, GARDEN_ID. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Deployed with --no-verify-jwt:
// the caller is a GitHub job, not a signed-in person.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildEmail, type EmailData } from '../../../src/lib/email.ts'

const TOKEN = Deno.env.get('GARDEN_EMAIL_TOKEN') ?? ''
const GARDEN_ID = Deno.env.get('GARDEN_ID') ?? ''

// Compare without leaking how much of the token matched.
function sameToken(given: string) {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(TOKEN)
  if (!TOKEN || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function victoriaMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: 'numeric' }).formatToParts(new Date())
  return { year: Number(parts.find((p) => p.type === 'year')!.value), month: Number(parts.find((p) => p.type === 'month')!.value) }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405)
  const auth = req.headers.get('Authorization') ?? ''
  if (!sameToken(auth.replace(/^Bearer\s+/i, ''))) return json({ error: 'Not allowed' }, 401)
  if (!GARDEN_ID) return json({ error: 'GARDEN_ID is not set' }, 500)

  const asked = new URL(req.url).searchParams.get('month')?.match(/^(\d{4})-(\d{1,2})$/)
  const { year, month } = asked ? { year: Number(asked[1]), month: Number(asked[2]) } : victoriaMonth()
  if (month < 1 || month > 12) return json({ error: 'month must be YYYY-MM' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'garden' },
    auth: { persistSession: false },
  })
  const [garden, members, tasks, checks, items, plants, nurseries] = await Promise.all([
    db.from('gardens').select('name, region, zone').eq('id', GARDEN_ID).single(),
    db.from('members').select('user_id, initials').eq('garden_id', GARDEN_ID),
    db.from('tasks').select('id, section, title, detail, link, month, every_month, position, year').eq('garden_id', GARDEN_ID).order('position'),
    db
      .from('task_checks')
      .select('task_id, year, month, outcome, done_by, done_at, cleared_at')
      .eq('garden_id', GARDEN_ID)
      .gte('year', year - 1),
    db
      .from('plan_items')
      .select('id, garden_id, plant_id, site_id, season, status, qty_min, qty_max, nursery_id, spot, notes, cleared_at, status_by')
      .eq('garden_id', GARDEN_ID),
    db.from('plants').select('id, key, common, latin, kind'),
    db.from('nurseries').select('id, name, location, last_checked'),
  ])
  const error = garden.error ?? members.error ?? tasks.error ?? checks.error ?? items.error ?? plants.error ?? nurseries.error
  if (error) return json({ error: `Couldn't read the garden: ${error.message}` }, 500)

  const data: EmailData = {
    gardenName: garden.data.name,
    region: garden.data.region,
    zone: garden.data.zone,
    members: Object.fromEntries(members.data.map((m) => [m.user_id, m.initials])),
    tasks: tasks.data,
    checks: checks.data,
    items: items.data,
    plants: plants.data,
    nurseries: nurseries.data,
  }
  return json(buildEmail(data, year, month))
})
