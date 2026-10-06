import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { useGarden } from '../lib/garden'
import { useSeasons } from '../lib/seasons'
import { useCatalogue } from '../lib/catalogue'
import {
  buildMonth,
  moveTicks,
  nextMonth,
  notesFor,
  pushOrigin,
  SECTIONS,
  shownItems,
  upcomingMonths,
  type Item,
  type MonthRef,
  type Note,
  type Outcome,
  type Section,
  type TodoView,
} from '../lib/month'
import { buyingSeason, buySummary, currentSeason, seasonLabel, shoppingClearable } from '../lib/plan'
import { ShoppingList } from './Seasons'
import { linkPlantNames, type FullPlant } from '../lib/plants'
import { MONTHS, monthHeading } from '../lib/season'
import { clearSummary } from '../lib/clear'
import { ClearBar, ShowCleared } from './ClearBar'
import VoiceNote from './VoiceNote'
import type { DraftItem } from '../lib/notes'

const LABELS: Record<Section, string> = { do: 'Do', plant: 'Plant', buy: 'Buy' }
type Filter = TodoView
const FILTERS: Filter[] = ['all', ...SECTIONS, 'notes']

const EMPTY: Record<Section, string> = {
  do: 'Nothing to do this month.',
  plant: 'Nothing to plant this month.',
  buy: 'Nothing to pick up this month.',
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MAX_MONTHS = 12

// To do: this month and the next few, each under its own header with Do / Plant /
// Buy. Tap a card to tick it done; press and hold a card, then drag it onto another
// month to move it there ("From Oct"). The small arrow opens its note. Plant names
// in a task are links to their pages. In All, a buying month shows one line for
// its shopping list; the Buy chip opens the list itself (fall or spring), with any
// one-off errands above it. The mic button speaks a note: Claude tidies it into
// one-off tasks and notes for a month (VoiceNote). The chosen chip is in the
// address (#todo/buy), so back works and other screens can link to it.
export default function Month({ userId, view }: { userId: string; view: TodoView }) {
  // The date when the screen opened; reopening the app picks up a new month.
  const [now] = useState(() => new Date())
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const { month: monthName, theme } = monthHeading(now)
  const { garden, error, pending, reload, tick, clear, addItems, removeTask, removeNote } = useGarden(userId, year)
  const seasons = useSeasons(userId)
  const catalogue = useCatalogue(userId)
  const filter = view
  const setFilter = (f: Filter) => {
    window.location.assign(f === 'all' ? '#todo' : `#todo/${f}`)
  }
  // The shopping list being looked at in Buy: the one being shopped for now, else the next.
  const [season, setSeason] = useState(() => buyingSeason(year, month) ?? currentSeason(now))
  const [showCleared, setShowCleared] = useState(false)
  const [count, setCount] = useState(3)
  const drag = useDragToMonth()
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null)
  const [speaking, setSpeaking] = useState(false)

  // Saves a checked voice note, with an undo.
  function saveNote(items: DraftItem[], spoken: string) {
    setSpeaking(false)
    const saved = addItems(items, spoken)
    if (saved.length === 0) return
    const where = new Set(items.map((i) => `${i.year}-${i.month}`))
    setNotice({
      text: where.size === 1 ? `Saved to ${MONTHS[items[0].month - 1]}.` : `Saved ${items.length} items.`,
      undo: () => {
        for (const x of saved) (x.kind === 'task-insert' ? removeTask : removeNote)(x.id)
        setNotice(null)
      },
    })
  }

  // A notice ("Moved to December. Undo") goes after a few seconds.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), notice.undo ? 6000 : 2500)
    return () => clearTimeout(t)
  }, [notice])

  // Applies the ticks that move a task between months, with an undo.
  function moveTask(taskId: string, origin: MonthRef, from: MonthRef, to: MonthRef) {
    const changes = moveTicks(origin, from, to)
    if (!changes || changes.length === 0) return
    for (const c of changes) tick(taskId, c.year, c.month, c.outcome)
    setNotice({
      text: `Moved to ${MONTHS[to.month - 1]}.`,
      undo: () => {
        for (const c of moveTicks(origin, to, from) ?? []) tick(taskId, c.year, c.month, c.outcome)
        setNotice(null)
      },
    })
  }

  const months = upcomingMonths(year, month, count)
  const lists = garden ? months.map((m) => ({ ...m, list: buildMonth(garden.tasks, garden.checks, m.year, m.month) })) : []
  const plants = catalogue.data?.plants ?? []

  // Each season's shopping line goes under the first month on screen in its window.
  const buyHome = new Map<string, number>()
  for (const m of months) {
    const s = buyingSeason(m.year, m.month)
    if (s && !buyHome.has(s)) buyHome.set(s, m.month)
  }

  const everything = lists.flatMap((l) => SECTIONS.flatMap((s) => l.list[s]).map((item) => ({ item, year: l.year, month: l.month })))
  const clearable = everything.filter((x) => x.item.check?.outcome === 'done' && !x.item.check.cleared_at)
  const clearedCount = everything.filter((x) => x.item.check?.cleared_at).length

  // In Buy, Clear works on the shopping list being looked at.
  const shopClearable = filter === 'buy' ? shoppingClearable(seasons.data?.items ?? [], season) : []
  // Errands in Buy: one-off Buy tasks still open this month and next.
  const errands = lists.slice(0, 2).flatMap((l, i) =>
    shownItems(l.list.buy, i === 0, false)
      .filter((item) => !item.check)
      .map((item) => ({ item, l })),
  )

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
            {FILTERS.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} className="choice" onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'notes' ? 'Notes' : LABELS[f]}
              </button>
            ))}
          </div>

          {filter === 'buy' ? (
            <>
              {errands.length > 0 && (
                <section className="block">
                  <h2 className="label">Also to pick up</h2>
                  <ul className="tasks">
                    {errands.map(({ item, l }) => (
                      <TaskRow
                        key={item.task.id}
                        item={item}
                        initials={undefined}
                        nextName={MONTHS[nextMonth(l.year, l.month).month - 1]}
                        plants={plants}
                        dragging={drag.taskId === item.task.id}
                        months={months}
                        origin={pushOrigin(garden.checks, item.task.id, l.year, l.month)}
                        at={{ year: l.year, month: l.month }}
                        onSet={(outcome) => tick(item.task.id, l.year, l.month, outcome)}
                        onRemove={item.task.year != null ? () => removeTask(item.task.id) : undefined}
                        onMove={(origin, to) => moveTask(item.task.id, origin, { year: l.year, month: l.month }, to)}
                        onHint={(text) => setNotice({ text })}
                        drag={drag}
                      />
                    ))}
                  </ul>
                </section>
              )}
              <ShoppingList shop={seasons} season={season} onSeason={setSeason} />
            </>
          ) : (
            <>
          {lists.map((l, index) => {
            const isNow = index === 0
            const nextOnScreen = index < lists.length - 1
            const next = nextMonth(l.year, l.month)
            const shopping = buyingSeason(l.year, l.month)
            const parts = SECTIONS.filter((s) => filter === 'all' || filter === s).map((section) => {
              const items = shownItems(l.list[section], nextOnScreen, showCleared)
              // The season's shopping line sits under the first month in its window.
              const buy = section === 'buy' && shopping !== null && buyHome.get(shopping) === l.month
              // Later months only show the sections that have something in them.
              if (!isNow && items.length === 0 && !buy) return null
              return (
                <div key={section} className="block">
                  <h3 className="label">{LABELS[section]}</h3>
                  {buy && (
                    <BuyLine
                      season={shopping}
                      summary={seasons.data ? buySummary(seasons.data.items, shopping) : null}
                      onOpen={() => {
                        setSeason(shopping)
                        setFilter('buy')
                      }}
                    />
                  )}
                  {items.length > 0 ? (
                    <ul className="tasks">
                      {items.map((item) => (
                        <TaskRow
                          key={item.task.id}
                          item={item}
                          initials={item.check?.done_by ? garden.members[item.check.done_by] : undefined}
                          nextName={MONTHS[next.month - 1]}
                          plants={plants}
                          dragging={drag.taskId === item.task.id}
                          months={months}
                          origin={pushOrigin(garden.checks, item.task.id, l.year, l.month)}
                          at={{ year: l.year, month: l.month }}
                          onSet={(outcome) => tick(item.task.id, l.year, l.month, outcome)}
                          onRemove={item.task.year != null ? () => removeTask(item.task.id) : undefined}
                          onMove={(origin, to) => moveTask(item.task.id, origin, { year: l.year, month: l.month }, to)}
                          onHint={(text) => setNotice({ text })}
                          drag={drag}
                        />
                      ))}
                    </ul>
                  ) : (
                    !buy && <p className="empty">{l.list[section].length ? 'All cleared.' : EMPTY[section]}</p>
                  )}
                </div>
              )
            })
            const notes = notesFor(garden.notes, l.year, l.month)
            if ((filter === 'all' && notes.length > 0) || (filter === 'notes' && (notes.length > 0 || isNow)))
              parts.push(
                <div key="notes" className="block">
                  <h3 className="label">Notes</h3>
                  {notes.length > 0 ? (
                    <ul className="tasks">
                      {notes.map((n) => (
                        <NoteRow
                          key={n.id}
                          note={n}
                          initials={n.written_by ? garden.members[n.written_by] : undefined}
                          plants={plants}
                          onRemove={() => removeNote(n.id)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="empty">No notes this month. Tap the microphone to speak one.</p>
                  )}
                </div>,
              )
            const shown = parts.filter(Boolean)
            return (
              <section
                key={`${l.year}-${l.month}`}
                className="month-block"
                data-month={`${l.year}-${l.month}`}
                data-drop={drag.over?.key === `${l.year}-${l.month}` ? (drag.over.valid ? 'yes' : 'no') : undefined}
              >
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
            </>
          )}
          {drag.ghost && (
            <div className="drag-ghost" style={{ top: drag.ghost.top, left: drag.ghost.left, width: drag.ghost.width }} aria-hidden="true">
              {drag.ghost.title}
              <span className="drag-target">
                {drag.over
                  ? drag.over.valid
                    ? `Drop in ${MONTHS[Number(drag.over.key.split('-')[1]) - 1]}`
                    : `Can't go before its month`
                  : 'Drag onto a month'}
              </span>
            </div>
          )}
          {/* Pinned above the tab bar: notices, the mic, and Clear checked off. */}
          <div className="dock">
            {notice && (
              <p className="move-notice" role="status">
                {notice.text}{' '}
                {notice.undo && (
                  <button type="button" className="text-button inline" onClick={notice.undo}>
                    Undo
                  </button>
                )}
              </p>
            )}
            {!drag.taskId && (
              <button type="button" className="mic-button" aria-label="Speak a note" onClick={() => setSpeaking(true)}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
                </svg>
              </button>
            )}
            {filter === 'buy' ? (
              <ClearBar
                summary={clearSummary(
                  shopClearable.map((i) => i.status_by),
                  userId,
                )}
                onClear={() => seasons.clear(shopClearable.map((i) => i.id))}
              />
            ) : (
              <ClearBar
                summary={clearSummary(
                  clearable.map((x) => x.item.check?.done_by ?? null),
                  userId,
                )}
                onClear={clearAll}
              />
            )}
          </div>
          {speaking && <VoiceNote today={{ year, month }} plants={plants} onSave={saveNote} onClose={() => setSpeaking(false)} />}
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

// ---------- hold and drag a card onto another month ----------

const HOLD_MS = 450
// From Mealboard: a thumb drifts sideways while holding still, so allow more
// sideways than up-and-down, which means the page is being scrolled.
const HOLD_TOLERANCE = { x: 32, y: 12 }
const EDGE = 90 // px from the top or bottom where a drag scrolls the page

interface DragApi {
  taskId: string | null
  over: { key: string; valid: boolean } | null
  ghost: { top: number; left: number; width: number; title: string } | null
  start: (taskId: string, title: string, card: HTMLElement, x: number, y: number, isValid: (to: MonthRef) => boolean) => void
  move: (x: number, y: number) => void
  end: (x: number, y: number) => MonthRef | null
  cancel: () => void
}

// The month under the finger. Over the tab bar, look just above it, so a card
// dragged to the bottom edge still lands in the month showing there.
const monthAt = (x: number, y: number): MonthRef | null => {
  const tabs = document.querySelector('.tabbar')?.getBoundingClientRect().top ?? window.innerHeight
  const el = document.elementFromPoint(x, Math.min(y, tabs - 12))?.closest('[data-month]') as HTMLElement | null
  const m = el?.dataset.month?.match(/^(\d+)-(\d+)$/)
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null
}

// The drag itself, kept at screen level: a copy of the card follows the finger,
// the month under it lights up, and the page scrolls near the edges. While a card
// is held the page doesn't scroll under the finger.
function useDragToMonth(): DragApi {
  const [taskId, setTaskId] = useState<string | null>(null)
  const [over, setOver] = useState<DragApi['over']>(null)
  const [ghost, setGhost] = useState<DragApi['ghost']>(null)
  const state = useRef<{ offsetY: number; left: number; width: number; title: string; x: number; y: number; isValid: (to: MonthRef) => boolean; raf: number } | null>(null)

  const stopScroll = useRef((e: TouchEvent) => e.preventDefault())

  function place(x: number, y: number) {
    const st = state.current
    if (!st) return
    st.x = x
    st.y = y
    setGhost({ top: y - st.offsetY, left: st.left, width: st.width, title: st.title })
    const to = monthAt(x, y)
    setOver(to ? { key: `${to.year}-${to.month}`, valid: st.isValid(to) } : null)
  }

  function scrollLoop() {
    const st = state.current
    if (!st) return
    const bottom = window.innerHeight - 80 // above the tab bar
    const speed = st.y < EDGE ? -Math.ceil((EDGE - st.y) / 6) : st.y > bottom - EDGE ? Math.ceil((st.y - (bottom - EDGE)) / 6) : 0
    if (speed) {
      window.scrollBy(0, Math.max(-18, Math.min(18, speed)))
      place(st.x, st.y)
    }
    st.raf = requestAnimationFrame(scrollLoop)
  }

  function finish() {
    const st = state.current
    if (st) cancelAnimationFrame(st.raf)
    state.current = null
    document.removeEventListener('touchmove', stopScroll.current)
    setTaskId(null)
    setOver(null)
    setGhost(null)
  }

  return {
    taskId,
    over,
    ghost,
    start(id, title, card, x, y, isValid) {
      const r = card.getBoundingClientRect()
      state.current = { offsetY: y - r.top, left: r.left, width: r.width, title, x, y, isValid, raf: 0 }
      document.addEventListener('touchmove', stopScroll.current, { passive: false })
      setTaskId(id)
      place(x, y)
      state.current.raf = requestAnimationFrame(scrollLoop)
      navigator.vibrate?.(10)
    },
    move: place,
    end(x, y) {
      const st = state.current
      const to = monthAt(x, y)
      const ok = st && to && st.isValid(to) ? to : null
      finish()
      return ok
    },
    cancel: finish,
  }
}

function TaskRow({
  item,
  initials,
  nextName,
  plants,
  dragging,
  months,
  origin,
  at,
  onSet,
  onRemove,
  onMove,
  onHint,
  drag,
}: {
  item: Item
  initials: string | undefined
  nextName: string
  plants: FullPlant[]
  dragging: boolean
  months: MonthRef[]
  origin: MonthRef
  at: MonthRef
  onSet: (outcome: Outcome | null) => void
  onRemove?: () => void // one-off tasks only
  onMove: (origin: MonthRef, to: MonthRef) => void
  onHint: (text: string) => void
  drag: DragApi
}) {
  const { task, check, pushedFrom } = item
  const done = check?.outcome === 'done'
  const pushed = check?.outcome === 'pushed'
  const [open, setOpen] = useState(false)
  const [pressed, setPressed] = useState(false)
  const press = useRef<{ x: number; y: number; id: number; timer: number; held: boolean } | null>(null)
  const swallowClick = useRef(false)

  const isTarget = (to: MonthRef) => {
    const changes = moveTicks(origin, at, to)
    return changes !== null && changes.length > 0
  }
  // Presses that start on a link, the arrow or the circle aren't holds or taps on the card.
  const onControl = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest('a, button, select')

  function down(e: PointerEvent<HTMLLIElement>) {
    if ((e.pointerType === 'mouse' && e.button !== 0) || onControl(e.target)) return
    const card = e.currentTarget
    const { clientX: x, clientY: y, pointerId: id } = e
    setPressed(true)
    const timer = window.setTimeout(() => {
      const p = press.current
      if (!p) return
      setPressed(false)
      if (task.every_month) return onHint('This one repeats every month, so it stays put.')
      if (done) return onHint('Untick it first to move it.')
      if (pushed) return onHint(`It's already moved to ${nextName}. Show more months to move it further.`)
      p.held = true
      swallowClick.current = true
      try {
        card.setPointerCapture(id)
      } catch {
        // The pointer may have gone; the drag still follows pointermove.
      }
      drag.start(task.id, task.title, card, x, y, isTarget)
    }, HOLD_MS)
    press.current = { x, y, id, timer, held: false }
  }
  function move(e: PointerEvent<HTMLLIElement>) {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    if (p.held) return drag.move(e.clientX, e.clientY)
    if (Math.abs(e.clientX - p.x) > HOLD_TOLERANCE.x || Math.abs(e.clientY - p.y) > HOLD_TOLERANCE.y) {
      clearTimeout(p.timer)
      press.current = null
      setPressed(false)
    }
  }
  function up(e: PointerEvent<HTMLLIElement>) {
    const p = press.current
    press.current = null
    setPressed(false)
    if (!p) return
    clearTimeout(p.timer)
    if (p.held) {
      const to = drag.end(e.clientX, e.clientY)
      if (to) onMove(origin, to)
    }
  }
  function cancel() {
    const p = press.current
    press.current = null
    setPressed(false)
    if (!p) return
    clearTimeout(p.timer)
    if (p.held) drag.cancel()
  }
  // A tap anywhere on the card (but not on a link, the arrow or the circle) ticks it.
  function tap(e: MouseEvent<HTMLLIElement>) {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    if (onControl(e.target)) return
    onSet(done ? null : 'done')
  }

  const when = check ? new Date(check.done_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
  const later = months.filter((m) => isTarget(m))

  return (
    <li
      className="task"
      data-state={done ? 'done' : pushed ? 'pushed' : 'open'}
      data-open={open || undefined}
      data-pressed={pressed || undefined}
      data-dragging={dragging || undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClick={tap}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="task-face">
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
        <div className="task-open">
          <span className="task-title">
            {linkPlantNames(task.title, plants).map((part, i) =>
              part.plantId ? (
                <a key={i} href={`#plant/${encodeURIComponent(part.plantId)}`} className="plant-name">
                  {part.text}
                </a>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </span>
          {(pushedFrom || task.every_month || check) && (
            <span className="task-meta">
              {pushedFrom && !check && <span>From {MONTHS_SHORT[pushedFrom - 1]}</span>}
              {task.every_month && !check && <span>Every month</span>}
              {done && (
                <span className="done-by">
                  {initials ?? '?'} · {when}
                </span>
              )}
              {pushed && <span>Moved to {nextName}</span>}
            </span>
          )}
        </div>
        <Chevron open={open} label={`${open ? 'Close' : 'Open'} the note: ${task.title}`} onClick={() => setOpen(!open)} />
      </div>
      {open && (
        <div className="task-more">
          {task.detail && <p className="task-detail">{task.detail}</p>}
          {task.link && (
            <a href={task.link} target="_blank" rel="noreferrer" className="task-link">
              How to (opens a video)
            </a>
          )}
          {pushedFrom && !check && <p className="task-detail">Moved here from {MONTHS[pushedFrom - 1]}.</p>}
          {done && (
            <p className="task-detail">
              Done by {initials ?? 'someone'} on {when}.
            </p>
          )}
          {!task.every_month && !done && !pushed && later.length > 0 && (
            <label className="move-to">
              Move to
              <select
                value=""
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number)
                  if (y) onMove(origin, { year: y, month: m })
                }}
              >
                <option value="">Choose a month</option>
                {later.map((m) => (
                  <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                    {MONTHS[m.month - 1]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {task.spoken && (
            <details className="spoken">
              <summary>What you said</summary>
              <p>{task.spoken}</p>
            </details>
          )}
          {!task.detail && !task.link && !task.spoken && !(pushedFrom && !check) && !done && <p className="task-detail">No note for this one.</p>}
          {onRemove && (
            <button type="button" className="text-button" onClick={onRemove}>
              Remove this card
            </button>
          )}
        </div>
      )}
    </li>
  )
}

// A journal note under a month: the text with plant names linked, who wrote it and
// when. The arrow opens what was said, and Remove.
function NoteRow({ note, initials, plants, onRemove }: { note: Note; initials: string | undefined; plants: FullPlant[]; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const when = new Date(note.written_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return (
    <li className="note-row" data-open={open || undefined}>
      <div className="note-face">
        <div className="note-body">
          <p className="note-text">
            {linkPlantNames(note.text, plants).map((part, i) =>
              part.plantId ? (
                <a key={i} href={`#plant/${encodeURIComponent(part.plantId)}`} className="plant-name">
                  {part.text}
                </a>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </p>
          <span className="task-meta">
            <span className="done-by">
              {initials ?? '?'} · {when}
            </span>
          </span>
        </div>
        <Chevron open={open} label={`${open ? 'Close' : 'Open'} the note: ${note.text}`} onClick={() => setOpen(!open)} />
      </div>
      {open && (
        <div className="task-more">
          {note.spoken && (
            <details className="spoken">
              <summary>What you said</summary>
              <p>{note.spoken}</p>
            </details>
          )}
          <button type="button" className="text-button" onClick={onRemove}>
            Remove this note
          </button>
        </div>
      )}
    </li>
  )
}

// Buy in All: the season's shopping list as one line that opens it in Buy.
function BuyLine({
  season,
  summary,
  onOpen,
}: {
  season: string
  summary: { total: number; toBuy: number; nurseries: number } | null
  onOpen: () => void
}) {
  if (!summary) return <p className="empty">Loading the {seasonLabel(season)} list…</p>
  if (summary.total === 0) return <p className="empty">Nothing on the {seasonLabel(season)} list.</p>
  const text =
    summary.toBuy === 0
      ? `Everything on the ${seasonLabel(season)} list is bought.`
      : `${seasonLabel(season)} list: ${summary.toBuy} to buy at ${summary.nurseries} ${summary.nurseries === 1 ? 'nursery' : 'nurseries'}`
  return (
    <button type="button" className="buy-line" onClick={onOpen}>
      <span>{text}</span>
      <span aria-hidden="true">›</span>
    </button>
  )
}

