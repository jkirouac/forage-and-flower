// A site's to-do list on its page: the tasks set to that site, plus garden-wide
// tasks that name a plant growing or planned there ("Light trim of nepeta" shows
// wherever nepeta grows). Pure, so it can be tested without a database
// (scripts/sitetasks.test.ts).

import type { Item, MonthList } from './month.ts'
import { baseName, taskNamesPlant, type FullPlant } from './plants.ts'

export interface SiteTask {
  item: Item
  // The plant that put a garden-wide task here ("Nepeta"), or null when the task is
  // set to this site.
  because: string | null
}

export function tasksForSite(
  lists: { year: number; month: number; list: MonthList }[],
  siteId: string,
  sitePlants: Pick<FullPlant, 'id' | 'common'>[],
) {
  return lists.map((l) => {
    const tasks: SiteTask[] = []
    for (const item of [...l.list.do, ...l.list.plant, ...l.list.buy]) {
      const t = item.task
      if (t.site_id === siteId) {
        tasks.push({ item, because: null })
        continue
      }
      // A task set to another site stays there.
      if (t.site_id) continue
      const plant = sitePlants.find((p) => taskNamesPlant(t, p))
      if (plant) tasks.push({ item, because: plant.common })
    }
    return { year: l.year, month: l.month, tasks }
  })
}

// "Nepeta 'Walker's Low'" -> "Nepeta", for "· Nepeta grows here".
export function shortName(common: string) {
  const base = baseName(common)
  return base ? base[0].toUpperCase() + base.slice(1) : common
}
