import { useState, type CSSProperties } from 'react'
import { useCatalogue } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import { useGarden } from '../lib/garden'
import { useDesignUrls } from '../lib/designs'
import { buildMonth, upcomingMonths, type Section } from '../lib/month'
import { plantTraits, summarizeRules, type FullPlant, type Rule } from '../lib/plants'
import { bloomRows, scheduleStatus, type ScheduleRow } from '../lib/schedule'
import { isCritical } from '../lib/pollinators'
import { Icon } from './Icons'
import { matchPlant, siteContents, type YardSite } from '../lib/yard'
import { shortName, tasksForSite } from '../lib/sitetasks'
import { MONTHS } from '../lib/season'
import type { Design } from '../lib/plan'
import { PlantList } from './Plants'
import PlantPicker from './PlantPicker'
import Lightbox, { type Picture } from './Lightbox'
import { TaskRow, type DragApi } from './Month'

// Cards on a site page don't move between months; that's done on To do.
const NO_DRAG: DragApi = { taskId: null, over: null, ghost: null, start: () => {}, move: () => {}, end: () => null, cancel: () => {} }

const SECTION_LABELS: Record<Section, string> = { do: 'Do', plant: 'Plant', buy: 'Buy' }

// One site, on its own page: its designs (the latest plan and the concept images),
// what's planted and planned there, what's growing there (editable), its to-dos
// for the next three months, and what to do and not use there.
export default function SitePage({ userId, site: siteNumber }: { userId: string; site: number }) {
  const [now] = useState(() => new Date())
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const catalogue = useCatalogue(userId)
  const seasons = useSeasons(userId)
  const garden = useGarden(userId, year)

  const sites = seasons.data?.sites ?? []
  const site = sites.find((s) => s.number === siteNumber) ?? null
  const plants = catalogue.data?.plants ?? []
  const items = seasons.data?.items ?? []
  const gardenId = seasons.data?.gardenId ?? null
  const urls = useDesignUrls(gardenId, siteNumber, site?.designs ?? [])

  if (seasons.data && !site)
    return (
      <>
        <a className="back" href="#garden">
          ← Garden
        </a>
        <p className="empty">There's no site {siteNumber} in this garden.</p>
      </>
    )
  if (!site || !catalogue.data || !garden.garden)
    return (
      <>
        <a className="back" href="#garden">
          ← Garden
        </a>
        <p className="empty">{catalogue.error || seasons.error || garden.error || 'Loading…'}</p>
      </>
    )

  const here = siteContents(site, { plants, items, plantings: catalogue.data.plantings, rules: catalogue.data.rules })
  const months = upcomingMonths(year, month, 3)
  const lists = months.map((m) => ({ ...m, list: buildMonth(garden.garden!.tasks, garden.garden!.checks, m.year, m.month) }))
  const todo = tasksForSite(lists, site.id, [...here.inGround, ...here.onLists])
  const colour = { '--c': `var(--site-${site.number}, var(--lichen))` } as CSSProperties

  return (
    <>
      <a className="back" href="#garden">
        ← Garden
      </a>
      <header className="page-head site-head-page" style={colour}>
        <p className="kicker">Site {site.number}</p>
        <h1>{site.name}</h1>
        {site.conditions && <p className="group-sub">{site.conditions}</p>}
      </header>
      <hr className="rule" />

      <Designs designs={site.designs ?? []} urls={urls} here={here} plants={plants} month={month} />

      <section className="block">
        <h2 className="label">To do here</h2>
        {todo.every((m) => m.tasks.length === 0) ? (
          <p className="empty">Nothing to do here in the next three months.</p>
        ) : (
          todo.map(
            (m, i) =>
              m.tasks.length > 0 && (
                <div key={`${m.year}-${m.month}`} className="block">
                  <h3 className="label site-month">{i === 0 ? `This month · ${MONTHS[m.month - 1]}` : MONTHS[m.month - 1]}</h3>
                  <ul className="tasks">
                    {m.tasks.map(({ item, because }) => (
                      <TaskRow
                        key={item.task.id}
                        item={item}
                        initials={item.check?.done_by ? garden.garden!.members[item.check.done_by] : undefined}
                        nextName={MONTHS[m.month % 12]}
                        plants={plants}
                        dragging={false}
                        months={months}
                        origin={{ year: m.year, month: m.month }}
                        at={{ year: m.year, month: m.month }}
                        onSet={(outcome) => garden.tick(item.task.id, m.year, m.month, outcome)}
                        onRemove={item.task.year != null ? () => garden.removeTask(item.task.id) : undefined}
                        onMove={() => {}}
                        onHint={() => {}}
                        drag={NO_DRAG}
                        sites={sites}
                        onSite={(id) => garden.setTaskSite(item.task.id, id)}
                        canMove={false}
                        showSite={false}
                        because={because ? shortName(because) : null}
                      />
                    ))}
                  </ul>
                </div>
              ),
          )
        )}
        <AddTask
          siteName={site.name}
          months={upcomingMonths(year, month, 12)}
          onAdd={(text, section, at) =>
            garden.addItems([{ kind: 'task', section, text, year: at.year, month: at.month, plant_ids: [], clashes: [], site_id: site.id }], '')
          }
        />
      </section>

      <PlantList
        title="In the ground"
        about={`Growing in ${site.name}.`}
        plants={here.inGround}
        items={items}
        plantings={catalogue.data.plantings}
        empty="Nothing recorded here yet. Add what's growing below."
        removeQuestion={(p) => `${p.common} isn't in ${site.name} any more?`}
        onRemove={(p) => {
          // Off the site's own list of what's growing.
          const names = (site.existing ?? []).filter((n) => matchPlant(n, plants) !== p.id)
          if (names.length !== (site.existing ?? []).length) seasons.setExisting(site.id, names)
          // Planted here (log or list): the log records it gone, so the history stays.
          const planted =
            catalogue.data!.plantings.some((e) => e.plant_id === p.id && e.site_id === site.id) ||
            items.some((i) => i.plant_id === p.id && i.site_id === site.id && i.status === 'planted')
          if (planted)
            catalogue.record({
              plant_id: p.id,
              action: 'died',
              site_id: site.id,
              from_site_id: null,
              plan_item_id: null,
              quantity: null,
              happened_on: new Date().toLocaleDateString('en-CA'),
              notes: `No longer in ${site.name}.`,
            })
        }}
      />
      <PlantList
        title="Planned"
        about={`On the shopping lists for ${site.name}.`}
        plants={here.onLists}
        items={items}
        plantings={catalogue.data.plantings}
        empty="Nothing on the lists for this site."
        removeQuestion={(p) => `Take ${p.common} off the list for ${site.name}?`}
        onRemove={(p) => {
          for (const i of items) if (i.plant_id === p.id && i.site_id === site.id && (i.status === 'to buy' || i.status === 'bought')) seasons.remove(i.id)
        }}
      />
      <GrowingHere
        site={site}
        plants={plants}
        onExisting={(names) => seasons.setExisting(site.id, names)}
        addPlant={catalogue.addPlant}
      />
      <RulesLines rules={here.rules} />
    </>
  )
}

// The latest plan, on white as it was drawn, and the concept images as a strip of
// thumbnails. Any of them opens full screen.
function Designs({
  designs,
  urls,
  here,
  plants,
  month,
}: {
  designs: Design[]
  urls: Record<string, string>
  here: { inGround: FullPlant[]; onLists: FullPlant[] }
  plants: FullPlant[]
  month: number
}) {
  const [open, setOpen] = useState<number | null>(null)
  if (designs.length === 0)
    return (
      <section className="block">
        <h2 className="label">Designs</h2>
        <p className="empty">No designs for this site yet.</p>
      </section>
    )
  const plan = designs.find((d) => d.kind === 'plan')
  const concepts = designs.filter((d) => d.kind === 'concept')
  const pictures: Picture[] = [...(plan ? [plan] : []), ...concepts].map((d) => ({ src: urls[d.file] ?? '', title: d.title, paper: d.kind === 'plan' }))
  return (
    <section className="block">
      <h2 className="label">Designs</h2>
      {plan && (
        <button type="button" className="design-plan" onClick={() => setOpen(0)} aria-label={`${plan.title}, full screen`}>
          {urls[plan.file] ? <img src={urls[plan.file]} alt={plan.title} /> : <span className="empty">Loading the plan…</span>}
        </button>
      )}
      {plan?.schedule && plan.schedule.length > 0 && (
        <>
          <Schedule rows={plan.schedule} note={plan.scheduleNote} here={here} plants={plants} />
          <BloomChart rows={plan.schedule} month={month} />
        </>
      )}
      {concepts.length > 0 && <h3 className="label">Concept images</h3>}
      {concepts.length > 0 && (
        <ul className="design-strip" aria-label="Concept images">
          {concepts.map((d, i) => (
            <li key={d.file}>
              <button type="button" onClick={() => setOpen((plan ? 1 : 0) + i)} aria-label={`${d.title}, full screen`}>
                {urls[d.thumb ?? d.file] ? <img src={urls[d.thumb ?? d.file]} alt="" loading="lazy" width={160} height={120} /> : <span />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open !== null && pictures[open]?.src && <Lightbox pictures={pictures} start={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

// The plan's Plant Schedule, natively: each plant with the drawing's key swatch (to
// find it on the drawing), how many and how big, its role, who it feeds, and
// where it stands in the garden: in the ground, planned, or not planned yet.
const STATUS_LABEL = { 'in the ground': 'In the ground', planned: 'Planned', 'not planned': 'Not planned yet' } as const

function Schedule({
  rows,
  note,
  here,
  plants,
}: {
  rows: ScheduleRow[]
  note?: string
  here: { inGround: FullPlant[]; onLists: FullPlant[] }
  plants: FullPlant[]
}) {
  return (
    <div className="block">
      <h3 className="label">Plant schedule</h3>
      {note && <p className="group-sub schedule-note">{note}</p>}
      <ul className="schedule">
        {rows.map((r, i) => {
          const { status, plantId } = scheduleStatus(r, here)
          // Not on this site yet: still link to the plant's page if the catalogue has it.
          const id = plantId ?? matchPlant(r.common, plants) ?? matchPlant(r.latin, plants)
          const feeds = plantTraits({ pollinators: r.pollinators, why: null, native: false }).pollinators
          return (
            <li key={`${r.key}-${i}`} className="schedule-row">
              <KeySwatch row={r} />
              <div className="schedule-body">
                {id ? (
                  <a className="plan-name" href={`#plant/${encodeURIComponent(id)}`}>
                    {r.common || r.latin}
                  </a>
                ) : (
                  <span className="plan-name">{r.common || r.latin}</span>
                )}
                {r.latin && r.latin !== r.common && <span className="latin plan-latin">{r.latin}</span>}
                <span className="plan-meta">
                  {[r.qty && `× ${r.qty}`, r.size, r.bloom && r.bloom !== '—' ? `flowers ${r.bloom}` : null].filter(Boolean).join(' · ')}
                </span>
                {r.role && <span className="schedule-role">{r.role}</span>}
                {feeds.length > 0 && (
                  <span className="feeds-strip" aria-label={`Feeds ${feeds.map((t) => t.label.toLowerCase()).join(', ')}`}>
                    {feeds.map((t) => (
                      <Icon key={t.key} name={t.key} size={16} />
                    ))}
                  </span>
                )}
              </div>
              <span className="schedule-status" data-status={status}>
                {STATUS_LABEL[status]}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// The drawing's key: a circle in the plant's colours with its two letters, the
// letters light or dark to read on the fill.
function KeySwatch({ row }: { row: Pick<ScheduleRow, 'key' | 'fill' | 'stroke'> }) {
  const dark = (hex: string | null) => {
    const m = hex?.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (!m) return false
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45
  }
  return (
    <span
      className="key-swatch-plant"
      aria-hidden="true"
      style={{ background: row.fill ?? 'transparent', borderColor: row.stroke ?? row.fill ?? 'var(--line)', color: dark(row.fill) ? '#f5f1e6' : '#22251f' }}
    >
      {row.key}
    </span>
  )
}

// Through the year: when each plant in the design flowers, in its own colour, with
// the pollinators' critical months marked above and a count of what's in flower
// below (a critical month with nothing is a gap).
const LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

// "Saskatoon (existing)" -> "Saskatoon"; "Sour cherry · semi-dwarf" -> "Sour cherry".
const chartName = (r: Pick<ScheduleRow, 'common' | 'latin'>) =>
  (r.common || r.latin).replace(/\s*\(.*?\)/g, '').split(/\s+·\s+/)[0].trim() || r.common || r.latin

function BloomChart({ rows: schedule, month }: { rows: ScheduleRow[]; month: number }) {
  const { rows, counts, gaps } = bloomRows(schedule)
  const flowering = rows.filter((r) => r.months.length > 0)
  if (flowering.length === 0) return null
  const now = (i: number) => (i + 1 === month ? ' now' : '')
  return (
    <div className="block">
      <h3 className="label">Through the year</h3>
      <div className="bloom-chart">
        <div className="bloom-row bloom-head" aria-hidden="true">
          <span />
          {LETTERS.map((l, i) => (
            <span key={i} className={`bloom-letter${now(i)}`}>
              {l}
            </span>
          ))}
        </div>
        <div className="bloom-row" aria-hidden="true">
          <span className="bloom-name muted">Pollinators' need</span>
          {LETTERS.map((_, i) => (
            <span key={i} className={`bloom-cell${isCritical(i + 1) ? ' critical' : ''}${now(i)}`} />
          ))}
        </div>
        {flowering.map((r, k) => (
          <div key={`${r.key}-${k}`} className="bloom-row" role="img" aria-label={`${r.common || r.latin}: ${r.bloom}`}>
            <span className="bloom-name">{chartName(r)}</span>
            {LETTERS.map((_, i) => (
              <span
                key={i}
                className={`bloom-cell${r.months.includes(i + 1) ? ' on' : ''}${now(i)}`}
                style={r.months.includes(i + 1) ? { background: r.fill ?? 'var(--bloom)' } : undefined}
              />
            ))}
          </div>
        ))}
        <div className="bloom-row bloom-count" role="img" aria-label={`In flower each month: ${counts.map((c, i) => `${LETTERS[i]} ${c}`).join(', ')}`}>
          <span className="bloom-name">In flower</span>
          {counts.map((c, i) => (
            <span key={i} className={`bloom-num${gaps[i] ? ' gap' : ''}${now(i)}`}>
              {gaps[i] ? '–' : c}
            </span>
          ))}
        </div>
      </div>
      {gaps.some(Boolean) && <p className="task-detail">A dash is a critical month with nothing in this design in flower.</p>}
    </div>
  )
}

// A one-off task for this site.
function AddTask({
  siteName,
  months,
  onAdd,
}: {
  siteName: string
  months: { year: number; month: number }[]
  onAdd: (text: string, section: Section, at: { year: number; month: number }) => void
}) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [section, setSection] = useState<Section>('do')
  const [at, setAt] = useState(`${months[0].year}-${months[0].month}`)
  if (!adding)
    return (
      <button type="button" className="choice" onClick={() => setAdding(true)}>
        Add a task for {siteName}
      </button>
    )
  return (
    <form
      className="add-form form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        const [y, m] = at.split('-').map(Number)
        onAdd(text.trim(), section, { year: y, month: m })
        setText('')
        setAdding(false)
      }}
    >
      <label className="field">
        Task
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Weed around the camas" autoFocus />
      </label>
      <div className="choices" role="radiogroup" aria-label="Kind of task">
        {(['do', 'plant', 'buy'] as Section[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={section === s} className="choice small" onClick={() => setSection(s)}>
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>
      <label className="move-to">
        Month
        <select value={at} onChange={(e) => setAt(e.target.value)}>
          {months.map((m) => (
            <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
              {MONTHS[m.month - 1]}
              {m.year !== months[0].year ? ` ${m.year}` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="choices">
        <button type="submit" className="button" disabled={!text.trim()}>
          Add task
        </button>
        <button type="button" className="choice" onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// What's growing at the site, from the notes and added here: names the plant list
// doesn't know yet can be added to it (tap one), so they count everywhere.
function GrowingHere({
  site,
  plants,
  onExisting,
  addPlant,
}: {
  site: YardSite
  plants: FullPlant[]
  onExisting: (names: string[]) => void
  addPlant: (common: string, kind: string) => string
}) {
  const existing = site.existing ?? []
  const [seed, setSeed] = useState('')
  const known = existing.map((name) => ({ name, id: matchPlant(name, plants) }))
  return (
    <section className="block">
      <h2 className="label">Growing here</h2>
      {known.length === 0 ? (
        <p className="empty">Nothing recorded here yet.</p>
      ) : (
        <ul className="grow-chips">
          {known.map(({ name, id }) => (
            <li key={name} className="grow-chip" data-known={id ? true : undefined}>
              {id ? (
                <a href={`#plant/${encodeURIComponent(id)}`}>{name}</a>
              ) : (
                <button type="button" className="grow-unknown" onClick={() => setSeed(name)} aria-label={`Add ${name} to our plants`}>
                  {name} <span aria-hidden="true">+</span>
                </button>
              )}
              <button type="button" className="grow-remove" aria-label={`Not growing here: ${name}`} onClick={() => onExisting(existing.filter((n) => n !== name))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {known.some((k) => !k.id) && <p className="task-detail">Names with + aren't in our plant list yet. Tap one to add it, so it counts everywhere.</p>}
      <PlantPicker
        key={seed}
        seed={seed}
        label="Add a plant growing here"
        plants={plants}
        exclude={new Set(known.map((k) => k.id).filter((x): x is string => !!x))}
        addPlant={addPlant}
        onPick={(p) => {
          // A new plant for a name from the notes takes that name's place.
          onExisting([...existing.filter((n) => n !== seed && n !== p.common), p.common])
          setSeed('')
        }}
      />
    </section>
  )
}

// What to do and not use at the site, as on plant pages.
function RulesLines({ rules }: { rules: Rule[] }) {
  const { doLines, dontLines } = summarizeRules(rules)
  if (doLines.length === 0 && dontLines.length === 0) return null
  return (
    <section className="block">
      <h2 className="label">Planting it</h2>
      <div className="rules-summary">
        {doLines.length > 0 && (
          <p data-verdict="yes">
            <span className="rule-mark" aria-hidden="true">
              ✓
            </span>
            <span>
              <strong>Do:</strong> {doLines.map((l, i) => (i ? l[0].toLowerCase() + l.slice(1) : l)).join('; ')}.
            </span>
          </p>
        )}
        {dontLines.length > 0 && (
          <p data-verdict="no">
            <span className="rule-mark" aria-hidden="true">
              ✕
            </span>
            <span>
              <strong>Don't use:</strong> {dontLines.join(', ')}.
            </span>
          </p>
        )}
      </div>
    </section>
  )
}
