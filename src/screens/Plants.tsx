import { useState } from 'react'
import { useCatalogue } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import { statusLine, type PlanItem } from '../lib/plan'
import {
  availableFilters,
  describeFilters,
  FILTERS,
  matchesFilters,
  matchesSearch,
  plantsByPlace,
  plantTraits,
  type FullPlant,
  type Planting,
} from '../lib/plants'
import { shortDate } from '../lib/season'
import { Icon } from './Icons'

const FILTER_KEY = 'ff-plant-filters'

// Kept for this visit, so opening a plant and coming back keeps the filters on.
function readFilters(): string[] {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY)
    const keys = raw ? (JSON.parse(raw) as string[]) : []
    return keys.filter((k) => FILTERS.some((f) => f.key === k))
  } catch {
    return []
  }
}

function saveFilters(keys: string[]) {
  try {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify(keys))
  } catch {
    // Storage blocked: the filters just won't survive leaving the screen.
  }
}

// Plants: what's in the ground, what's on the shopping lists, then the rest of the
// catalogue. Filter by who a plant feeds and what it's like, with the same chips
// as plant pages (Mealboard's pattern: rows of chips, any number on, all must
// match). Each plant opens its page. The yard map and its sites are on Garden.
export default function Plants({ userId }: { userId: string }) {
  const { data, error, reload } = useCatalogue(userId)
  const seasons = useSeasons(userId)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string[]>(readFilters)

  const choose = (keys: string[]) => {
    setSelected(keys)
    saveFilters(keys)
  }
  const toggle = (key: string) => choose(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])

  const items = seasons.data?.items ?? []
  const all = data?.plants ?? []
  const searched = all.filter((p) => matchesSearch(p, q))
  const shownChips = availableFilters(searched, selected)
  const keep = (p: FullPlant) => matchesSearch(p, q) && matchesFilters(p, selected)

  const { inGround, onLists, others } = !data
    ? { inGround: [], onLists: [], others: [] }
    : plantsByPlace(all.filter(keep), items, [
          ...data.plantings,
          // Seen in flower here, so it grows here.
          ...data.bloomMarks.map((m) => ({ plant_id: m.plant_id, action: 'seen', happened_on: m.marked_at.slice(0, 10) })),
        ])
  const total = inGround.length + onLists.length + others.length
  const filtering = selected.length > 0 || q.trim() !== ''

  return (
    <>
      <header className="page-head">
        <p className="kicker">{all.length ? `${all.length} plants` : 'Our plants'}</p>
        <h1>Plants</h1>
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

      {data?.gardenId && (
        <>
          <label className="field">
            Find a plant
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" />
          </label>

          {(['feeds', 'traits'] as const).map((row) => {
            const chips = shownChips.filter((f) => f.row === row)
            if (chips.length === 0) return null
            return (
              <div key={row} className="filter-row">
                <span className="label">{row === 'feeds' ? 'Feeds' : 'Good to know'}</span>
                <div className="filter-chips" role="group" aria-label={row === 'feeds' ? 'Filter by who it feeds' : 'Filter by what it is like'}>
                  {chips.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className="filter-chip"
                      aria-pressed={selected.includes(f.key)}
                      onClick={() => toggle(f.key)}
                    >
                      <Icon name={f.icon} size={16} /> {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {selected.length > 0 && (
            <p className="filter-summary" role="status">
              {describeFilters(total, selected)}{' '}
              <button type="button" className="text-button inline" onClick={() => choose([])}>
                Clear
              </button>
            </p>
          )}

          {filtering && total === 0 ? (
            <p className="empty">
              Nothing matches all of those. Try turning a filter off{q.trim() ? ' or searching another name' : ''}.{' '}
              <button
                type="button"
                className="text-button inline"
                onClick={() => {
                  choose([])
                  setQ('')
                }}
              >
                Clear
              </button>
            </p>
          ) : (
            <>
              <PlantList
                title="In the ground"
                about="Planted in our garden."
                plants={inGround}
                items={items}
                plantings={data.plantings}
                empty={filtering ? '' : 'Nothing planted yet. Mark a plant planted in To do › Buy, or in flower on Pollinators, and it shows up here.'}
              />
              <PlantList
                title="On our shopping lists"
                about="Still to buy, or bought and waiting to go in."
                plants={onLists}
                items={items}
                plantings={data.plantings}
                empty={filtering ? '' : 'Nothing on the shopping lists right now.'}
              />
              <PlantList
                title="More plants"
                about="Ideas from our plant lists, not planned yet."
                plants={others}
                items={items}
                plantings={data.plantings}
                empty=""
              />
            </>
          )}
        </>
      )}
    </>
  )
}

// A list of plants, each opening its page. On a site page each row can also be
// removed from the site: ✕, then a one-line question to confirm.
export function PlantList({
  title,
  about,
  plants,
  items,
  plantings,
  empty,
  onRemove,
  removeQuestion,
}: {
  title: string
  about: string
  plants: FullPlant[]
  items: PlanItem[]
  plantings: Planting[]
  empty: string
  onRemove?: (plant: FullPlant) => void
  removeQuestion?: (plant: FullPlant) => string
}) {
  const [asking, setAsking] = useState<string | null>(null)
  if (plants.length === 0 && !empty) return null
  return (
    <section className="block">
      <div>
        <h2 className="label">{title}</h2>
        <p className="group-sub">{about}</p>
      </div>
      {plants.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul className="plant-list">
          {plants.map((p) => {
            const feeds = plantTraits(p).pollinators
            return (
              <li key={p.id} className={onRemove ? 'removable' : undefined}>
                <a className="plant-link" href={`#plant/${encodeURIComponent(p.id)}`}>
                  <span className="plan-name">{p.common}</span>
                  {p.latin && p.latin !== p.common && <span className="latin plan-latin">{p.latin}</span>}
                  <span className="plan-meta">{plantLine(p, items, plantings)}</span>
                  {feeds.length > 0 && (
                    <span className="feeds-strip" aria-label={`Feeds ${feeds.map((t) => t.label.toLowerCase()).join(', ')}`}>
                      {feeds.map((t) => (
                        <Icon key={t.key} name={t.key} size={16} />
                      ))}
                    </span>
                  )}
                </a>
                {onRemove && (
                  <button type="button" className="grow-remove plant-remove" aria-label={`Remove ${p.common}`} aria-expanded={asking === p.id} onClick={() => setAsking(asking === p.id ? null : p.id)}>
                    ✕
                  </button>
                )}
                {onRemove && asking === p.id && (
                  <p className="remove-ask" role="status">
                    {removeQuestion?.(p) ?? `Remove ${p.common}?`}{' '}
                    <button
                      type="button"
                      className="text-button inline"
                      onClick={() => {
                        onRemove(p)
                        setAsking(null)
                      }}
                    >
                      Remove
                    </button>{' '}
                    <button type="button" className="text-button inline" onClick={() => setAsking(null)}>
                      Keep
                    </button>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// "Perennial flower · BC native · To buy for fall 2026" or "… · Planted Oct 5".
function plantLine(p: FullPlant, items: PlanItem[], plantings: Planting[]) {
  const parts = [p.kind[0].toUpperCase() + p.kind.slice(1)]
  if (p.native) parts.push('BC native')
  if (p.threat_tier) parts.push('Pollinator plant')
  const last = plantings.filter((x) => x.plant_id === p.id).sort((a, b) => b.happened_on.localeCompare(a.happened_on))[0]
  const open = items.filter((i) => i.plant_id === p.id && i.status !== 'planted' && i.status !== 'skipped')
  if (last) parts.push(`${last.action[0].toUpperCase() + last.action.slice(1)} ${shortDate(last.happened_on)}`)
  else if (open.length) parts.push(statusLine(open[0].status, open[0].season))
  return parts.join(' · ')
}
