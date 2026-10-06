import { useState, type ReactNode } from 'react'
import { useSeasons, type NewItem } from '../lib/seasons'
import {
  currentSeason,
  groupByNursery,
  groupByPlant,
  groupStatus,
  KINDS,
  nextStatus,
  qtyLabel,
  seasonLabel,
  seasonOptions,
  STATUSES,
  type Nursery,
  type PlanItem,
  type Plant,
  type PlantGroup,
  type Site,
  type Status,
} from '../lib/plan'
import { clearSummary } from '../lib/clear'
import { ClearBar, ShowCleared } from './ClearBar'

const STATUS_LABEL: Record<Status, string> = { 'to buy': 'To buy', bought: 'Bought', planted: 'Planted', skipped: 'Skipped' }

// Shopping (the Seasons lists): fall and spring, grouped by nursery so each group is
// a trip, one card per plant with its sites inside. Tick plants off as you buy them,
// then "Clear N checked off" hides them (they stay bought, ready to mark planted).
// Tap a plant to change how many, where, or from which nursery, or to remove it.
export default function Seasons({ userId }: { userId: string }) {
  const { data, error, pending, reload, update, remove, add, addPlant, clear } = useSeasons(userId)
  const [showCleared, setShowCleared] = useState(false)
  const [season, setSeason] = useState(() => currentSeason())
  const [onlyToBuy, setOnlyToBuy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const items = data?.items.filter((i) => i.season === season) ?? []
  const shown = items.filter((i) => (!onlyToBuy || i.status === 'to buy') && (showCleared || !i.cleared_at))
  const clearable = items.filter((i) => i.status !== 'to buy' && !i.cleared_at)
  const clearedCount = items.filter((i) => i.cleared_at).length
  // Counted by plant, like the cards: Great Camas for five sites is one to buy.
  const counts: Record<Status, number> = { 'to buy': 0, bought: 0, planted: 0, skipped: 0 }
  for (const g of data ? groupByNursery(items, data.nurseries, data.plants) : [])
    for (const pg of groupByPlant(g.items, data?.plants ?? [])) {
      const s = groupStatus(pg)
      counts[s === 'mixed' ? (pg.counts['to buy'] > 0 ? 'to buy' : 'bought') : s]++
    }
  const groups = data ? groupByNursery(shown, data.nurseries, data.plants) : []
  const siteNumber = (id: string | null) => data?.sites.find((s) => s.id === id)?.number
  const summary = STATUSES.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(' · ')

  return (
    <>
      <header className="page-head">
        <p className="kicker">To buy and to plant</p>
        <h1>Shopping</h1>
      </header>
      <hr className="rule" />

      {error && !data && (
        <section className="block">
          <p className="notice notice-error">{error}</p>
          <button type="button" className="choice" onClick={reload}>
            Try again
          </button>
        </section>
      )}

      {data && !data.gardenId && (
        <p className="empty">This account isn't part of a garden yet. Ask whoever runs your garden to add you.</p>
      )}

      {(data?.fromPhone || pending > 0) && (
        <p className="sync-note" role="status">
          {data?.fromPhone ? 'No connection: showing what this phone last saw. ' : ''}
          {pending > 0 ? `${pending} ${pending === 1 ? 'change' : 'changes'} will be sent when you have signal.` : ''}
        </p>
      )}

      {data?.gardenId && (
        <>
          <div className="choices" role="radiogroup" aria-label="Season">
            {seasonOptions(data.items).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={season === s}
                className="choice"
                onClick={() => {
                  setSeason(s)
                  setOpen(null)
                  setAdding(false)
                }}
              >
                {seasonLabel(s)}
              </button>
            ))}
          </div>

          <div className="head-row">
            <p className="sync-note">{summary || 'Nothing on this list yet.'}</p>
            {items.length > 0 && (
              <button type="button" className="text-button" aria-pressed={onlyToBuy} onClick={() => setOnlyToBuy(!onlyToBuy)}>
                {onlyToBuy ? 'Show everything' : 'Only what’s to buy'}
              </button>
            )}
          </div>

          {groups.map((g) => (
            <section key={g.nursery?.id ?? 'none'} className="block">
              <div>
                <h2 className="label">{g.nursery?.name ?? 'No nursery yet'}</h2>
                {g.nursery && <p className="group-sub">{nurseryLine(g.nursery)}</p>}
              </div>
              <ul className="plan-list">
                {groupByPlant(g.items, data.plants, siteNumber).map((pg) => {
                  const row = (item: PlanItem, asSite: boolean) => (
                    <PlanRow
                      key={item.id}
                      item={item}
                      plant={data.plants.find((p) => p.id === item.plant_id)}
                      site={data.sites.find((s) => s.id === item.site_id)}
                      sites={data.sites}
                      nurseries={data.nurseries}
                      asSite={asSite}
                      open={open === item.id}
                      onToggle={() => setOpen(open === item.id ? null : item.id)}
                      onChange={(patch) => update(item.id, patch)}
                      onRemove={() => {
                        remove(item.id)
                        setOpen(null)
                      }}
                      seasonName={seasonLabel(season)}
                    />
                  )
                  if (pg.items.length === 1) return row(pg.items[0], false)
                  const key = `${g.nursery?.id ?? 'none'}:${pg.plant_id}`
                  return (
                    <PlantGroupRow
                      key={key}
                      group={pg}
                      plant={data.plants.find((p) => p.id === pg.plant_id)}
                      open={openGroup === key}
                      onToggle={() => setOpenGroup(openGroup === key ? null : key)}
                      onStatus={(id, status) => update(id, { status })}
                    >
                      {pg.items.map((item) => row(item, true))}
                    </PlantGroupRow>
                  )
                })}
              </ul>
            </section>
          ))}

          {onlyToBuy && items.length > 0 && shown.length === 0 && <p className="empty">Everything on this list is bought.</p>}
          <ShowCleared count={clearedCount} shown={showCleared} onToggle={() => setShowCleared(!showCleared)} />

          {adding ? (
            <AddForm
              season={season}
              plants={data.plants}
              sites={data.sites}
              nurseries={data.nurseries}
              onAdd={(item, newPlant) => {
                const plantId = newPlant ? addPlant(newPlant.common, newPlant.kind) : item.plant_id
                add({ ...item, plant_id: plantId })
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" className="choice" onClick={() => setAdding(true)}>
              Add a plant to {seasonLabel(season)}
            </button>
          )}
          <ClearBar
            summary={clearSummary(
              clearable.map((i) => i.status_by),
              userId,
            )}
            onClear={() => clear(clearable.map((i) => i.id))}
          />
        </>
      )}
    </>
  )
}

function nurseryLine(n: Nursery) {
  const checked = n.last_checked
    ? `checked ${new Date(n.last_checked + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'stock not checked yet'
  return [n.location, checked].filter(Boolean).join(' · ')
}

const siteName = (s: Site) => `${s.number} · ${s.name}`

function PlanRow({
  item,
  plant,
  site,
  sites,
  nurseries,
  asSite,
  open,
  onToggle,
  onChange,
  onRemove,
  seasonName,
}: {
  item: PlanItem
  plant: Plant | undefined
  site: Site | undefined
  sites: Site[]
  nurseries: Nursery[]
  asSite: boolean // a site row inside a plant's card: the site is the headline
  open: boolean
  onToggle: () => void
  onChange: (patch: Partial<PlanItem>) => void
  onRemove: () => void
  seasonName: string
}) {
  const next = nextStatus(item.status)
  const name = plant?.common ?? 'Unknown plant'
  const where = site ? `Site ${siteName(site)}` : 'No site yet'
  const meta = [`× ${qtyLabel(item.qty_min, item.qty_max)}`, asSite ? null : where, item.spot].filter(Boolean).join(' · ')

  return (
    <li className="plan-item" data-status={item.status}>
      <div className="plan-row">
        <button
          type="button"
          className="task-check"
          role="checkbox"
          aria-checked={item.status !== 'to buy'}
          aria-disabled={item.status === 'planted' || item.status === 'skipped'}
          aria-label={`${item.status === 'to buy' ? 'Bought' : STATUS_LABEL[item.status]}: ${name}${asSite ? `, ${where}` : ''}`}
          onClick={() => {
            if (item.status === 'to buy') onChange({ status: 'bought' })
            else if (item.status === 'bought') onChange({ status: 'to buy' })
          }}
        >
          {item.status !== 'to buy' && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
              {item.status === 'skipped' ? <path d="M6 12h12" /> : <path d="M5 12.5l4.5 4.5L19 7.5" />}
            </svg>
          )}
        </button>
        <button type="button" className="plan-main" aria-expanded={open} onClick={onToggle}>
          <span className="plan-name">{asSite ? where : name}</span>
          {!asSite && plant?.latin && <span className="latin plan-latin">{plant.latin}</span>}
          <span className="plan-meta">
            {item.status !== 'to buy' && <span className="status-chip">{STATUS_LABEL[item.status]}</span>}
            {meta}
          </span>
        </button>
        {next === 'planted' && (
          <button
            type="button"
            className="choice small"
            aria-label={`Mark planted: ${name}${asSite ? `, ${where}` : ''}`}
            onClick={() => onChange({ status: next })}
          >
            Mark planted
          </button>
        )}
      </div>
      {open && (
        <PlanEditor item={item} name={name} sites={sites} nurseries={nurseries} onChange={onChange} onRemove={onRemove} seasonName={seasonName} />
      )}
    </li>
  )
}

// A plant going to several sites, as one card: "Great Camas · × 49 · 5 sites".
// Its circle buys the lot; opening it shows each site with its own circle and editor.
function PlantGroupRow({
  group,
  plant,
  open,
  onToggle,
  onStatus,
  children,
}: {
  group: PlantGroup
  plant: Plant | undefined
  open: boolean
  onToggle: () => void
  onStatus: (id: string, status: Status) => void
  children: ReactNode
}) {
  const name = plant?.common ?? 'Unknown plant'
  const status = groupStatus(group)
  const n = group.items.length
  const toBuy = group.counts['to buy']
  const allBought = group.counts.bought === n
  const inert = toBuy === 0 && !allBought
  const got = n - toBuy - group.counts.skipped
  const meta = [
    `× ${qtyLabel(group.qtyMin, group.qtyMax)}`,
    `${n} sites`,
    status === 'mixed' && toBuy > 0 ? `${got} of ${n} bought` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="plan-item" data-status={status === 'mixed' ? (toBuy > 0 ? 'to buy' : 'bought') : status}>
      <div className="plan-row">
        <button
          type="button"
          className="task-check"
          role="checkbox"
          aria-checked={toBuy === 0}
          aria-disabled={inert}
          aria-label={toBuy > 0 ? `Bought, all sites: ${name}` : `${allBought ? 'Bought' : 'Done'}: ${name}`}
          onClick={() => {
            if (toBuy > 0) {
              for (const i of group.items) if (i.status === 'to buy') onStatus(i.id, 'bought')
            } else if (allBought) {
              for (const i of group.items) onStatus(i.id, 'to buy')
            }
          }}
        >
          {toBuy === 0 && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </button>
        <button type="button" className="plan-main" aria-expanded={open} onClick={onToggle}>
          <span className="plan-name">{name}</span>
          {plant?.latin && <span className="latin plan-latin">{plant.latin}</span>}
          <span className="plan-meta">
            {status !== 'to buy' && status !== 'mixed' && <span className="status-chip">{STATUS_LABEL[status]}</span>}
            {meta}
          </span>
        </button>
        {allBought && (
          <button
            type="button"
            className="choice small"
            aria-label={`Mark planted, all sites: ${name}`}
            onClick={() => group.items.forEach((i) => onStatus(i.id, 'planted'))}
          >
            Mark planted
          </button>
        )}
      </div>
      {open && <ul className="plan-sites">{children}</ul>}
    </li>
  )
}

function PlanEditor({
  item,
  name,
  sites,
  nurseries,
  onChange,
  onRemove,
  seasonName,
}: {
  item: PlanItem
  name: string
  sites: Site[]
  nurseries: Nursery[]
  onChange: (patch: Partial<PlanItem>) => void
  onRemove: () => void
  seasonName: string
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="plan-edit">
      {item.notes && <p className="task-detail">{item.notes}</p>}
      <div className="choices" role="radiogroup" aria-label={`Status: ${name}`}>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={item.status === s}
            className="choice small"
            onClick={() => onChange({ status: s })}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <Quantity min={item.qty_min} max={item.qty_max} onChange={(qty_min, qty_max) => onChange({ qty_min, qty_max })} />
      <label className="field">
        Site
        <select value={item.site_id ?? ''} onChange={(e) => onChange({ site_id: e.target.value || null })}>
          <option value="">No site yet</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {siteName(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nursery
        <select value={item.nursery_id ?? ''} onChange={(e) => onChange({ nursery_id: e.target.value || null })}>
          <option value="">No nursery yet</option>
          {nurseries.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      {confirming ? (
        <p className="confirm-line">
          Take {name} off {seasonName}?{' '}
          <button type="button" className="text-button" onClick={onRemove}>
            Yes, remove it
          </button>{' '}
          <button type="button" className="text-button" onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </p>
      ) : (
        <button type="button" className="text-button" onClick={() => setConfirming(true)}>
          Remove from {seasonName}
        </button>
      )}
    </div>
  )
}

// "How many" and "up to": 2 and 3 means two or three. Saved when the field is left.
function Quantity({ min, max, onChange }: { min: number; max: number; onChange: (min: number, max: number) => void }) {
  const [lo, setLo] = useState(String(min))
  const [hi, setHi] = useState(String(max))
  function commit() {
    const a = Math.max(1, Math.min(999, Math.round(Number(lo)) || min))
    const b = Math.max(a, Math.min(999, Math.round(Number(hi)) || a))
    setLo(String(a))
    setHi(String(b))
    if (a !== min || b !== max) onChange(a, b)
  }
  return (
    <div className="qty">
      <label className="field">
        How many
        <input type="number" inputMode="numeric" min={1} value={lo} onChange={(e) => setLo(e.target.value)} onBlur={commit} />
      </label>
      <label className="field">
        Up to
        <input type="number" inputMode="numeric" min={1} value={hi} onChange={(e) => setHi(e.target.value)} onBlur={commit} />
      </label>
    </div>
  )
}

function AddForm({
  season,
  plants,
  sites,
  nurseries,
  onAdd,
  onCancel,
}: {
  season: string
  plants: Plant[]
  sites: Site[]
  nurseries: Nursery[]
  onAdd: (item: NewItem, newPlant: { common: string; kind: string } | null) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('')
  const [qty, setQty] = useState({ min: 1, max: 1 })
  const [siteId, setSiteId] = useState('')
  const [nurseryId, setNurseryId] = useState('')
  const match = plants.find((p) => p.common.toLowerCase() === name.trim().toLowerCase())
  const isNew = name.trim() !== '' && !match

  return (
    <form
      className="form add-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || (isNew && !kind)) return
        onAdd(
          { plant_id: match?.id ?? '', season, qty_min: qty.min, qty_max: qty.max, site_id: siteId || null, nursery_id: nurseryId || null },
          isNew ? { common: name.trim(), kind } : null,
        )
      }}
    >
      <h2 className="label">Add a plant to {seasonLabel(season)}</h2>
      <label className="field">
        Plant
        <input list="plant-names" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <datalist id="plant-names">
          {plants.map((p) => (
            <option key={p.id} value={p.common} />
          ))}
        </datalist>
      </label>
      {isNew && (
        <label className="field">
          New to the list. What kind of plant?
          <select required value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Choose one</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k[0].toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}
      <Quantity min={qty.min} max={qty.max} onChange={(min, max) => setQty({ min, max })} />
      <label className="field">
        Site
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">No site yet</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {siteName(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nursery
        <select value={nurseryId} onChange={(e) => setNurseryId(e.target.value)}>
          <option value="">No nursery yet</option>
          {nurseries.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <div className="choices">
        <button type="submit" className="button">
          Add to list
        </button>
        <button type="button" className="choice" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
