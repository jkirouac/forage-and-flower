import { useId, useState } from 'react'
import { KINDS } from '../lib/plan'
import { matchesSearch, type FullPlant } from '../lib/plants'

// Find a plant by name (common or Latin) and choose it; if it isn't in our plant
// list, add it as a new one, with its kind. Used for "Growing here" on the Plants
// map and "Something else in flower?" on Pollinators.
export default function PlantPicker({
  label,
  plants,
  exclude,
  onPick,
  addPlant,
  seed = '',
}: {
  seed?: string // start with this name typed in
  label: string
  plants: FullPlant[]
  exclude?: Set<string> // already chosen: not suggested again
  onPick: (plant: { id: string; common: string }) => void
  addPlant: (common: string, kind: string) => string
}) {
  const id = useId()
  const [q, setQ] = useState(seed)
  const [kind, setKind] = useState('')
  const name = q.trim()
  const lower = name.toLowerCase()
  const suggestions = name
    ? plants
        .filter((p) => !exclude?.has(p.id) && matchesSearch(p, name))
        // Names that start with what was typed first, then the rest, by name.
        .sort((a, b) => Number(!a.common.toLowerCase().startsWith(lower)) - Number(!b.common.toLowerCase().startsWith(lower)) || a.common.localeCompare(b.common))
        .slice(0, 6)
    : []
  const known = plants.some((p) => p.common.toLowerCase() === lower)
  const done = (p: { id: string; common: string }) => {
    onPick(p)
    setQ('')
    setKind('')
  }

  return (
    <div className="picker">
      <label className="field" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="search"
        className="picker-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Type a plant's name"
        autoComplete="off"
      />
      {name && (
        <ul className="picker-list" aria-label="Matching plants">
          {suggestions.map((p) => (
            <li key={p.id}>
              <button type="button" className="picker-option" onClick={() => done(p)}>
                {p.common}
                {p.latin && p.latin !== p.common && <span className="latin"> {p.latin}</span>}
              </button>
            </li>
          ))}
          {!known && (
            <li className="picker-new">
              <span>
                Add <strong>{name}</strong> as a new plant
              </span>
              <span className="picker-new-row">
                <select aria-label="What kind of plant?" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">What kind?</option>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k[0].toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </select>
                <button type="button" className="button" disabled={!kind} onClick={() => done({ id: addPlant(name, kind), common: name })}>
                  Add
                </button>
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
