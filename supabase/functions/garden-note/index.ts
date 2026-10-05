// Voice notes: tidies a spoken note with Claude and sorts it into one-off tasks and
// journal notes for the Month screen. Nothing is saved here; the phone shows the
// result for review and saves it through its outbox.
//
//   POST /functions/v1/garden-note   { "transcript": "um pick up fir mulch next month" }
//   Authorization: Bearer <the signed-in person's access token>
//
// Returns { items: DraftItem[] } (src/lib/notes.ts). Deployed with JWT verification
// on. It reads the garden as the caller, so row-level security decides what it can
// see: someone outside a garden gets 403. The service key is never used.
//
// Secret (supabase secrets set): ANTHROPIC_API_KEY. SUPABASE_URL and
// SUPABASE_ANON_KEY are provided by Supabase.

import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cleanItems, MAX_SPOKEN } from '../../../src/lib/notes.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '', timeout: 25_000, maxRetries: 1 })

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const INSTRUCTIONS = `You tidy short voice notes for a home garden app shared by two gardeners. Each note was spoken outdoors into a phone and transcribed by speech recognition, so expect filler words, restarts and misheard plant names.

Turn the note into one or more items. Each item is either:
- "task": something to act on later (buy, plant, divide, prune, move, sow, check). Give it a section: "buy" for anything to pick up or order, "plant" for putting plants or seeds in the ground, "do" for everything else.
- "note": an observation or record ("the camas by the path came up thin", "first hummingbird at the currant"). Section "none".

How to write each item:
- Keep the speaker's meaning and their words. Remove filler, restarts and repeats; fix grammar. Never add advice, reasons or steps they didn't say.
- Tasks read as a short instruction starting with a verb ("Pick up fir mulch at Sooke Soil"). Notes read as one or two plain sentences.
- When a nursery or garden centre below is meant, use its name exactly as listed. Speech recognition often mangles these ("suksoil" or "soups oil" for Sooke Soil), so match by sound.
- When a plant in the garden's catalogue is meant, use its common name exactly as the catalogue writes it, and list its id in plant_ids. Match misheard or half-remembered names (Latin or common) to the closest catalogue plant only when you are confident.
- Pick the month the item belongs in. Use what was said ("next month", "in March", "before the first frost", "this fall"); with no time given, use the current month. Give the year that month next falls in, counting the current month as this one.
- Split the note only where there are clearly separate thoughts. Most notes are one item.

Garden rules: if an item plans something that one of the garden's rules below forbids for that plant or site, add a clash with that rule's id and one short sentence saying what to do instead, in the rule's own terms ("Site 4 is a lean site: no castings."). Flag a clash only when a rule directly applies. Otherwise leave clashes empty.`

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['task', 'note'] },
          section: { type: 'string', enum: ['do', 'plant', 'buy', 'none'] },
          text: { type: 'string' },
          year: { type: 'integer' },
          month: { type: 'integer' },
          plant_ids: { type: 'array', items: { type: 'string' } },
          clashes: {
            type: 'array',
            items: {
              type: 'object',
              properties: { rule_id: { type: 'string' }, text: { type: 'string' } },
              required: ['rule_id', 'text'],
              additionalProperties: false,
            },
          },
        },
        required: ['kind', 'section', 'text', 'year', 'month', 'plant_ids', 'clashes'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

function victoriaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({})
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const body = await req.json().catch(() => null)
  const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : ''
  if (!transcript) return json({ error: 'Nothing was said.' }, 400)
  if (transcript.length > MAX_SPOKEN) return json({ error: 'That note is too long. Keep it under a minute or two.' }, 413)

  // Read as the caller: row-level security limits this to their own garden.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    db: { schema: 'garden' },
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const garden = await db.from('gardens').select('id, region, zone, last_frost, first_frost').limit(1).maybeSingle()
  // Signed out: the database refuses the anonymous role outright.
  if (garden.error?.code === '42501') return json({ error: 'Not part of a garden.' }, 403)
  if (garden.error) return json({ error: "Couldn't read the garden." }, 500)
  if (!garden.data) return json({ error: 'Not part of a garden.' }, 403)
  const gardenId = garden.data.id

  const [plants, sites, rules, nurseries] = await Promise.all([
    db.from('plants').select('id, common, latin').order('common'),
    db.from('sites').select('id, number, name, conditions').eq('garden_id', gardenId).order('number'),
    db.from('rules').select('id, topic, verdict, text, plant_id, tag, kind, site_id, garden_id'),
    db.from('nurseries').select('name, location').order('name'),
  ])
  const error = plants.error ?? sites.error ?? rules.error ?? nurseries.error
  if (error) return json({ error: "Couldn't read the garden." }, 500)
  const gardenRules = rules.data.filter((r) => r.garden_id === null || r.garden_id === gardenId)

  // Stable for the garden, so it's cached between notes; what changes goes after it.
  const siteNumber = new Map(sites.data.map((s) => [s.id, s.number]))
  const plantName = new Map(plants.data.map((p) => [p.id, p.common]))
  const context = [
    `Garden: ${garden.data.region ?? ''}, zone ${garden.data.zone ?? ''}. Last spring frost ${garden.data.last_frost ?? 'unknown'}, first fall frost ${garden.data.first_frost ?? 'unknown'} (MM-DD).`,
    '',
    'Sites:',
    ...sites.data.map((s) => `- Site ${s.number}: ${s.name}${s.conditions ? `; ${s.conditions}` : ''}`),
    '',
    'Nurseries:',
    ...nurseries.data.map((n) => `- ${n.name}${n.location ? ` (${n.location})` : ''}`),
    '',
    'Plant catalogue (id | common name | Latin name):',
    ...plants.data.map((p) => `${p.id} | ${p.common} | ${p.latin ?? ''}`),
    '',
    'Garden rules (id | applies to | rule):',
    ...gardenRules.map((r) => {
      const to = r.site_id
        ? `Site ${siteNumber.get(r.site_id) ?? '?'}`
        : r.plant_id
          ? (plantName.get(r.plant_id) ?? 'a plant')
          : r.tag
            ? `plants tagged ${r.tag}`
            : r.kind
              ? `${r.kind} plants`
              : 'the whole garden'
      return `${r.id} | ${to} | ${r.verdict === 'no' ? 'No' : 'Yes'}: ${r.topic}. ${r.text}`
    }),
  ].join('\n')

  const today = victoriaToday()
  let response
  try {
    response = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: [
        { type: 'text', text: INSTRUCTIONS },
        { type: 'text', text: context, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: `Today is ${MONTHS[today.month - 1]} ${today.day}, ${today.year}.\n\nThe voice note, as transcribed:\n<note>\n${transcript}\n</note>`,
        },
      ],
    } as Parameters<typeof anthropic.beta.messages.create>[0])
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : undefined
    console.error('Claude call failed', status, e instanceof Error ? e.message : e)
    return json({ error: "Couldn't reach Claude." }, 502)
  }

  if (response.stop_reason === 'refusal') return json({ error: "Claude couldn't tidy this note." }, 422)
  if (response.stop_reason === 'max_tokens') return json({ error: 'That note came back cut short.' }, 502)
  const text = response.content.find((b) => b.type === 'text')
  let parsed: unknown = null
  try {
    parsed = text && 'text' in text ? JSON.parse(text.text) : null
  } catch {
    parsed = null
  }
  const items = cleanItems(parsed, {
    plantIds: new Set(plants.data.map((p) => p.id)),
    ruleIds: new Set(gardenRules.map((r) => r.id)),
    today: { year: today.year, month: today.month },
  })
  if (items.length === 0) return json({ error: 'Nothing usable came back.' }, 502)
  return json({ items })
})
