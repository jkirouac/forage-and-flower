// Voice notes: what Claude sends back after tidying a spoken note, the checks that
// keep it to this garden's real plants, rules and months, and the rows it saves
// as. Pure, so it can be tested without a database (scripts/notes.test.ts); the
// garden-note function uses cleanItems too.

import type { Section } from './month.ts'
import type { Op } from './ops.ts'

export type ItemKind = 'task' | 'note'

export interface Clash {
  rule_id: string
  text: string // "Site 4 is a lean site: no castings."
}

// One thing from a spoken note: a one-off task, or a journal note.
export interface DraftItem {
  kind: ItemKind
  section: Section | null // tasks only
  text: string
  year: number
  month: number
  plant_ids: string[]
  clashes: Clash[]
}

export interface MonthRef {
  year: number
  month: number
}

export const MAX_SPOKEN = 2000
const MAX_TEXT = 1000
const SECTIONS: Section[] = ['do', 'plant', 'buy']

const order = (r: MonthRef) => r.year * 12 + r.month - 1

// A note goes in this month or one of the next eleven, the months the review can
// pick from. A month already past this year means next year's ("in March", said
// in October).
export function intoWindow(today: MonthRef, year: unknown, month: unknown): MonthRef {
  const m = Number.isInteger(month) && (month as number) >= 1 && (month as number) <= 12 ? (month as number) : today.month
  let y = Number.isInteger(year) ? (year as number) : today.year
  if (order({ year: y, month: m }) < order(today) || order({ year: y, month: m }) > order(today) + 11)
    y = m >= today.month ? today.year : today.year + 1
  return { year: y, month: m }
}

// Keeps only what's usable from Claude's reply: known plant and rule ids, a month
// in the window, a section for every task, non-empty text.
export function cleanItems(raw: unknown, known: { plantIds: Set<string>; ruleIds: Set<string>; today: MonthRef }): DraftItem[] {
  const items = (raw as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  const out: DraftItem[] = []
  for (const it of items as Record<string, unknown>[]) {
    const text = typeof it?.text === 'string' ? it.text.trim().slice(0, MAX_TEXT) : ''
    if (!text) continue
    const kind: ItemKind = it.kind === 'task' ? 'task' : 'note'
    const section = kind === 'task' ? (SECTIONS.includes(it.section as Section) ? (it.section as Section) : 'do') : null
    const plant_ids = Array.isArray(it.plant_ids)
      ? [...new Set(it.plant_ids.filter((id): id is string => typeof id === 'string' && known.plantIds.has(id)))]
      : []
    const clashes = Array.isArray(it.clashes)
      ? (it.clashes as Record<string, unknown>[])
          .filter((c) => typeof c?.rule_id === 'string' && known.ruleIds.has(c.rule_id) && typeof c.text === 'string' && c.text.trim())
          .map((c) => ({ rule_id: c.rule_id as string, text: (c.text as string).trim() }))
      : []
    out.push({ kind, section, text, ...intoWindow(known.today, it.year, it.month), plant_ids, clashes })
  }
  return out
}

// When Claude can't be reached: what was said, as a note for this month.
export function rawNote(spoken: string, today: MonthRef): DraftItem {
  return { kind: 'note', section: null, text: spoken.trim().slice(0, MAX_TEXT), ...today, plant_ids: [], clashes: [] }
}

// The outbox changes that save the reviewed items.
export function toOps(items: DraftItem[], spoken: string, gardenId: string, userId: string, at = new Date().toISOString()): Op[] {
  const said = spoken.trim().slice(0, MAX_SPOKEN) || null
  return items
    .filter((i) => i.text.trim())
    .map((i): Op =>
      i.kind === 'task'
        ? {
            kind: 'task-insert',
            row: {
              id: crypto.randomUUID(),
              garden_id: gardenId,
              section: i.section ?? 'do',
              title: i.text.trim(),
              month: i.month,
              year: i.year,
              every_month: false,
              position: 0,
              plant_id: i.plant_ids.length === 1 ? i.plant_ids[0] : null,
              spoken: said,
              created_by: userId,
              source: 'voice',
            },
          }
        : {
            kind: 'note-insert',
            row: {
              id: crypto.randomUUID(),
              garden_id: gardenId,
              year: i.year,
              month: i.month,
              text: i.text.trim(),
              spoken: said,
              written_by: userId,
              written_at: at,
            },
          },
    )
}
