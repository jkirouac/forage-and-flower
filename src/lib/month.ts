// What This month shows, worked out from the garden's tasks and ticks. Pure, so the
// rules can be tested without a database (scripts/month.test.ts).
//
// - A task belongs to its month every year, or to every month.
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
    const own = task.every_month || task.month === month
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

// How many of the month's tasks are still open (not done, not pushed on).
export function openCount(list: MonthList) {
  return SECTIONS.reduce((n, s) => n + list[s].filter((i) => !i.check).length, 0)
}
