import { useState, type CSSProperties } from 'react'
import { useCatalogue } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import { useGarden } from '../lib/garden'
import { useDesignUrls } from '../lib/designs'
import { buildMonth, upcomingMonths, type Section } from '../lib/month'
import { summarizeRules, type FullPlant, type Rule } from '../lib/plants'
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

      <Designs designs={site.designs ?? []} urls={urls} />

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
function Designs({ designs, urls }: { designs: Design[]; urls: Record<string, string> }) {
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
