import { useRef, useState, type PointerEvent } from 'react'
import { useGarden } from '../lib/garden'
import { buildMonth, nextMonth, SECTIONS, type Item, type Outcome, type Section } from '../lib/month'
import { MONTHS, monthHeading } from '../lib/season'

const LABELS: Record<Section, string> = { do: 'Do', plant: 'Plant', buy: 'Buy' }
type Filter = Section | 'all'

const EMPTY: Record<Section, string> = {
  do: 'Nothing to do here this month.',
  plant: 'Nothing to plant this month.',
  buy: 'Nothing to pick up this month.',
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// This month: the shared checklist under Do / Plant / Buy. Tap the circle or swipe
// right to finish; swipe left (or tap the arrow) to push a task to next month.
export default function Month({ userId }: { userId: string }) {
  // The date when the screen opened; reopening the app picks up a new month.
  const [now] = useState(() => new Date())
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const next = nextMonth(year, month)
  const { month: monthName, theme } = monthHeading(now)
  const { garden, error, pending, reload, tick } = useGarden(userId, year)
  const [filter, setFilter] = useState<Filter>('all')

  const list = garden ? buildMonth(garden.tasks, garden.checks, year, month) : null
  const shown = SECTIONS.filter((s) => filter === 'all' || filter === s)

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
          {pending > 0 ? `${pending} ${pending === 1 ? 'tick' : 'ticks'} will be sent when you have signal.` : ''}
        </p>
      )}

      {list && garden?.gardenId && (
        <>
          <div className="choices" role="radiogroup" aria-label="Show">
            {(['all', ...SECTIONS] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                className="choice"
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : LABELS[f]}
              </button>
            ))}
          </div>
          {shown.map((section) => (
            <section key={section} className="block">
              <h2 className="label">{LABELS[section]}</h2>
              {list[section].length === 0 ? (
                <p className="empty">{EMPTY[section]}</p>
              ) : (
                <ul className="tasks">
                  {list[section].map((item) => (
                    <TaskRow
                      key={item.task.id}
                      item={item}
                      initials={item.check?.done_by ? garden.members[item.check.done_by] : undefined}
                      nextName={MONTHS[next.month - 1]}
                      onSet={(outcome) => tick(item.task.id, year, month, outcome)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </>
  )
}

const SWIPE = 80 // pixels of travel that count as a swipe

function TaskRow({
  item,
  initials,
  nextName,
  onSet,
}: {
  item: Item
  initials: string | undefined
  nextName: string
  onSet: (outcome: Outcome | null) => void
}) {
  const { task, check, pushedFrom } = item
  const done = check?.outcome === 'done'
  const pushed = check?.outcome === 'pushed'
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

  return (
    <li
      className="task"
      data-state={done ? 'done' : pushed ? 'pushed' : 'open'}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="task-under" aria-hidden="true">
        <span className="task-under-done">{done ? 'Not done' : 'Done'}</span>
        <span className="task-under-push">{pushed ? 'Back to this month' : nextName}</span>
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
          {done && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </button>
        <div className="task-body">
          <p className="task-title">
            {task.title}
            {task.link && (
              <>
                {' '}
                <a href={task.link} target="_blank" rel="noreferrer" className="task-link">
                  How to
                </a>
              </>
            )}
          </p>
          {task.detail && <p className="task-detail">{task.detail}</p>}
          {(pushedFrom || task.every_month || check) && (
            <p className="task-meta">
              {pushedFrom && !check && <span>From {MONTHS_SHORT[pushedFrom - 1]}</span>}
              {task.every_month && !check && <span>Every month</span>}
              {done && (
                <span className="done-by">
                  {initials ?? '?'} · {when}
                </span>
              )}
              {pushed && (
                <span>
                  Moved to {nextName}
                  {initials ? ` by ${initials}` : ''} ·{' '}
                  <button type="button" className="text-button inline" onClick={() => onSet(null)}>
                    Undo
                  </button>
                </span>
              )}
            </p>
          )}
        </div>
        {!check && (
          <button type="button" className="task-push" aria-label={`Push to ${nextName}: ${task.title}`} onClick={() => onSet('pushed')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>
    </li>
  )
}
