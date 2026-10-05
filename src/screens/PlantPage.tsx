import { useState } from 'react'
import { useCatalogue, type NewPlanting } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import { useGarden } from '../lib/garden'
import { buildMonth, SECTIONS } from '../lib/month'
import { qtyLabel, seasonLabel, type Nursery, type PlanItem, type Site } from '../lib/plan'
import { ACTIONS, plantingMonths, rulesFor, taskForPlanting, type Action, type FullPlant, type Planting } from '../lib/plants'
import { MONTHS, shortDate } from '../lib/season'

const ACTION_LABEL: Record<Action, string> = { planted: 'Planted', sown: 'Sown', moved: 'Moved', divided: 'Divided', died: 'Died' }
const STATUS_LABEL: Record<string, string> = { 'to buy': 'To buy', bought: 'Bought', planted: 'Planted', skipped: 'Skipped' }
const LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A plant page: why it's here, when it's planted and in flower, the rules for it,
// where it's on your lists and where to buy it, and what you've done with it.
// Recording a planting also marks its list item planted and ticks this month's task.
export default function PlantPage({ userId, plantId }: { userId: string; plantId: string }) {
  const catalogue = useCatalogue(userId)
  const seasons = useSeasons(userId)
  const [now] = useState(() => new Date())
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const garden = useGarden(userId, year)
  const [recording, setRecording] = useState(false)
  const [saved, setSaved] = useState('')

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
          <h1>Plant not found</h1>
        </header>
        <p className="empty">It may have been removed from the catalogue.</p>
      </>
    )
  }

  const siteIds = [...new Set([...items.map((i) => i.site_id), ...log.map((p) => p.site_id)].filter((x): x is string => !!x))]
  const rules = rulesFor(plant, catalogue.data.rules, siteIds, (id) => siteById(id)?.number ?? 99)
  const rows = [
    { label: 'Planting', months: plantingMonths(plant, garden.garden?.tasks ?? []), tone: 'plant' },
    { label: 'Flowering', months: plant.bloom_months, tone: 'bloom' },
    { label: 'Pollinators', months: plant.pollinator_months, tone: 'pollen' },
  ].filter((r) => r.months.length > 0)

  function save(entry: NewPlanting, item: PlanItem | null) {
    catalogue.record(entry)
    const notes: string[] = []
    const putIn = entry.action === 'planted' || entry.action === 'sown'
    if (item && putIn && item.status !== 'planted') {
      seasons.update(item.id, { status: 'planted' })
      notes.push(`marked planted on ${seasonLabel(item.season)}`)
    }
    // Tick this month's task for it, if the planting was this month.
    const [y, m] = entry.happened_on.split('-').map(Number)
    if (putIn && y === year && m === month && garden.garden && plant) {
      const list = buildMonth(garden.garden.tasks, garden.garden.checks, year, month)
      const open = SECTIONS.flatMap((s) => list[s]).filter((i) => !i.check).map((i) => i.task)
      const task = taskForPlanting(open, plant)
      if (task) {
        garden.tick(task.id, year, month, 'done')
        notes.push(`ticked “${task.title}”`)
      }
    }
    setSaved(`Saved${notes.length ? `, and ${notes.join(' and ')}` : ''}.`)
    setRecording(false)
  }

  return (
    <>
      <header className="page-head">
        {back}
        <p className="kicker">
          {plant.kind}
          {plant.native ? ' · BC native' : ''}
        </p>
        <h1>{plant.common}</h1>
        {plant.latin && <p className="latin plant-latin">{plant.latin}</p>}
      </header>
      <hr className="rule" />

      {(plant.threat_reason || plant.why) && (
        <section className="block">
          {plant.threat_reason && (
            <p className="threat-line">
              <span className="threat-tier" data-tier={plant.threat_tier ?? undefined}>
                {plant.threat_tier === 'high' ? 'Top pollinator pick' : 'Pollinator pick'}
              </span>{' '}
              {plant.threat_reason}
            </p>
          )}
          {plant.why && <p className="plant-why">{plant.why}</p>}
        </section>
      )}

      <section className="block">
        <h2 className="label">Through the year</h2>
        {rows.length ? <MonthBar rows={rows} current={month} /> : <p className="empty">No planting or flowering months for this plant yet.</p>}
      </section>

      {rules.length > 0 && (
        <section className="block">
          <h2 className="label">Rules for this plant</h2>
          <ul className="rules-box">
            {rules.map((r) => (
              <li key={r.id} data-verdict={r.verdict}>
                <span className="rule-mark" aria-hidden="true">
                  {r.verdict === 'no' ? '✕' : '✓'}
                </span>
                <span>
                  {r.site_id && <strong>Site {siteById(r.site_id)?.number}: </strong>}
                  {r.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="block">
        <h2 className="label">On our lists</h2>
        {items.length === 0 ? (
          <p className="empty">Not on a list yet. Add it from Shopping.</p>
        ) : (
          <ul className="plan-list">
            {items.map((i) => (
              <ListLine key={i.id} item={i} site={siteById(i.site_id)} nursery={nurseries.find((n) => n.id === i.nursery_id)} />
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

function ListLine({ item, site, nursery }: { item: PlanItem; site: Site | undefined; nursery: Nursery | undefined }) {
  const where = [seasonLabel(item.season), `× ${qtyLabel(item.qty_min, item.qty_max)}`, site ? `Site ${site.number} · ${site.name}` : 'No site yet']
  const buy = nursery
    ? [nursery.name, nursery.location, nursery.last_checked ? `checked ${shortDate(nursery.last_checked)}` : 'stock not checked yet']
        .filter(Boolean)
        .join(' · ')
    : 'No nursery yet'
  return (
    <li className="plan-item">
      <a className="plant-link" href="#seasons">
        <span className="plan-name">
          {where.join(' · ')} <span className="status-chip">{STATUS_LABEL[item.status]}</span>
        </span>
        <span className="plan-meta">Where to buy: {buy}</span>
      </a>
    </li>
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
        <p className="empty">Nothing recorded yet.</p>
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
      <h2 className="label">Record for {plant.common}</h2>
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
            <option value="">Not from a list</option>
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
