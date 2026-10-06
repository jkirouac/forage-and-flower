import { useId, type CSSProperties, type KeyboardEvent } from 'react'
import { siteLabel, type YardMap as Map, type YardSite } from '../lib/yard'

// The front yard drawn to scale (feet), street at the bottom, like the designer's
// plan: the house hatched, driveways and walks flat, trees as circles with a cross,
// the swale in water blue, and each site in its own colour with its number. Tap a
// site (or its chip below) to choose it; tap it again to show everything.
export default function YardMap({
  map,
  sites,
  counts,
  selected,
  onSelect,
}: {
  map: Map
  sites: YardSite[]
  counts: Record<number, number>
  selected: number | null
  onSelect: (n: number | null) => void
}) {
  const id = useId().replace(/:/g, '')
  const { width: W, height: H } = map
  // The house's first corner, for its caption.
  const houseX = Number(map.house.match(/-?[\d.]+/)?.[0] ?? 0)
  const byNumber = new globalThis.Map(sites.map((s) => [s.number, s]))
  const shown = Object.entries(map.sites)
    .map(([n, s]) => ({ n: Number(n), ...s, site: byNumber.get(Number(n)) }))
    .filter((s) => s.site)
  const choose = (n: number) => onSelect(selected === n ? null : n)
  const onKey = (n: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(n)
    }
  }
  const colour = (n: number) => ({ '--c': `var(--site-${n}, var(--lichen))` }) as CSSProperties
  const state = (n: number) => (selected === null ? undefined : selected === n ? 'on' : 'off')

  return (
    <figure className="yard">
      <svg viewBox={`-1.5 -1.5 ${W + 3} ${H + 5.5}`} className="yard-map" role="group" aria-label="Map of the front yard">
        <defs>
          <clipPath id={`lot-${id}`}>
            <path d={map.lot} />
          </clipPath>
          <pattern id={`hatch-${id}`} width="0.9" height="0.9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.9" className="yard-hatch" />
          </pattern>
        </defs>

        <rect x={-1.5} y={H} width={W + 3} height={5.5} className="yard-street" />
        <line x1={-1.5} y1={H} x2={W + 1.5} y2={H} className="yard-curb" />
        <text x={W / 2} y={H + 3.2} className="yard-caption" textAnchor="middle">
          STREET
        </text>
        <path d={map.lot} className="yard-lot" />
        {map.hardscape.map((h, i) => (
          <path key={i} d={h.d} className={h.kind === 'neighbour-driveway' ? 'yard-neighbour' : 'yard-hard'} style={h.kind === 'neighbour-driveway' ? { fill: `url(#hatch-${id})` } : undefined} />
        ))}

        {shown.map((s) => (
          <path
            key={s.n}
            d={s.d}
            className="yard-site"
            data-state={state(s.n)}
            style={colour(s.n)}
            role="button"
            tabIndex={0}
            aria-pressed={selected === s.n}
            aria-label={siteLabel(s.site!, counts[s.n] ?? 0)}
            onClick={() => choose(s.n)}
            onKeyDown={onKey(s.n)}
          />
        ))}
        {(map.beds ?? []).map((b, i) => (
          <path key={i} d={b.d} className="yard-bed" data-state={state(b.site)} style={colour(b.site)} />
        ))}
        {(map.water ?? []).map((w, i) => (
          <path key={i} d={w.d} className="yard-water" data-dim={selected !== null || undefined} />
        ))}

        <path d={map.house} className="yard-house" style={{ fill: `url(#hatch-${id})` }} />
        {map.roof.map((d, i) => (
          <path key={i} d={d} className="yard-roof" />
        ))}
        <text x={houseX + 1.5} y={5} className="yard-caption">
          HOUSE
        </text>
        {map.fence && <path d={map.fence} className="yard-fence" />}

        <g clipPath={`url(#lot-${id})`} className="yard-trees">
          {map.trees.map((t, i) => (
            <g key={i}>
              <circle cx={t.at[0]} cy={t.at[1]} r={t.r} />
              <path d={`M${t.at[0] - 0.45},${t.at[1]} h0.9 M${t.at[0]},${t.at[1] - 0.45} v0.9`} />
            </g>
          ))}
        </g>
        {map.trees
          .filter((t) => t.name)
          .map((t, i) => (
            <text
              key={i}
              x={t.side === 'right' ? t.at[0] + t.r + 0.4 : t.at[0]}
              y={t.side === 'right' ? t.at[1] + 0.45 : t.at[1] + 1.9}
              textAnchor={t.side === 'right' ? 'start' : 'middle'}
              className="yard-tree-name"
            >
              {t.label ?? t.name}
            </text>
          ))}
        {map.drain && <rect x={map.drain[0] - 0.5} y={map.drain[1] - 0.5} width={1} height={1} className="yard-drain" />}

        {shown.map((s) => (
          <g key={s.n} className="yard-number" data-state={state(s.n)} aria-hidden="true">
            <circle cx={s.label[0]} cy={s.label[1]} r={s.n > 9 ? 1.35 : 1.15} />
            <text x={s.label[0]} y={s.label[1] + 0.5} textAnchor="middle">
              {s.n}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="site-chips" role="group" aria-label="Choose a site">
        {sites.map((s) => (
          <button key={s.id} type="button" className="filter-chip" aria-pressed={selected === s.number} onClick={() => choose(s.number)}>
            {s.number} {s.name}
          </button>
        ))}
      </figcaption>
    </figure>
  )
}
