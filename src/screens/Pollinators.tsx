import { useState, type KeyboardEvent } from 'react'
import { useCatalogue } from '../lib/catalogue'
import { useSeasons } from '../lib/seasons'
import {
  bloomByMonth,
  criticalLabels,
  gaps,
  isCritical,
  monthPlants,
  noBloomMonths,
  ourPlants,
  rankPicks,
  withMarks,
  type BloomMark,
} from '../lib/pollinators'
import PlantPicker from './PlantPicker'
import { statusLine, type PlanItem } from '../lib/plan'
import type { FullPlant } from '../lib/plants'
import { MONTHS } from '../lib/season'

type Scope = 'ours' | 'all'

// Pollinator plants: the year ring (what flowers each month against when
// pollinators most need food), a panel for the month you tap, a plain month-by-month
// list beneath it, then the ranking from the garden notes with each plant's reason.
// "Our garden" counts every plant of ours that flowers, in the ground and planned
// apart; "All pollinator plants" is the ranking.
export default function Pollinators({ userId, month: chosen }: { userId: string; month: number | null }) {
  const { data, error, reload, markBloom, unmarkBloom, addPlant } = useCatalogue(userId)
  const seasons = useSeasons(userId)
  const [scope, setScope] = useState<Scope>('ours')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [today] = useState(() => new Date())
  const now = today.getMonth() + 1
  const year = today.getFullYear()
  const month = chosen ?? now

  const items = seasons.data?.items ?? []
  // Flowering months widened by what's been seen in flower here.
  const marks = data?.bloomMarks ?? []
  const plants = withMarks(data?.plants ?? [], marks)
  const ours = ourPlants(plants, items, data?.plantings ?? [], seasons.data?.sites ?? [], marks)
  const ranked = data ? rankPicks(plants) : []
  const haveIds = new Set([...ours.inGround, ...ours.planned].map((p) => p.id))

  // The ring: in the ground and planned per month for our garden; the ranking for all.
  const ground = bloomByMonth(scope === 'ours' ? ours.inGround : ranked)
  const planned = scope === 'ours' ? bloomByMonth(ours.planned) : bloomByMonth([])
  const missing = gaps(scope === 'ours' ? [...ours.inGround, ...ours.planned] : ranked)
  const listed = onlyMissing ? ranked.filter((p) => !haveIds.has(p.id)) : ranked
  const choose = (m: number) => {
    location.hash = `pollinators/month/${m}`
  }

  return (
    <>
      <header className="page-head">
        <p className="kicker">For the months pollinators need food most</p>
        <h1>Pollinator plants</h1>
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
                  {s === 'ours' ? 'Our garden' : 'All pollinator plants'}
                </button>
              ))}
            </div>
            <YearRing ground={ground} planned={planned} scope={scope} current={now} selected={month} onChoose={choose} />
            <p className="ring-key">
              <span className="key-item">
                <span className="key-swatch pollen" /> When pollinators most need food
              </span>
              <span className="key-item">
                <span className="key-swatch bloom" /> {scope === 'ours' ? 'In flower: ours' : 'In flower'}
              </span>
              {scope === 'ours' && (
                <span className="key-item">
                  <span className="key-swatch planned" /> In flower: planned
                </span>
              )}
            </p>
            <p className="sync-note">
              {missing.length === 0
                ? 'Something is in flower in every critical month.'
                : `Nothing ${scope === 'ours' ? 'of ours ' : ''}flowers in ${listWords(missing.map((m) => MONTHS[m - 1]))}, when pollinators need it.`}
            </p>
          </section>

          <MonthPanel
            month={month}
            ours={ours}
            ranked={ranked}
            items={items}
            marks={marks}
            members={data.members}
            canMark={month === now}
            plants={plants}
            onMark={(id) => markBloom(id, year, now)}
            onUnmark={unmarkBloom}
            addPlant={addPlant}
            year={year}
          />

          <section className="block">
            <h2 className="label">Month by month</h2>
            <ul className="month-list">
              {MONTHS.map((name, i) => {
                const m = i + 1
                const why = criticalLabels(m)
                const g = ground[i].length
                const p = planned[i].length
                const count =
                  scope === 'ours'
                    ? g || p
                      ? [g ? `${g} in flower` : null, p ? `${p} planned` : null].filter(Boolean).join(' · ')
                      : isCritical(m)
                        ? 'Nothing in flower: a gap'
                        : 'Nothing in flower'
                    : g
                      ? `${g} in flower`
                      : 'Nothing in flower'
                return (
                  <li key={m} data-critical={isCritical(m) || undefined} aria-current={m === now ? 'date' : undefined}>
                    <button type="button" className="month-pick" aria-pressed={m === month} onClick={() => choose(m)}>
                      <span className="month-name">{name}</span>
                      <span className="month-count">{count}</span>
                      {why.length > 0 && <span className="critical-note">{why.join('; ')}</span>}
                    </button>
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
            <p className="group-sub">Ranked for threatened bees, butterflies and hummingbirds, from our plant notes.</p>
            <ol className="pick-list">
              {listed.map((p) => (
                <Pick key={p.id} plant={p} ours={haveIds.has(p.id)} />
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  )
}

// The month you tapped: what of ours is in flower, what's planned that flowers
// then, and, in a critical month or a gap, ranked plants that would help. In the
// current month, anything else seen in flower can be marked; a mark shows who
// made it and can be taken back.
function MonthPanel({
  month,
  ours,
  ranked,
  items,
  marks,
  members,
  canMark,
  plants,
  onMark,
  onUnmark,
  addPlant,
  year,
}: {
  month: number
  ours: { inGround: FullPlant[]; planned: FullPlant[] }
  ranked: FullPlant[]
  items: PlanItem[]
  marks: BloomMark[]
  members: Record<string, string>
  canMark: boolean
  plants: FullPlant[]
  onMark: (plantId: string) => void
  onUnmark: (markId: string) => void
  addPlant: (common: string, kind: string) => string
  year: number
}) {
  const { inFlower, planned, couldAdd } = monthPlants(month, ours, ranked)
  const critical = isCritical(month)
  const why = criticalLabels(month)
  const gap = inFlower.length + planned.length === 0
  const suggest = couldAdd.slice(0, 5)
  const unknown = noBloomMonths(ours)
  const plan = (p: FullPlant) => {
    const i = items.find((x) => x.plant_id === p.id && (x.status === 'to buy' || x.status === 'bought'))
    return i ? statusLine(i.status, i.season) : null
  }
  // This month's mark for a plant, this year first.
  const markFor = (plantId: string) =>
    marks.find((m) => m.plant_id === plantId && m.month === month && m.year === year) ??
    marks.find((m) => m.plant_id === plantId && m.month === month)

  return (
    <section className="site-panel month-panel" data-critical={critical || undefined} aria-live="polite">
      <div>
        <h2>{MONTHS[month - 1]}</h2>
        {why.length > 0 && <p className="group-sub">{why.join('; ')}</p>}
      </div>
      {gap && (
        <p>
          Nothing of ours flowers in {MONTHS[month - 1]}
          {critical ? ', when pollinators need it.' : '.'}
        </p>
      )}
      {inFlower.length > 0 && (
        <div>
          <p className="label">In flower now</p>
          <ul className="grow-chips">
            {inFlower.map((p) => {
              const mark = markFor(p.id)
              const mine = mark && canMark && mark.year === year
              return (
                <li key={p.id} className="grow-chip" data-known>
                  <a href={`#plant/${encodeURIComponent(p.id)}`}>{p.common}</a>
                  {mark && (
                    <span className="mark-by" title="Seen in flower here">
                      {members[mark.marked_by ?? ''] ?? '?'}
                    </span>
                  )}
                  {mine && (
                    <button type="button" className="grow-remove" aria-label={`Not in flower: ${p.common}`} onClick={() => onUnmark(mark.id)}>
                      ✕
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {planned.length > 0 && (
        <div>
          <p className="label">Planned</p>
          <ul className="month-plants">
            {planned.map((p) => (
              <li key={p.id}>
                <a href={`#plant/${encodeURIComponent(p.id)}`} className="plant-name">
                  {p.common}
                </a>
                {plan(p) && <span className="task-detail"> · {plan(p)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {canMark && (
        <PlantPicker
          label="Something else in flower?"
          plants={plants}
          exclude={new Set(inFlower.map((p) => p.id))}
          addPlant={addPlant}
          onPick={(p) => onMark(p.id)}
        />
      )}
      {(critical || gap) && suggest.length > 0 && <PlantLine label="Could add" plants={suggest} empty="" />}
      {unknown.length > 0 && (
        <p className="task-detail">
          {unknown.length === 1 ? '1 of our plants has' : `${unknown.length} of our plants have`} no flowering months in our notes yet, so{' '}
          {unknown.length === 1 ? "it isn't" : "they aren't"} counted here: {listWords(unknown.slice(0, 4).map((p) => p.common))}
          {unknown.length > 4 ? ' and more' : ''}. If one is in flower, mark it above.
        </p>
      )}
    </section>
  )
}

function PlantLine({ label, plants, empty }: { label: string; plants: FullPlant[]; empty: string }) {
  if (plants.length === 0 && !empty) return null
  return (
    <div>
      <p className="label">{label}</p>
      {plants.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <p>
          {plants.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <a href={`#plant/${encodeURIComponent(p.id)}`} className="plant-name">
                {p.common}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
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
// critical months; inside, each month's petal grows with what's in flower: solid
// for ours in the ground, lighter and dashed on top for planned. Each month is a
// button; the chosen one is outlined. The list below says the same in words.
function YearRing({
  ground,
  planned,
  scope,
  current,
  selected,
  onChoose,
}: {
  ground: FullPlant[][]
  planned: FullPlant[][]
  scope: Scope
  current: number
  selected: number
  onChoose: (m: number) => void
}) {
  const size = 280
  const c = size / 2
  const most = Math.max(1, ...ground.map((g, i) => g.length + planned[i].length))
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
  const onKey = (m: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChoose(m)
    }
  }
  const g = ground[selected - 1].length
  const p = planned[selected - 1].length
  // Two short lines fit the middle of the ring; one long one runs into the petals.
  const sub = scope === 'ours' ? [`${g} in flower`, p ? `${p} planned` : null] : [`${g} in flower`, null]

  return (
    <svg className="year-ring" viewBox={`0 0 ${size} ${size}`} role="group" aria-label="Year ring: tap a month">
      {ground.map((plants, i) => {
        const m = i + 1
        const rg = 44 + (plants.length / most) * 52
        const rp = rg + (planned[i].length / most) * 52
        const describe = [
          MONTHS[i],
          isCritical(m) ? 'critical month' : null,
          scope === 'ours' ? `${plants.length} in flower now` : `${plants.length} in flower`,
          scope === 'ours' && planned[i].length ? `${planned[i].length} planned` : null,
        ]
          .filter(Boolean)
          .join(', ')
        return (
          <g
            key={i}
            className="ring-month"
            role="button"
            tabIndex={0}
            aria-pressed={m === selected}
            aria-label={describe}
            onClick={() => onChoose(m)}
            onKeyDown={onKey(m)}
          >
            <path d={arc(40, 118, i, 0)} className="ring-hit" />
            <path d={arc(100, 112, i)} className={isCritical(m) ? 'ring-critical' : 'ring-quiet'} />
            <path d={arc(44, 96, i)} className="ring-track" />
            {plants.length > 0 && <path d={arc(44, rg, i)} className="ring-bloom" />}
            {planned[i].length > 0 && <path d={arc(rg, rp, i)} className="ring-planned" />}
            {m === selected && <path d={arc(42, 114, i, 0.01)} className="ring-now" />}
            <text {...label(i)} className={`ring-label${m === current ? ' now' : ''}${m === selected ? ' chosen' : ''}`} textAnchor="middle" dominantBaseline="central">
              {MONTHS[i][0]}
            </text>
          </g>
        )
      })}
      <text x={c} y={sub[1] ? c - 10 : c - 4} textAnchor="middle" className="ring-center">
        {MONTHS[selected - 1]}
      </text>
      <text x={c} y={sub[1] ? c + 8 : c + 14} textAnchor="middle" className="ring-center-sub">
        {sub[0]}
      </text>
      {sub[1] && (
        <text x={c} y={c + 22} textAnchor="middle" className="ring-center-sub">
          {sub[1]}
        </text>
      )}
    </svg>
  )
}
