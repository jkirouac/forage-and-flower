import { useRef, useState, type PointerEvent } from 'react'
import { useGarden } from '../lib/garden'
import { useSeasons } from '../lib/seasons'
import { useCatalogue } from '../lib/catalogue'
import {
  buildMonth,
  nextMonth,
  previousMonth,
  SECTIONS,
  shownItems,
  upcomingMonths,
  type Item,
  type Outcome,
  type Section,
} from '../lib/month'
import { buyingSeason, groupByNursery, qtyLabel, seasonLabel, type Group, type Plant, type PlanItem, type Site } from '../lib/plan'
import { taskNamesPlant, type FullPlant } from '../lib/plants'
import { MONTHS, monthHeading, shortDate } from '../lib/season'
import { clearSummary } from '../lib/clear'
import { ClearBar, ShowCleared } from './ClearBar'

const LABELS: Record<Section, string> = { do: 'Do', plant: 'Plant', buy: 'Buy' }
type Filter = Section | 'all'

const EMPTY: Record<Section, string> = {
  do: 'Nothing to do this month.',
  plant: 'Nothing to plant this month.',
  buy: 'Nothing to pick up this month.',
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MAX_MONTHS = 12

// This month and the next few, each under its own header with Do / Plant / Buy.
// Tap the circle or swipe right to finish a task; swipe left to move it to next
// month, where it shows "From Oct". Tap a card to open it. Buy comes from the
// Seasons list for this time of year, one card per nursery.
export default function Month({ userId }: { userId: string }) {
  // The date when the screen opened; reopening the app picks up a new month.
  const [now] = useState(() => new Date())
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const { month: monthName, theme } = monthHeading(now)
  const { garden, error, pending, reload, tick, clear } = useGarden(userId, year)
  const seasons = useSeasons(userId)
  const catalogue = useCatalogue(userId)
  const [filter, setFilter] = useState<Filter>('all')
  const [showCleared, setShowCleared] = useState(false)
  const [count, setCount] = useState(3)

  const months = upcomingMonths(year, month, count)
  const lists = garden ? months.map((m) => ({ ...m, list: buildMonth(garden.tasks, garden.checks, m.year, m.month) })) : []
  const plants = catalogue.data?.plants ?? []

  // Each season's shopping goes under the first month on screen in its window.
  const buyHome = new Map<string, number>()
  for (const m of months) {
    const s = buyingSeason(m.year, m.month)
    if (s && !buyHome.has(s)) buyHome.set(s, m.month)
  }

  const everything = lists.flatMap((l) => SECTIONS.flatMap((s) => l.list[s]).map((item) => ({ item, year: l.year, month: l.month })))
  const clearable = everything.filter((x) => x.item.check?.outcome === 'done' && !x.item.check.cleared_at)
  const clearedCount = everything.filter((x) => x.item.check?.cleared_at).length

  function clearAll() {
    const byMonth = new Map<string, { year: number; month: number; ids: string[] }>()
    for (const x of clearable) {
      const key = `${x.year}-${x.month}`
      if (!byMonth.has(key)) byMonth.set(key, { year: x.year, month: x.month, ids: [] })
      byMonth.get(key)!.ids.push(x.item.task.id)
    }
    for (const m of byMonth.values()) clear(m.ids, m.year, m.month)
  }

  return (
    <>
      <header className="page-head">
        <div className="head-row">
          <p className="kicker">{monthName} · Victoria 9a</p>
          <a className="icon-link" href="#settings" aria-label="Settings">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </a>
        </div>
        <h1>{theme}</h1>
      </header>
      <hr className="rule" />

      {error && !garden && (
        <section className="block">
          <p className="notice notice-error">{error}</p>
          <button type="button" className="choice" onClick={reload}>
            Try again
          </button>
        </section>
      )}

      {garden && !garden.gardenId && (
        <p className="empty">This account isn't part of a garden yet. Ask whoever runs your garden to add you.</p>
      )}

      {(garden?.fromPhone || pending > 0) && (
        <p className="sync-note" role="status">
          {garden?.fromPhone ? 'No connection: showing what this phone last saw. ' : ''}
          {pending > 0 ? `${pending} ${pending === 1 ? 'change' : 'changes'} will be sent when you have signal.` : ''}
        </p>
      )}

      {garden?.gardenId && (
        <>
          <div className="choices" role="radiogroup" aria-label="Show">
            {(['all', ...SECTIONS] as Filter[]).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} className="choice" onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : LABELS[f]}
              </button>
            ))}
          </div>

          {lists.map((l, index) => {
            const isNow = index === 0
            const nextOnScreen = index < lists.length - 1
            const next = nextMonth(l.year, l.month)
            const prev = previousMonth(l.year, l.month)
            const season = buyingSeason(l.year, l.month)
            const parts = SECTIONS.filter((s) => filter === 'all' || filter === s).map((section) => {
              const items = shownItems(l.list[section], nextOnScreen, showCleared)
              const buy = section === 'buy' && season !== null
              // Later months only show the sections that have something in them.
              if (!isNow && items.length === 0 && !buy) return null
              return (
                <div key={section} className="block">
                  <h3 className="label">{LABELS[section]}</h3>
                  {buy &&
                    (buyHome.get(season) === l.month ? (
                      <BuyCards
                        season={season}
                        items={seasons.data?.items ?? null}
                        group={(list) => groupByNursery(list, seasons.data?.nurseries ?? [], seasons.data?.plants ?? [])}
                        plants={seasons.data?.plants ?? []}
                        sites={seasons.data?.sites ?? []}
                        onSet={(id, status) => seasons.update(id, { status })}
                      />
                    ) : (
                      <p className="empty">
                        {seasonLabel(season)} shopping is under {MONTHS[buyHome.get(season)! - 1]}.
                      </p>
                    ))}
                  {items.length > 0 ? (
                    <ul className="tasks">
                      {items.map((item) => (
                        <TaskRow
                          key={item.task.id}
                          item={item}
                          initials={item.check?.done_by ? garden.members[item.check.done_by] : undefined}
                          thisName={MONTHS[l.month - 1]}
                          nextName={MONTHS[next.month - 1]}
                          prevName={MONTHS[prev.month - 1]}
                          nextOnScreen={nextOnScreen}
                          plants={plants.filter((p) => taskNamesPlant(item.task, p))}
                          onSet={(outcome) => tick(item.task.id, l.year, l.month, outcome)}
                          onMoveBack={() => tick(item.task.id, prev.year, prev.month, null)}
                        />
                      ))}
                    </ul>
                  ) : (
                    !buy && <p className="empty">{l.list[section].length ? 'All cleared.' : EMPTY[section]}</p>
                  )}
                </div>
              )
            })
            const shown = parts.filter(Boolean)
            return (
              <section key={`${l.year}-${l.month}`} className="month-block">
                <h2 className="month-header">
                  {MONTHS[l.month - 1]}
                  {l.year !== year ? ` ${l.year}` : ''}
                </h2>
                {shown.length ? shown : <p className="empty">Nothing planned yet.</p>}
              </section>
            )
          })}

          {count < MAX_MONTHS && (
            <button type="button" className="choice" onClick={() => setCount(Math.min(MAX_MONTHS, count + 3))}>
              Show more months
            </button>
          )}
          <ShowCleared count={clearedCount} shown={showCleared} onToggle={() => setShowCleared(!showCleared)} />
          <ClearBar
            summary={clearSummary(
              clearable.map((x) => x.item.check?.done_by ?? null),
              userId,
            )}
            onClear={clearAll}
          />
        </>
      )}
    </>
  )
}

function Chevron({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className="task-chevron" aria-expanded={open} aria-label={label} onClick={onClick}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
      </svg>
    </button>
  )
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

const SWIPE = 80 // pixels of travel that count as a swipe

function TaskRow({
  item,
  initials,
  thisName,
  nextName,
  prevName,
  nextOnScreen,
  plants,
  onSet,
  onMoveBack,
}: {
  item: Item
  initials: string | undefined
  thisName: string
  nextName: string
  prevName: string
  nextOnScreen: boolean
  plants: FullPlant[]
  onSet: (outcome: Outcome | null) => void
  onMoveBack: () => void
}) {
  const { task, check, pushedFrom } = item
  const done = check?.outcome === 'done'
  const pushed = check?.outcome === 'pushed'
  const [open, setOpen] = useState(false)
  const [dx, setDx] = useState(0)
  const drag = useRef<{ x: number; y: number; id: number; sideways: boolean | null } | null>(null)

  // Sideways drags swipe; up-and-down ones are left to scroll the page.
  function down(e: PointerEvent<HTMLLIElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, sideways: null }
  }
  function move(e: PointerEvent<HTMLLIElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const x = e.clientX - d.x
    const y = e.clientY - d.y
    if (d.sideways === null && (Math.abs(x) > 10 || Math.abs(y) > 10)) {
      d.sideways = Math.abs(x) > Math.abs(y)
      if (d.sideways) e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (d.sideways) setDx(Math.max(-140, Math.min(140, x)))
  }
  function up() {
    const d = drag.current
    drag.current = null
    if (d?.sideways) {
      if (dx > SWIPE) onSet(done ? null : 'done')
      else if (dx < -SWIPE && !done) onSet(pushed ? null : 'pushed')
    }
    setDx(0)
  }

  const when = check ? new Date(check.done_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
  const toggle = () => setOpen(!open)

  return (
    <li
      className="task"
      data-state={done ? 'done' : pushed ? 'pushed' : 'open'}
      data-open={open || undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="task-under" aria-hidden="true">
        <span>{done ? 'Not done' : 'Done'}</span>
        <span>{pushed ? `Back to ${thisName}` : `To ${nextName}`}</span>
      </div>
      <div className="task-face" style={dx ? { transform: `translateX(${dx}px)` } : undefined}>
        <button
          type="button"
          className="task-check"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark not done: ${task.title}` : `Done: ${task.title}`}
          onClick={() => onSet(done ? null : 'done')}
        >
          {done && <Tick />}
        </button>
        <button type="button" className="task-open" aria-expanded={open} onClick={toggle}>
          <span className="task-title">{task.title}</span>
          {(pushedFrom || task.every_month || check) && (
            <span className="task-meta">
              {pushedFrom && !check && <span>From {MONTHS_SHORT[pushedFrom - 1]}</span>}
              {task.every_month && !check && <span>Every month</span>}
              {done && (
                <span className="done-by">
                  {initials ?? '?'} · {when}
                </span>
              )}
              {pushed && !nextOnScreen && <span>Moved to {nextName}</span>}
            </span>
          )}
        </button>
        <Chevron open={open} label={`${open ? 'Close' : 'Open'}: ${task.title}`} onClick={toggle} />
      </div>
      {open && (
        <div className="task-more">
          {task.detail && <p className="task-detail">{task.detail}</p>}
          {task.link && (
            <a href={task.link} target="_blank" rel="noreferrer" className="task-link">
              How to (opens a video)
            </a>
          )}
          {plants.length > 0 && (
            <p className="task-plants">
              {plants.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <a href={`#plant/${encodeURIComponent(p.id)}`}>{p.common}</a>
                </span>
              ))}
            </p>
          )}
          {pushedFrom && !check && <p className="task-detail">Moved here from {prevName}.</p>}
          {done && (
            <p className="task-detail">
              Done by {initials ?? 'someone'} on {when}.
            </p>
          )}
          <div className="choices">
            <button type="button" className="choice small" onClick={() => onSet(done ? null : 'done')}>
              {done ? 'Not done' : 'Done'}
            </button>
            {!done && !pushed && (
              <button type="button" className="choice small" onClick={() => onSet('pushed')}>
                Move to {nextName}
              </button>
            )}
            {pushed && (
              <button type="button" className="choice small" onClick={() => onSet(null)}>
                Keep in {thisName}
              </button>
            )}
            {pushedFrom && !check && (
              <button type="button" className="choice small" onClick={onMoveBack}>
                Move back to {prevName}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

// Buy: the season's list, one card per nursery, each opening to its plants.
function BuyCards({
  season,
  items,
  group,
  plants,
  sites,
  onSet,
}: {
  season: string
  items: PlanItem[] | null // null while the lists load
  group: (items: PlanItem[]) => Group[]
  plants: Plant[]
  sites: Site[]
  onSet: (id: string, status: 'to buy' | 'bought') => void
}) {
  if (!items) return <p className="empty">Loading the {seasonLabel(season)} list…</p>
  const list = items.filter((i) => i.season === season && !i.cleared_at && (i.status === 'to buy' || i.status === 'bought'))
  if (list.length === 0) return <p className="empty">Nothing left to buy on the {seasonLabel(season)} list.</p>
  return (
    <ul className="tasks">
      {group(list).map((g) => (
        <BuyCard
          key={g.nursery?.id ?? 'none'}
          group={g}
          plantName={(id) => plants.find((p) => p.id === id)?.common ?? 'Unknown plant'}
          siteNumber={(id) => sites.find((s) => s.id === id)?.number}
          onSet={onSet}
        />
      ))}
    </ul>
  )
}

function BuyCard({
  group,
  plantName,
  siteNumber,
  onSet,
}: {
  group: Group
  plantName: (id: string) => string
  siteNumber: (id: string | null) => number | undefined
  onSet: (id: string, status: 'to buy' | 'bought') => void
}) {
  const [open, setOpen] = useState(false)
  const name = group.nursery?.name ?? 'No nursery yet'
  const toBuy = group.items.filter((i) => i.status === 'to buy').length
  const bought = group.items.length - toBuy
  const where = group.nursery
    ? [group.nursery.location, group.nursery.last_checked ? `checked ${shortDate(group.nursery.last_checked)}` : null]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <li className="task buy-card" data-state={toBuy === 0 ? 'done' : 'open'} data-open={open || undefined}>
      <div className="task-face">
        {/* Ticks itself once everything is bought; tapping it opens the card. */}
        <button type="button" className="task-check" tabIndex={-1} aria-hidden="true" onClick={() => setOpen(!open)}>
          {toBuy === 0 && <Tick />}
        </button>
        <button type="button" className="task-open" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="task-title">{name}</span>
          <span className="task-meta">
            <span>{toBuy ? `${toBuy} to buy` : 'All bought'}</span>
            {bought > 0 && toBuy > 0 && <span>{bought} bought</span>}
            {where && <span>{where}</span>}
          </span>
        </button>
        <Chevron open={open} label={`${open ? 'Close' : 'Open'}: ${name}`} onClick={() => setOpen(!open)} />
      </div>
      {open && (
        <div className="task-more">
          <ul className="buy-plants">
            {group.items.map((i) => {
              const got = i.status === 'bought'
              const site = siteNumber(i.site_id)
              const label = `${plantName(i.plant_id)} × ${qtyLabel(i.qty_min, i.qty_max)}${site ? ` · Site ${site}` : ''}`
              return (
                <li key={i.id} data-state={got ? 'done' : 'open'}>
                  <button
                    type="button"
                    className="task-check"
                    role="checkbox"
                    aria-checked={got}
                    aria-label={got ? `Not bought: ${label}` : `Bought: ${label}`}
                    onClick={() => onSet(i.id, got ? 'to buy' : 'bought')}
                  >
                    {got && <Tick />}
                  </button>
                  <span className="buy-plant">{label}</span>
                </li>
              )
            })}
          </ul>
          <a className="task-link" href="#seasons">
            Open in Seasons
          </a>
        </div>
      )}
    </li>
  )
}
