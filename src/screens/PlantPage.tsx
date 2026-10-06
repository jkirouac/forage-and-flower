import { useState } from 'react'
import { useCatalogue, type NewPlanting } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import { useGarden } from '../lib/garden'
import { markedMonths } from '../lib/pollinators'
import { buildMonth, SECTIONS } from '../lib/month'
import { qtyLabel, seasonLabel, type Nursery, type PlanItem, type Site } from '../lib/plan'
import {
  ACTIONS,
  plantingMonths,
  plantTraits,
  rulesFor,
  summarizeRules,
  taskForPlanting,
  plain,
  whyBullets,
  type Action,
  type FullPlant,
  type Planting,
  type Rule,
  type Trait,
} from '../lib/plants'
import { MONTHS, shortDate } from '../lib/season'
import { Icon, KindIcon } from './Icons'

const ACTION_LABEL: Record<Action, string> = { planted: 'Planted', sown: 'Sown', moved: 'Moved', divided: 'Divided', died: 'Died' }
const STATUS_LINE: Record<string, string> = {
  'to buy': 'not bought yet',
  bought: 'bought, not planted yet',
  planted: 'planted',
  skipped: 'skipped',
}
const LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A plant page: a photo, what it feeds and what it's like at a glance, why it's
// here, when it's planted and in flower, what to do and not use, where it's being
// bought and planted, and what you've done with it. Recording a planting also marks
// its list item planted and ticks this month's task.
export default function PlantPage({ userId, plantId }: { userId: string; plantId: string }) {
  const catalogue = useCatalogue(userId)
  const seasons = useSeasons(userId)
  const [now] = useState(() => new Date())
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const garden = useGarden(userId, year)
  const [recording, setRecording] = useState(false)
  const [saved, setSaved] = useState('')
  const [photoFailed, setPhotoFailed] = useState(false)

  const plant = catalogue.data?.plants.find((p) => p.id === plantId)
  const sites = seasons.data?.sites ?? []
  const nurseries = seasons.data?.nurseries ?? []
  const items = (seasons.data?.items ?? []).filter((i) => i.plant_id === plantId)
  const log = (catalogue.data?.plantings ?? [])
    .filter((p) => p.plant_id === plantId)
    .sort((a, b) => b.happened_on.localeCompare(a.happened_on))
  const siteById = (id: string | null) => sites.find((s) => s.id === id)

  const back = (
    <a className="back" href="#plants">
      ← Plants
    </a>
  )

  if (!catalogue.data) {
    return (
      <header className="page-head">
        {back}
        {catalogue.error && <p className="notice notice-error">{catalogue.error}</p>}
      </header>
    )
  }
  if (!plant) {
    return (
      <>
        <header className="page-head">
          {back}
          <h1>We can't find this plant</h1>
        </header>
        <p className="empty">It may have come off our lists.</p>
      </>
    )
  }

  const siteIds = [...new Set([...items.map((i) => i.site_id), ...log.map((p) => p.site_id)].filter((x): x is string => !!x))]
  const rules = rulesFor(plant, catalogue.data.rules, siteIds, (id) => siteById(id)?.number ?? 99)
  const rows = [
    { label: 'Planting', months: plantingMonths(plant, garden.garden?.tasks ?? []), tone: 'plant' },
    { label: 'Flowering', months: plant.bloom_months, tone: 'bloom' },
    // Months someone saw it in flower in this garden, any year.
    { label: 'Seen here', months: markedMonths(plant.id, catalogue.data.bloomMarks), tone: 'seen' },
    { label: 'Pollinators', months: plant.pollinator_months, tone: 'pollen' },
  ].filter((r) => r.months.length > 0)
  const thisYear = now.getFullYear()
  const mark = catalogue.data.bloomMarks.find((b) => b.plant_id === plant.id && b.year === thisYear && b.month === month)

  function save(entry: NewPlanting, item: PlanItem | null) {
    catalogue.record(entry)
    const notes: string[] = []
    const putIn = entry.action === 'planted' || entry.action === 'sown'
    if (item && putIn && item.status !== 'planted') {
      seasons.update(item.id, { status: 'planted' })
      notes.push(`marked it planted on the ${seasonLabel(item.season).toLowerCase()} list`)
    }
    // Tick this month's task for it, if the planting was this month.
    const [y, m] = entry.happened_on.split('-').map(Number)
    if (putIn && y === year && m === month && garden.garden && plant) {
      const list = buildMonth(garden.garden.tasks, garden.garden.checks, year, month)
      const open = SECTIONS.flatMap((s) => list[s]).filter((i) => !i.check).map((i) => i.task)
      const task = taskForPlanting(open, plant)
      if (task) {
        garden.tick(task.id, year, month, 'done')
        notes.push(`ticked “${task.title}” off this month`)
      }
    }
    setSaved(`Saved.${notes.length ? ` Also ${notes.join(' and ')}.` : ''}`)
    setRecording(false)
  }

  return (
    <>
      <header className="page-head">
        {back}
        {plant.photo_url && !photoFailed ? (
          <figure className="plant-photo">
            <img
              src={plant.photo_url}
              alt={plant.common}
              loading="lazy"
              decoding="async"
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={() => setPhotoFailed(true)}
            />
            {plant.photo_credit && (
              <figcaption>
                Photo:{' '}
                {plant.photo_page ? (
                  <a href={plant.photo_page} target="_blank" rel="noreferrer">
                    {plant.photo_credit}
                  </a>
                ) : (
                  plant.photo_credit
                )}
              </figcaption>
            )}
          </figure>
        ) : (
          <div className="plant-photo none" aria-hidden="true">
            <KindIcon kind={plant.kind} size={44} />
          </div>
        )}
        <p className="kicker">{plant.kind}</p>
        <h1>{plant.common}</h1>
        {plant.latin && plant.latin !== plant.common && <p className="latin plant-latin">{plant.latin}</p>}
      </header>
      <hr className="rule" />

      <AtAGlance plant={plant} />

      {(plant.threat_reason || plant.why) && (
        <section className="block">
          <h2 className="label">Why it's here</h2>
          {plant.threat_reason && (
            <p className="threat-line">
              <span className="threat-tier" data-tier={plant.threat_tier ?? undefined}>
                {plant.threat_tier === 'high' ? 'Top pollinator pick' : 'Pollinator pick'}
              </span>{' '}
              {plant.threat_reason}
            </p>
          )}
          {plant.why && (
            <ul className="why-list">
              {whyBullets(plain(plant.why)).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="block">
        <h2 className="label">Through the year</h2>
        {rows.length ? (
          <>
            <MonthBar rows={rows} current={month} />
            <p className="bar-key">
              {rows.map((r) => (
                <span key={r.tone}>
                  <span className={`key-swatch ${r.tone}`} /> {r.label === 'Planting' ? 'Planting time' : r.label === 'Flowering' ? 'In flower' : r.label === 'Seen here' ? 'Seen in flower here' : 'Pollinators use it'}
                </span>
              ))}
              <span>
                <span className="key-swatch now" /> This month
              </span>
            </p>
          </>
        ) : (
          <p className="empty">We don't have its planting or flowering months yet.</p>
        )}
        <div className="bloom-toggle">
          <button
            type="button"
            className="choice"
            aria-pressed={!!mark}
            onClick={() => (mark ? catalogue.unmarkBloom(mark.id) : catalogue.markBloom(plant.id, thisYear, month))}
          >
            {mark ? '✓ In flower now' : 'In flower now?'}
          </button>
          {mark && (
            <span className="task-detail">
              Marked by {catalogue.data.members[mark.marked_by ?? ''] ?? 'someone'} on {shortDate(new Date(mark.marked_at).toLocaleDateString('en-CA'))}.
            </span>
          )}
        </div>
      </section>

      {rules.length > 0 && <RulesSummary rules={rules} siteNumber={(id) => siteById(id)?.number} />}

      <section className="block">
        <h2 className="label">Shopping and planting</h2>
        {items.length === 0 ? (
          <p className="empty">Not on a shopping list yet. You can add it in To do › Buy.</p>
        ) : (
          <ul className="list-lines">
            {listGroups(items).map((g) => (
              <ListLine key={g.key} items={g.items} sites={sites} nursery={nurseries.find((n) => n.id === g.items[0].nursery_id)} />
            ))}
          </ul>
        )}
      </section>

      <PlantingLog
        log={log}
        members={catalogue.data.members}
        siteById={siteById}
        onRemove={(id) => catalogue.removeEntry(id)}
      />

      {saved && (
        <p className="notice" role="status">
          {saved}
        </p>
      )}
      {recording ? (
        <RecordForm
          plant={plant}
          items={items}
          sites={sites}
          onSave={save}
          onCancel={() => setRecording(false)}
        />
      ) : (
        <button
          type="button"
          className="button"
          onClick={() => {
            setSaved('')
            setRecording(true)
          }}
        >
          Record a planting
        </button>
      )}
    </>
  )
}

function MonthBar({ rows, current }: { rows: { label: string; months: number[]; tone: string }[]; current: number }) {
  return (
    <div className="month-bar">
      <div className="month-row month-head" aria-hidden="true">
        <span />
        {LETTERS.map((l, i) => (
          <span key={i} className={i + 1 === current ? 'now' : undefined}>
            {l}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="month-row" role="img" aria-label={`${r.label}: ${r.months.map((m) => MONTHS[m - 1]).join(', ')}`}>
          <span className="month-label">{r.label}</span>
          {LETTERS.map((_, i) => (
            <span key={i} className={`cell${r.months.includes(i + 1) ? ` on ${r.tone}` : ''}${i + 1 === current ? ' now' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

// One line per season and nursery, as in To do › Buy: a plant going to five sites is one line.
function listGroups(items: PlanItem[]) {
  const groups = new Map<string, PlanItem[]>()
  for (const i of items) {
    const key = `${i.season}:${i.nursery_id ?? ''}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(i)
  }
  return [...groups.entries()].map(([key, list]) => ({ key, items: list }))
}

// "Fall 2026: buy 49 for Sites 2, 4, 5, 7 and 9 from Fraser's Thimble Farms. 1 of 5 bought."
function ListLine({ items, sites, nursery }: { items: PlanItem[]; sites: Site[]; nursery: Nursery | undefined }) {
  const site = (id: string | null) => sites.find((s) => s.id === id)
  const numbers = items
    .map((i) => site(i.site_id)?.number)
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b)
  const only = items.length === 1 ? site(items[0].site_id) : undefined
  const forSites = only
    ? ` for Site ${only.number} (${only.name})`
    : numbers.length
      ? ` for Sites ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
      : ''
  const from = nursery ? ` from ${nursery.name}` : ''
  const min = items.reduce((n, i) => n + i.qty_min, 0)
  const max = items.reduce((n, i) => n + i.qty_max, 0)
  const statuses = new Set(items.map((i) => i.status))
  const got = items.filter((i) => i.status !== 'to buy' && i.status !== 'skipped').length
  const status =
    statuses.size === 1 ? STATUS_LINE[items[0].status] : `${got} of ${items.length} bought`
  return (
    <li>
      <a href="#todo/buy">
        <strong>{seasonLabel(items[0].season)}:</strong> buy {qtyLabel(min, max)}
        {forSites}
        {from}. <span className="list-status">{status[0].toUpperCase() + status.slice(1)}.</span>
      </a>
    </li>
  )
}

// Who it feeds, what it's like, and how big it gets, as small icon chips.
function AtAGlance({ plant }: { plant: FullPlant }) {
  const { pollinators, traits } = plantTraits(plant)
  if (!pollinators.length && !traits.length && !plant.size) return null
  const chips = (list: Trait[]) => (
    <ul className="trait-chips">
      {list.map((t) => (
        <li key={t.key}>
          <Icon name={t.key} /> {t.label}
        </li>
      ))}
    </ul>
  )
  return (
    <section className="block glance">
      {pollinators.length > 0 && (
        <div>
          <h2 className="label">Feeds</h2>
          {chips(pollinators)}
        </div>
      )}
      {(traits.length > 0 || plant.size) && (
        <div>
          <h2 className="label">Good to know</h2>
          {chips([...traits, ...(plant.size ? [{ key: 'size', label: plant.size }] : [])])}
        </div>
      )}
    </section>
  )
}

// What to do and what not to use, in two lines; the full rules, with their reasons
// and which site each comes from, one tap away.
function RulesSummary({ rules, siteNumber }: { rules: Rule[]; siteNumber: (id: string) => number | undefined }) {
  const [open, setOpen] = useState(false)
  const { doLines, dontLines } = summarizeRules(rules)
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
      <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'See why'}
      </button>
      {open && (
        <ul className="rules-box">
          {rules.map((r) => (
            <li key={r.id} data-verdict={r.verdict}>
              <span className="rule-mark" aria-hidden="true">
                {r.verdict === 'no' ? '✕' : '✓'}
              </span>
              <span>
                {r.site_id ? <strong>Site {siteNumber(r.site_id)}: </strong> : !r.garden_id ? null : <strong>Whole garden: </strong>}
                {r.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PlantingLog({
  log,
  members,
  siteById,
  onRemove,
}: {
  log: Planting[]
  members: Record<string, string>
  siteById: (id: string | null) => Site | undefined
  onRemove: (id: string) => void
}) {
  const [filter, setFilter] = useState<Action | 'all'>('all')
  const [confirming, setConfirming] = useState<string | null>(null)
  const kinds = ACTIONS.filter((a) => log.some((p) => p.action === a))
  const shown = log.filter((p) => filter === 'all' || p.action === filter)

  return (
    <section className="block">
      <h2 className="label">Planting log</h2>
      {log.length === 0 ? (
        <p className="empty">Nothing planted yet.</p>
      ) : (
        <>
          {kinds.length > 1 && (
            <div className="choices" role="radiogroup" aria-label="Show">
              {(['all', ...kinds] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={filter === a} className="choice small" onClick={() => setFilter(a)}>
                  {a === 'all' ? 'All' : ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          )}
          <ul className="log">
            {shown.map((p) => {
              const site = siteById(p.site_id)
              const from = siteById(p.from_site_id)
              const line = [
                `${ACTION_LABEL[p.action]}${p.quantity ? ` × ${p.quantity}` : ''}`,
                from && site ? `Site ${from.number} → Site ${site.number}` : site ? `Site ${site.number} · ${site.name}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={p.id}>
                  <p className="log-line">{line}</p>
                  <p className="task-meta">
                    <span>{shortDate(p.happened_on)}</span>
                    {p.done_by && members[p.done_by] && <span className="done-by">{members[p.done_by]}</span>}
                    {confirming === p.id ? (
                      <span>
                        Remove this entry?{' '}
                        <button type="button" className="text-button inline" onClick={() => onRemove(p.id)}>
                          Yes
                        </button>{' '}
                        <button type="button" className="text-button inline" onClick={() => setConfirming(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="text-button inline" onClick={() => setConfirming(p.id)}>
                        Remove
                      </button>
                    )}
                  </p>
                  {p.notes && <p className="task-detail">{p.notes}</p>}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

function RecordForm({
  plant,
  items,
  sites,
  onSave,
  onCancel,
}: {
  plant: FullPlant
  items: PlanItem[]
  sites: Site[]
  onSave: (entry: NewPlanting, item: PlanItem | null) => void
  onCancel: () => void
}) {
  const open = items.filter((i) => i.status !== 'planted' && i.status !== 'skipped')
  const first = open[0] ?? null
  const [action, setAction] = useState<Action>('planted')
  const [itemId, setItemId] = useState(first?.id ?? '')
  const [siteId, setSiteId] = useState(first?.site_id ?? '')
  const [fromSiteId, setFromSiteId] = useState('')
  const [qty, setQty] = useState(first ? String(first.qty_min) : '')
  const [day, setDay] = useState(today)
  const [notes, setNotes] = useState('')
  const item = open.find((i) => i.id === itemId) ?? null
  const fromList = (action === 'planted' || action === 'sown') && open.length > 0

  return (
    <form
      className="form add-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(
          {
            plant_id: plant.id,
            action,
            site_id: siteId || null,
            from_site_id: action === 'moved' ? fromSiteId || null : null,
            plan_item_id: fromList ? item?.id ?? null : null,
            quantity: qty ? Math.max(1, Math.round(Number(qty))) : null,
            happened_on: day,
            notes: notes.trim() || null,
          },
          fromList ? item : null,
        )
      }}
    >
      <h2 className="label">What happened to the {plant.common}?</h2>
      <div className="choices" role="radiogroup" aria-label="What happened">
        {ACTIONS.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={action === a} className="choice small" onClick={() => setAction(a)}>
            {ACTION_LABEL[a]}
          </button>
        ))}
      </div>
      {fromList && (
        <label className="field">
          From the list
          <select
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value)
              const picked = open.find((i) => i.id === e.target.value)
              if (picked) {
                setSiteId(picked.site_id ?? '')
                setQty(String(picked.qty_min))
              }
            }}
          >
            <option value="">Not from a shopping list</option>
            {open.map((i) => (
              <option key={i.id} value={i.id}>
                {seasonLabel(i.season)} · × {qtyLabel(i.qty_min, i.qty_max)}
                {i.site_id ? ` · Site ${sites.find((s) => s.id === i.site_id)?.number ?? ''}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {action === 'moved' && (
        <label className="field">
          Moved from
          <select value={fromSiteId} onChange={(e) => setFromSiteId(e.target.value)}>
            <option value="">Not sure</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number} · {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        {action === 'moved' ? 'Moved to' : 'Site'}
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">No site</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.number} · {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="qty">
        <label className="field">
          How many
          <input type="number" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="field">
          When
          <input type="date" required value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </label>
      <div className="choices">
        <button type="submit" className="button">
          Save
        </button>
        <button type="button" className="choice" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
