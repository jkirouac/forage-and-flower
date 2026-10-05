import { useState } from 'react'
import { useCatalogue } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import { bloomByMonth, criticalLabels, gaps, isCritical, rankPicks } from '../lib/pollinators'
import type { FullPlant } from '../lib/plants'
import { MONTHS } from '../lib/season'

type Scope = 'ours' | 'all'

// Pollinator picks: the year ring (what flowers each month against when pollinators
// most need food), a plain month-by-month list beneath it, then the ranking from
// the garden notes with each plant's reason.
export default function Pollinators({ userId }: { userId: string }) {
  const { data, error, reload } = useCatalogue(userId)
  const seasons = useSeasons(userId)
  const [scope, setScope] = useState<Scope>('ours')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [now] = useState(() => new Date().getMonth() + 1)

  const ours = new Set([
    ...(seasons.data?.items ?? []).filter((i) => i.status !== 'skipped').map((i) => i.plant_id),
    ...(data?.plantings ?? []).filter((p) => p.action !== 'died').map((p) => p.plant_id),
  ])
  const picks = data ? rankPicks(data.plants) : []
  const ringPlants = scope === 'ours' ? picks.filter((p) => ours.has(p.id)) : picks
  const bloom = bloomByMonth(ringPlants)
  const missing = gaps(ringPlants)
  const listed = onlyMissing ? picks.filter((p) => !ours.has(p.id)) : picks

  return (
    <>
      <header className="page-head">
        <p className="kicker">Threatened species first</p>
        <h1>Pollinator picks</h1>
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
          <section className="block">
            <div className="choices" role="radiogroup" aria-label="Which plants">
              {(['ours', 'all'] as Scope[]).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={scope === s} className="choice" onClick={() => setScope(s)}>
                  {s === 'ours' ? 'Our garden' : 'All picks'}
                </button>
              ))}
            </div>
            <YearRing bloom={bloom} current={now} />
            <p className="ring-key">
              <span className="key-swatch pollen" /> When pollinators most need food <span className="key-swatch bloom" /> Picks in flower
            </p>
            <p className="sync-note">
              {missing.length === 0
                ? 'Something is in flower in every critical month.'
                : `Nothing ${scope === 'ours' ? 'of ours ' : ''}flowers in ${listWords(missing.map((m) => MONTHS[m - 1]))}, when pollinators need it.`}
            </p>
          </section>

          <section className="block">
            <h2 className="label">Month by month</h2>
            <ul className="month-list">
              {bloom.map((plants, i) => {
                const m = i + 1
                const why = criticalLabels(m)
                return (
                  <li key={m} data-critical={isCritical(m) || undefined} aria-current={m === now ? 'date' : undefined}>
                    <p className="month-name">
                      {MONTHS[i]}
                      {why.length > 0 && <span className="critical-note"> · {why.join('; ')}</span>}
                    </p>
                    <p className="task-detail">
                      {plants.length ? plants.map((p) => p.common).join(', ') : isCritical(m) ? 'Nothing in flower: a gap.' : 'Nothing in flower.'}
                    </p>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="block">
            <div className="head-row">
              <h2 className="label">The ranking</h2>
              <button type="button" className="text-button" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(!onlyMissing)}>
                {onlyMissing ? 'Show all' : 'Only ones we don’t have'}
              </button>
            </div>
            <ol className="pick-list">
              {listed.map((p) => (
                <Pick key={p.id} plant={p} ours={ours.has(p.id)} />
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  )
}

function Pick({ plant, ours }: { plant: FullPlant; ours: boolean }) {
  return (
    <li>
      <a className="plant-link pick" href={`#plant/${encodeURIComponent(plant.id)}`}>
        <span className="pick-rank" aria-label={plant.rank ? `Rank ${plant.rank}` : 'Unranked'}>
          {plant.rank ?? '–'}
        </span>
        <span className="pick-body">
          <span className="plan-name">{plant.common}</span>
          {plant.latin && plant.latin !== plant.common && <span className="latin plan-latin">{plant.latin}</span>}
          {plant.threat_reason && (
            <span className="pick-reason">
              <span className="threat-tier">Threat tier: {plant.threat_tier}</span>{' '}
              {plant.threat_reason}
            </span>
          )}
          <span className="plan-meta">
            {[ours ? 'In our garden' : null, plant.native ? 'BC native' : null, plant.bloom_months.length ? `Flowers ${monthSpan(plant.bloom_months)}` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </a>
    </li>
  )
}

// ["January", "December"] -> "January and December".
function listWords(words: string[]) {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

// [12, 1, 2, 3] -> "Dec–Mar"; [6] -> "Jun".
function monthSpan(months: number[]) {
  const short = (m: number) => MONTHS[m - 1].slice(0, 3)
  const set = new Set(months)
  // Start where the previous month isn't flowering, so a span over New Year reads right.
  const start = months.find((m) => !set.has(m === 1 ? 12 : m - 1)) ?? months[0]
  const end = months.find((m) => !set.has(m === 12 ? 1 : m + 1)) ?? months[months.length - 1]
  return start === end ? short(start) : `${short(start)}–${short(end)}`
}

// The year as a ring: January at the top, clockwise. The outer band marks the
// critical months; inside, each month's petal grows with the number of picks in
// flower. The plain list below says the same in words.
function YearRing({ bloom, current }: { bloom: FullPlant[][]; current: number }) {
  const size = 280
  const c = size / 2
  const most = Math.max(1, ...bloom.map((b) => b.length))
  const arc = (r1: number, r2: number, i: number, pad = 0.03) => {
    const a1 = (i / 12) * 2 * Math.PI - Math.PI / 2 + pad
    const a2 = ((i + 1) / 12) * 2 * Math.PI - Math.PI / 2 - pad
    const p = (r: number, a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`
    return `M ${p(r1, a1)} L ${p(r2, a1)} A ${r2} ${r2} 0 0 1 ${p(r2, a2)} L ${p(r1, a2)} A ${r1} ${r1} 0 0 0 ${p(r1, a1)} Z`
  }
  const label = (i: number) => {
    const a = ((i + 0.5) / 12) * 2 * Math.PI - Math.PI / 2
    return { x: c + 128 * Math.cos(a), y: c + 128 * Math.sin(a) }
  }
  const inFlower = bloom[current - 1].length

  return (
    <svg className="year-ring" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Year ring. The same information is in the month-by-month list below.">
      {bloom.map((plants, i) => {
        const r = 44 + (plants.length / most) * 52
        return (
          <g key={i}>
            <path d={arc(100, 112, i)} className={isCritical(i + 1) ? 'ring-critical' : 'ring-quiet'} />
            <path d={arc(44, 96, i)} className="ring-track" />
            {plants.length > 0 && <path d={arc(44, r, i)} className="ring-bloom" />}
            {i + 1 === current && <path d={arc(42, 114, i, 0.01)} className="ring-now" />}
            <text {...label(i)} className={`ring-label${i + 1 === current ? ' now' : ''}`} textAnchor="middle" dominantBaseline="central">
              {MONTHS[i][0]}
            </text>
          </g>
        )
      })}
      <text x={c} y={c - 8} textAnchor="middle" className="ring-center">
        {MONTHS[current - 1]}
      </text>
      <text x={c} y={c + 12} textAnchor="middle" className="ring-center-sub">
        {inFlower} in flower
      </text>
    </svg>
  )
}
