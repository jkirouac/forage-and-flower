// A site plan's Plant Schedule, pulled out of the drawing (scripts/designs.mjs) so
// the site page can show it natively: the bloom months read from its text, each
// row's status against the garden, and the rows for the "Through the year" chart.
// Pure, so it can be tested without a database (scripts/schedule.test.ts).

import { isCritical } from './pollinators.ts'

export interface ScheduleRow {
  key: string // the two letters on the drawing ("Lv"); empty for unlabelled symbols
  fill: string | null // the drawing's swatch colours
  stroke: string | null
  latin: string
  common: string
  qty: string
  size: string
  bloom: string // as written: "Jun–Aug", "May–Sep (rebloom)", "non-flowering"
  months: number[] // read from bloom
  pollinators: string
  role: string
}

const MONTH = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
// "Jun–frost": the first fall frost here is mid-November.
const FROST = 11

const monthOf = (word: string) => {
  const w = word.trim().toLowerCase()
  if (w === 'frost') return FROST
  const i = MONTH.indexOf(w.slice(0, 3))
  return i < 0 ? null : i + 1
}

// "Jun–Aug" -> [6, 7, 8]; "Nov–Feb" wraps the year; "Apr (white)" -> [4];
// "non-flowering" or "—" -> []. Returns null for text it can't read.
export function parseBloom(text: string): number[] | null {
  const t = text.replace(/\(.*?\)/g, '').trim()
  if (!t || /^[—–-]+$/.test(t) || /non-?flowering|none/i.test(t)) return []
  const parts = t.split(/\s*[–—-]\s*|\s+to\s+/i)
  if (parts.length === 1) {
    const m = monthOf(parts[0])
    return m ? [m] : null
  }
  if (parts.length !== 2) return null
  const a = monthOf(parts[0])
  const b = monthOf(parts[1])
  if (!a || !b) return null
  const out: number[] = []
  for (let m = a; ; m = (m % 12) + 1) {
    out.push(m)
    if (m === b || out.length > 12) break
  }
  return out
}

export type Status = 'in the ground' | 'planned' | 'not planned'

// A schedule row against the garden: is that plant in the ground at this site,
// planned for it, or not yet? Matched to the site's plants by common name (as
// written, then without a cultivar), then by Latin name.
export function scheduleStatus(
  row: Pick<ScheduleRow, 'common' | 'latin'>,
  here: { inGround: { id: string; common: string; latin: string | null }[]; onLists: { id: string; common: string; latin: string | null }[] },
): { status: Status; plantId: string | null } {
  const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/\(.*?\)|'.*'|"[^"]*"/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  const same = (p: { common: string; latin: string | null }) =>
    norm(p.common) === norm(row.common) ||
    (norm(row.latin) !== '' && norm(p.latin) === norm(row.latin)) ||
    (norm(row.common) !== '' && (norm(p.common).startsWith(norm(row.common)) || norm(row.common).startsWith(norm(p.common))))
  const g = here.inGround.find(same)
  if (g) return { status: 'in the ground', plantId: g.id }
  const l = here.onLists.find(same)
  if (l) return { status: 'planned', plantId: l.id }
  return { status: 'not planned', plantId: null }
}

// The "Through the year" chart: rows sorted by first bloom month (non-flowering
// last), and how many are in flower each month, with critical months that have
// none marked as gaps.
export function bloomRows(schedule: ScheduleRow[]) {
  // A season that wraps the year (Nov–Mar) starts in Nov.
  const first = (r: ScheduleRow) => {
    if (r.months.length === 0) return 99
    const set = new Set(r.months)
    return r.months.find((m) => !set.has(m === 1 ? 12 : m - 1)) ?? r.months[0]
  }
  const rows = [...schedule].sort((a, b) => first(a) - first(b) || a.common.localeCompare(b.common))
  const counts = Array.from({ length: 12 }, (_, i) => schedule.filter((r) => r.months.includes(i + 1)).length)
  const gaps = counts.map((c, i) => c === 0 && isCritical(i + 1))
  return { rows, counts, gaps }
}
