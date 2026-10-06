import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
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
  summarizeRules,
  type FullPlant,
  type Planting,
  type Rule,
} from '../lib/plants'
import { shortDate } from '../lib/season'
import { Icon } from './Icons'
import YardMap from './YardMap'
import { siteContents, type YardSite } from '../lib/yard'

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
// match). Each plant opens its page. Above it all, the yard map: choosing a site
// narrows the lists to that site and shows its conditions and rules.
export default function Plants({ userId, site: siteNumber }: { userId: string; site: number | null }) {
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

  // The yard map and the chosen site, if any.
  const map = seasons.data?.map ?? null
  const sites: YardSite[] = seasons.data?.sites ?? []
  const contents = (s: YardSite) => siteContents(s, { plants: all, items, plantings: data?.plantings ?? [], rules: data?.rules ?? [] })
  const counts = Object.fromEntries(sites.map((s) => { const c = contents(s); return [s.number, c.inGround.length + c.onLists.length + c.notesOnly.length] }))
  const site = siteNumber === null ? null : (sites.find((s) => s.number === siteNumber) ?? null)
  const here = site ? contents(site) : null
  const chooseSite = (n: number | null) => {
    location.hash = n === null ? 'plants' : `plants/site/${n}`
  }
  // The map is tall: bring a newly chosen site's panel into view.
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (siteNumber === null) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    panel.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' })
  }, [siteNumber])

  const { inGround, onLists, others } = !data
    ? { inGround: [], onLists: [], others: [] }
    : here
      ? { inGround: here.inGround.filter(keep), onLists: here.onLists.filter(keep), others: [] as FullPlant[] }
      : plantsByPlace(all.filter(keep), items, data.plantings)
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
          {map && sites.length > 0 && <YardMap map={map} sites={sites} counts={counts} selected={site?.number ?? null} onSelect={chooseSite} />}
          {site && here && <SitePanel ref={panel} site={site} notesOnly={here.notesOnly} rules={here.rules} onClear={() => chooseSite(null)} />}

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
                about={site ? `Growing in ${site.name}.` : 'Planted in our garden.'}
                plants={inGround}
                items={items}
                plantings={data.plantings}
                empty={filtering ? '' : site ? 'Nothing recorded here yet.' : 'Nothing planted yet. Mark a plant planted in Shopping and it shows up here.'}
              />
              <PlantList
                title="On our shopping lists"
                about={site ? `Still to buy for ${site.name}, or bought and waiting to go in.` : 'Still to buy, or bought and waiting to go in.'}
                plants={onLists}
                items={items}
                plantings={data.plantings}
                empty={filtering ? '' : site ? 'Nothing on the lists for this site.' : 'Nothing on the shopping lists right now.'}
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

// The chosen site: its name and conditions, what to do and not use there, and
// anything the notes say grows there that isn't in our plant list.
function SitePanel({
  ref,
  site,
  notesOnly,
  rules,
  onClear,
}: {
  ref: Ref<HTMLElement>
  site: YardSite
  notesOnly: string[]
  rules: Rule[]
  onClear: () => void
}) {
  const { doLines, dontLines } = summarizeRules(rules)
  return (
    <section ref={ref} className="site-panel" style={{ '--c': `var(--site-${site.number}, var(--lichen))` } as CSSProperties} aria-live="polite">
      <div className="site-head">
        <h2>
          {site.number} · {site.name}
        </h2>
        <button type="button" className="text-button" onClick={onClear}>
          Show all
        </button>
      </div>
      {site.conditions && <p className="group-sub">{site.conditions}</p>}
      {(doLines.length > 0 || dontLines.length > 0) && (
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
      )}
      {notesOnly.length > 0 && (
        <p>
          <span className="label">Also growing here</span>
          <br />
          {notesOnly.join(', ')}
        </p>
      )}
    </section>
  )
}

function PlantList({
  title,
  about,
  plants,
  items,
  plantings,
  empty,
}: {
  title: string
  about: string
  plants: FullPlant[]
  items: PlanItem[]
  plantings: Planting[]
  empty: string
}) {
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
              <li key={p.id}>
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
  if (p.threat_tier) parts.push('Pollinator pick')
  const last = plantings.filter((x) => x.plant_id === p.id).sort((a, b) => b.happened_on.localeCompare(a.happened_on))[0]
  const open = items.filter((i) => i.plant_id === p.id && i.status !== 'planted' && i.status !== 'skipped')
  if (last) parts.push(`${last.action[0].toUpperCase() + last.action.slice(1)} ${shortDate(last.happened_on)}`)
  else if (open.length) parts.push(statusLine(open[0].status, open[0].season))
  return parts.join(' · ')
}
