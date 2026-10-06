// What This month shows, worked out from the garden's tasks and ticks. Pure, so the
// rules can be tested without a database (scripts/month.test.ts).
//
// - A task belongs to its month every year, or to every month. A one-off task (a
//   voice note) belongs to its month in one year only.
// - A tick is per task per month: done, or pushed to the next month.
// - A task pushed last month shows this month as well, marked where it came from.
//   Pushed tasks are never shown as overdue (DESIGN.md).

export type Section = 'do' | 'plant' | 'buy'
export type Outcome = 'done' | 'pushed'

export interface Task {
  id: string
  section: Section
  title: string
  detail: string | null
  link: string | null
  month: number | null
  every_month: boolean
  position: number
  year?: number | null // set on one-off tasks; null or missing means every year
  spoken?: string | null // what was said, for tasks added by voice
  site_id?: string | null // set to one site (the site page's to-dos); null is garden-wide
}

// A journal note under a month ("Camas by the path came up thin").
export interface Note {
  id: string
  year: number
  month: number
  text: string
  spoken: string | null
  written_by: string | null
  written_at: string
}

export interface Check {
  task_id: string
  year: number
  month: number
  outcome: Outcome
  done_by: string | null
  done_at: string
  cleared_at: string | null // hidden from the list since then (Clear checked off)
}

export interface Item {
  task: Task
  // This month's tick, if any.
  check: Check | null
  // Set when the task was pushed here from last month.
  pushedFrom: number | null
}

export type MonthList = Record<Section, Item[]>

export const SECTIONS: Section[] = ['do', 'plant', 'buy']

export function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

export function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

export function checkKey(taskId: string, year: number, month: number) {
  return `${taskId}:${year}:${month}`
}

export function buildMonth(tasks: Task[], checks: Check[], year: number, month: number): MonthList {
  const byKey = new Map(checks.map((c) => [checkKey(c.task_id, c.year, c.month), c]))
  const prev = previousMonth(year, month)
  const list: MonthList = { do: [], plant: [], buy: [] }

  for (const task of tasks) {
    const own = task.every_month || (task.month === month && (task.year == null || task.year === year))
    const pushed = byKey.get(checkKey(task.id, prev.year, prev.month))?.outcome === 'pushed'
    if (!own && !pushed) continue
    list[task.section]?.push({
      task,
      check: byKey.get(checkKey(task.id, year, month)) ?? null,
      // A task that is this month's anyway doesn't need a "from" label.
      pushedFrom: !own && pushed ? prev.month : null,
    })
  }

  // Carried-over tasks first, then every-month jobs, then the month's own in schedule order.
  const rank = (i: Item) => (i.pushedFrom ? 0 : i.task.every_month ? 1 : 2)
  for (const section of SECTIONS) {
    list[section].sort((a, b) => rank(a) - rank(b) || a.task.position - b.task.position || a.task.title.localeCompare(b.task.title))
  }
  return list
}

// A month's notes, oldest first, as a notebook reads.
export function notesFor(notes: Note[], year: number, month: number) {
  return notes.filter((n) => n.year === year && n.month === month).sort((a, b) => a.written_at.localeCompare(b.written_at))
}

// How many of the month's tasks are still open (not done, not pushed on).
export function openCount(list: MonthList) {
  return SECTIONS.reduce((n, s) => n + list[s].filter((i) => !i.check).length, 0)
}

// This month and the ones after it, for the month headers: [{2026, 10}, {2026, 11}, …].
export function upcomingMonths(year: number, month: number, count: number) {
  const out = [{ year, month }]
  while (out.length < count) out.push(nextMonth(out[out.length - 1].year, out[out.length - 1].month))
  return out
}

// To do's chips: All, Do, Plant, Buy (the shopping list) and Notes.
export type TodoView = 'all' | Section | 'notes'

// #todo -> all, #todo/buy -> buy. Old addresses still land: #month is To do,
// #seasons (the old Shopping tab) is To do › Buy. Anything else is null.
export function todoFromHash(hash: string): TodoView | null {
  const id = hash.replace(/^#/, '')
  if (id === 'todo' || id === 'month') return 'all'
  if (id === 'seasons') return 'buy'
  const m = id.match(/^todo\/(do|plant|buy|notes)$/)
  return m ? (m[1] as TodoView) : null
}

// What a month's section shows. A pushed task leaves its month once the next month
// is on screen, since it shows there ("From Oct"); cleared ticks stay hidden unless
// asked for.
export function shownItems(items: Item[], nextVisible: boolean, showCleared: boolean) {
  return items.filter(
    (i) => !(i.check?.outcome === 'pushed' && nextVisible) && (showCleared || !i.check?.cleared_at),
  )
}

// ---------- moving a task to another month (hold and drag on This month) ----------

export interface MonthRef {
  year: number
  month: number
}

const order = (r: MonthRef) => r.year * 12 + r.month - 1

// The month a task's moves started from: walk back while last month moved it on.
export function pushOrigin(checks: Check[], taskId: string, year: number, month: number): MonthRef {
  const pushed = new Set(
    checks.filter((c) => c.task_id === taskId && c.outcome === 'pushed').map((c) => checkKey(taskId, c.year, c.month)),
  )
  let at: MonthRef = { year, month }
  for (let i = 0; i < 24; i++) {
    const prev = previousMonth(at.year, at.month)
    if (!pushed.has(checkKey(taskId, prev.year, prev.month))) break
    at = prev
  }
  return at
}

export interface TickChange extends MonthRef {
  outcome: 'pushed' | null // null removes the tick
}

// The ticks that move a task shown in month `from` to month `to`. Later: a
// "pushed" tick for each month on the way (October to December is pushed in
// October and November). Earlier: remove those ticks again. A task can't go before
// the month its moves started from, so that gives null.
export function moveTicks(origin: MonthRef, from: MonthRef, to: MonthRef): TickChange[] | null {
  if (order(to) < order(origin)) return null
  const changes: TickChange[] = []
  if (order(to) > order(from)) {
    for (let at = from; order(at) < order(to); at = nextMonth(at.year, at.month)) changes.push({ ...at, outcome: 'pushed' })
  } else {
    for (let at = to; order(at) < order(from); at = nextMonth(at.year, at.month)) changes.push({ ...at, outcome: null })
  }
  return changes
}
