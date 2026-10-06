import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { useCatalogue } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import { summarizeRules, type FullPlant, type Rule } from '../lib/plants'
import { matchPlant, siteContents, type YardSite } from '../lib/yard'
import YardMap from './YardMap'
import PlantPicker from './PlantPicker'
import { PlantList } from './Plants'

// Garden: the front yard drawn to scale, each site in its colour. Tap a site (or its
// chip) to see its conditions, what to do and not use there, what's growing there
// (and add more), and its plants in the ground and on the shopping lists. The
// chosen site is in the address (#garden/site/4), so back works.
export default function Garden({ userId, site: siteNumber }: { userId: string; site: number | null }) {
  const { data, error, reload, addPlant } = useCatalogue(userId)
  const seasons = useSeasons(userId)

  const all = data?.plants ?? []
  const items = seasons.data?.items ?? []
  const map = seasons.data?.map ?? null
  const sites: YardSite[] = seasons.data?.sites ?? []
  const contents = (s: YardSite) => siteContents(s, { plants: all, items, plantings: data?.plantings ?? [], rules: data?.rules ?? [] })
  const counts = Object.fromEntries(
    sites.map((s) => {
      const c = contents(s)
      return [s.number, c.inGround.length + c.onLists.length + c.notesOnly.length]
    }),
  )
  const site = siteNumber === null ? null : (sites.find((s) => s.number === siteNumber) ?? null)
  const here = site ? contents(site) : null
  const chooseSite = (n: number | null) => {
    location.hash = n === null ? 'garden' : `garden/site/${n}`
  }
  // The map is tall: bring a newly chosen site's panel into view.
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (siteNumber === null) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    panel.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' })
  }, [siteNumber])

  return (
    <>
      <header className="page-head">
        <p className="kicker">{sites.length ? `Front yard · ${sites.length} sites` : 'Front yard'}</p>
        <h1>Garden</h1>
      </header>
      <hr className="rule" />

      {(error || seasons.error) && !(data && seasons.data) && (
        <section className="block">
          <p className="notice notice-error">{error || seasons.error}</p>
          <button
            type="button"
            className="choice"
            onClick={() => {
              reload()
              seasons.reload()
            }}
          >
            Try again
          </button>
        </section>
      )}

      {data && !data.gardenId && (
        <p className="empty">This account isn't part of a garden yet. Ask whoever runs your garden to add you.</p>
      )}

      {data?.gardenId && seasons.data && (
        <>
          {map && sites.length > 0 ? (
            <YardMap map={map} sites={sites} counts={counts} selected={site?.number ?? null} onSelect={chooseSite} />
          ) : (
            <p className="empty">The garden's map isn't loaded yet.</p>
          )}
          {site && here ? (
            <>
              <SitePanel
                ref={panel}
                site={site}
                plants={all}
                rules={here.rules}
                onClear={() => chooseSite(null)}
                onExisting={(names) => seasons.setExisting(site.id, names)}
                addPlant={addPlant}
              />
              <PlantList
                title="In the ground"
                about={`Growing in ${site.name}.`}
                plants={here.inGround}
                items={items}
                plantings={data.plantings}
                empty="Nothing recorded here yet."
              />
              <PlantList
                title="On our shopping lists"
                about={`Still to buy for ${site.name}, or bought and waiting to go in.`}
                plants={here.onLists}
                items={items}
                plantings={data.plantings}
                empty="Nothing on the lists for this site."
              />
            </>
          ) : (
            map && <p className="empty">Tap a site to see what's growing there.</p>
          )}
        </>
      )}
    </>
  )
}

// The chosen site: its name and conditions, what to do and not use there, and
// what's growing there (from the notes, and added here). Names the plant list
// doesn't know yet can be added to it, so they count everywhere, the ring included.
function SitePanel({
  ref,
  site,
  plants,
  rules,
  onClear,
  onExisting,
  addPlant,
}: {
  ref: Ref<HTMLElement>
  site: YardSite
  plants: FullPlant[]
  rules: Rule[]
  onClear: () => void
  onExisting: (names: string[]) => void
  addPlant: (common: string, kind: string) => string
}) {
  const { doLines, dontLines } = summarizeRules(rules)
  const existing = site.existing ?? []
  // A name the plant list doesn't know: tapping it starts the picker with that name.
  const [seed, setSeed] = useState('')
  const known = existing.map((name) => ({ name, id: matchPlant(name, plants) }))
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
      <div className="block">
        <h3 className="label">Growing here</h3>
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
      </div>
    </section>
  )
}
