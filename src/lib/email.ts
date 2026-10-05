// The monthly email, built from the app's own data (PLAN.md, build step 7). Pure, so
// it runs in the Supabase function that serves it (supabase/functions/garden-email)
// and in the tests (scripts/email.test.ts). It says what This month says: the
// month's jobs under Do / Plant / Buy, tasks moved on from last month, and the
// shopping list by nursery while it's being shopped for.

import { buildMonth, previousMonth, SECTIONS, type Check, type Section, type Task } from './month.ts'
import { buyingSeason, groupByNursery, groupByPlant, qtyLabel, seasonLabel, type Nursery, type PlanItem, type Plant } from './plan.ts'

export interface EmailData {
  gardenName: string
  region: string | null
  zone: string | null
  members: Record<string, string> // user id -> initials
  tasks: Task[]
  checks: Check[]
  items: PlanItem[]
  plants: Plant[]
  nurseries: Nursery[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const LABELS: Record<Section, string> = { do: 'Do', plant: 'Plant', buy: 'Buy' }
const APP_URL = 'https://garden.packed.camp'

// Field Guide colours, written inline because email clients ignore stylesheets.
const INK = '#22251f'
const MUTED = '#5d5f55'
const ACCENT = '#2f5d46'
const LINE = '#d9d2c1'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// "Last month: 7 jobs ticked off (JK 4, JD 3)." Nothing when nothing was ticked.
export function recap(data: EmailData, year: number, month: number) {
  const prev = previousMonth(year, month)
  const done = data.checks.filter((c) => c.year === prev.year && c.month === prev.month && c.outcome === 'done')
  if (done.length === 0) return null
  const by = new Map<string, number>()
  for (const c of done) {
    const who = (c.done_by && data.members[c.done_by]) || '?'
    by.set(who, (by.get(who) ?? 0) + 1)
  }
  const people = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([who, n]) => `${who} ${n}`)
  return `In ${MONTHS[prev.month - 1]} you ticked off ${done.length} ${done.length === 1 ? 'job' : 'jobs'} (${people.join(', ')}).`
}

// A task's line: a YouTube "how to" becomes a thumbnail, as in the old email.
function taskHtml(task: Task, from: number | null) {
  const from_ = from ? ` <span style="color:${MUTED}">(moved on from ${MONTHS[from - 1]})</span>` : ''
  const every = task.every_month ? ` <span style="color:${MUTED}">(every month)</span>` : ''
  const video = task.link?.match(/youtube\.com\/watch\?v=([\w-]+)/)?.[1]
  const link = !task.link
    ? ''
    : video
      ? `<br><a href="${esc(task.link)}"><img src="https://img.youtube.com/vi/${video}/hqdefault.jpg" alt="How to: ${esc(task.title)}" width="320" style="width:320px;max-width:100%;border-radius:8px;border:1px solid ${LINE}"></a>`
      : ` <a href="${esc(task.link)}" style="color:${ACCENT}">How to</a>`
  return `<li style="margin:0 0 8px">${esc(task.title)}${from_}${every}${link}</li>`
}

// Buy: what's still to buy on the list being shopped for, one line per nursery.
function buyHtml(data: EmailData, season: string) {
  const items = data.items.filter((i) => i.season === season && i.status === 'to buy' && !i.cleared_at)
  if (items.length === 0) return `<p style="color:${MUTED}">Everything on the ${seasonLabel(season)} list is bought.</p>`
  const groups = groupByNursery(items, data.nurseries, data.plants)
  // Counted by plant, as on Shopping: Great Camas for five sites is one thing to buy.
  const count = groups.reduce((n, g) => n + groupByPlant(g.items, data.plants).length, 0)
  // One block per nursery, like a shopping list: the nursery, then a plant a line
  // with how many on the right. Tables, because email clients ignore most layout CSS.
  const blocks = groups.map((g) => {
    const plants = groupByPlant(g.items, data.plants)
      .map((pg) => ({ name: data.plants.find((p) => p.id === pg.plant_id)?.common ?? 'Unknown plant', qty: qtyLabel(pg.qtyMin, pg.qtyMax) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const rows = plants
      .map(
        (p) =>
          `<tr><td style="padding:5px 0;border-top:1px solid ${LINE}">${esc(p.name)}</td><td style="padding:5px 0 5px 12px;border-top:1px solid ${LINE};text-align:right;white-space:nowrap;color:${MUTED}">× ${esc(p.qty)}</td></tr>`,
      )
      .join('')
    const name = g.nursery?.name ?? 'No nursery yet'
    const sub = [g.nursery?.location, `${plants.length} ${plants.length === 1 ? 'plant' : 'plants'}`].filter(Boolean).join(' · ')
    return `<div style="margin:0 0 18px">
<p style="margin:0;font-weight:600">${esc(name)}</p>
<p style="margin:0 0 4px;font-size:14px;color:${MUTED}">${esc(sub)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:15px">${rows}</table>
</div>`
  })
  return `<p style="color:${MUTED};margin:0 0 12px">From the ${seasonLabel(season)} list, ${count} ${count === 1 ? 'plant' : 'plants'} still to buy:</p>${blocks.join('')}`
}

export function buildEmail(data: EmailData, year: number, month: number) {
  const list = buildMonth(data.tasks, data.checks, year, month)
  const season = buyingSeason(year, month)
  const where = [data.region, data.zone ? `zone ${data.zone}` : null].filter(Boolean).join(' · ')
  const subject = `Garden tasks — ${MONTHS[month - 1]} ${year}`
  const summary = recap(data, year, month)

  const sections = SECTIONS.map((s) => {
    const items = list[s].filter((i) => !i.check || i.check.outcome !== 'done')
    const tasks = items.length ? `<ul style="padding-left:20px;margin:0">${items.map((i) => taskHtml(i.task, i.pushedFrom)).join('')}</ul>` : ''
    const body = s === 'buy' && season ? buyHtml(data, season) + tasks : tasks
    if (!body) return ''
    return `<h2 style="font:600 13px/1.4 sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};margin:24px 0 8px">${LABELS[s]}</h2>${body}`
  }).join('')

  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#f5f1e6;color:${INK};font:16px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto">
<p style="font:600 12px/1.4 sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${ACCENT};margin:0">${esc(data.gardenName)}${where ? ` · ${esc(where)}` : ''}</p>
<h1 style="font:600 28px/1.2 Georgia,serif;margin:4px 0 12px">${MONTHS[month - 1]} in the garden</h1>
${summary ? `<p style="margin:0 0 8px">${esc(summary)}</p>` : ''}
<hr style="border:0;border-top:1px solid ${LINE};margin:12px 0">
${sections || `<p>Nothing on the list this month. Rest up.</p>`}
<hr style="border:0;border-top:1px solid ${LINE};margin:24px 0 12px">
<p style="margin:0"><a href="${APP_URL}" style="color:${ACCENT};font-weight:600">Open Forage &amp; Flower</a> to tick things off, move them to next month, or see the shopping list.</p>
</div></body></html>`

  return { subject, html }
}
