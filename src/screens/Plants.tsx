import { useState } from 'react'
import { useCatalogue } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import { seasonLabel, type PlanItem } from '../lib/plan'
import { matchesSearch, plantsByPlace, type FullPlant, type Planting } from '../lib/plants'
import { shortDate } from '../lib/season'

// Plants: what's in the ground, what's on the shopping lists, then the rest of the
// catalogue. Each opens its plant page.
export default function Plants({ userId }: { userId: string }) {
  const { data, error, reload } = useCatalogue(userId)
  const seasons = useSeasons(userId)
  const [q, setQ] = useState('')

  const items = seasons.data?.items ?? []
  const { inGround, onLists, others } = data
    ? plantsByPlace(data.plants, items, data.plantings)
    : { inGround: [], onLists: [], others: [] }
  const filter = (list: FullPlant[]) => list.filter((p) => matchesSearch(p, q))

  return (
    <>
      <header className="page-head">
        <p className="kicker">Our plants</p>
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
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Common or Latin name" />
          </label>
          <PlantList
            title="In the ground"
            about="Planted: marked planted on a shopping list, or recorded in a plant's planting log."
            plants={filter(inGround)}
            items={items}
            plantings={data.plantings}
            empty={q ? 'None of these match.' : 'Nothing recorded as planted yet. Mark plants planted in Shopping, or record a planting on a plant page.'}
          />
          <PlantList
            title="On our shopping lists"
            about="To buy or bought, and not planted yet."
            plants={filter(onLists)}
            items={items}
            plantings={data.plantings}
            empty={q ? 'None of these match.' : 'Nothing waiting to be bought or planted.'}
          />
          <PlantList
            title="More plants"
            about="The rest of the catalogue, from our ranked plant lists."
            plants={filter(others)}
            items={items}
            plantings={data.plantings}
            empty={q ? 'None of these match.' : ''}
          />
        </>
      )}
    </>
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
          {plants.map((p) => (
            <li key={p.id}>
              <a className="plant-link" href={`#plant/${encodeURIComponent(p.id)}`}>
                <span className="plan-name">{p.common}</span>
                {p.latin && <span className="latin plan-latin">{p.latin}</span>}
                <span className="plan-meta">{plantLine(p, items, plantings)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// "Perennial flower · BC native · Fall 2026: to buy" or "… · Planted 5 Oct".
function plantLine(p: FullPlant, items: PlanItem[], plantings: Planting[]) {
  const parts = [p.kind[0].toUpperCase() + p.kind.slice(1)]
  if (p.native) parts.push('BC native')
  if (p.threat_tier) parts.push('Pollinator pick')
  const last = plantings.filter((x) => x.plant_id === p.id).sort((a, b) => b.happened_on.localeCompare(a.happened_on))[0]
  const open = items.filter((i) => i.plant_id === p.id && i.status !== 'planted' && i.status !== 'skipped')
  if (last) parts.push(`${last.action[0].toUpperCase() + last.action.slice(1)} ${shortDate(last.happened_on)}`)
  else if (open.length) parts.push(`${seasonLabel(open[0].season)}: ${open[0].status}`)
  return parts.join(' · ')
}
