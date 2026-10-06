// node --test scripts/sitetasks.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMonth, type Task } from '../src/lib/month.ts'
import { shortName, tasksForSite } from '../src/lib/sitetasks.ts'

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id, section: 'do', title, detail: null, link: null, month: 10, every_month: false, position: 0, ...extra,
})

const tasks = [
  task('plum', 'Summer prune plum trees', { site_id: 's3' }),
  task('nepeta', 'Light trim of nepeta where it smothers neighbours'),
  task('worm', 'Worm Wigwam winter prep'),
  task('fir', 'Pick up fir mulch', { section: 'buy', site_id: 's4' }),
  task('nepeta-elsewhere', 'Divide nepeta at the berm', { site_id: 's4' }),
]
const lists = [{ year: 2026, month: 10, list: buildMonth(tasks, [], 2026, 10) }]

test("a site's to-dos: set to it, or garden-wide and naming a plant that grows there", () => {
  const [oct] = tasksForSite(lists, 's3', [{ id: 'n', common: "Nepeta 'Walker's Low'" }, { id: 'k', common: 'Perennial kale' }])
  assert.deepEqual(
    oct.tasks.map((t) => [t.item.task.id, t.because]),
    [['nepeta', "Nepeta 'Walker's Low'"], ['plum', null]],
  )
})

test('a task set to another site stays there, and garden-wide tasks with no plant stay off', () => {
  const [oct] = tasksForSite(lists, 's4', [])
  assert.deepEqual(oct.tasks.map((t) => t.item.task.id), ['nepeta-elsewhere', 'fir'])
})

test('plant names read short in the reason', () => {
  assert.equal(shortName("Nepeta 'Walker's Low'"), 'Nepeta')
  assert.equal(shortName('Great Camas'), 'Great camas')
})
