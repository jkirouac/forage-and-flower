// Small line icons for plant pages: who a plant feeds, what it's like, and what
// kind of plant it is (shown when there's no photo). Drawn on a 24-unit grid in
// the text colour, so they follow light and dark.

const PATHS: Record<string, string> = {
  // Pollinators
  bee: 'M12 8c2.8 0 5 2.4 5 5.5S14.8 20 12 20s-5-3.4-5-6.5S9.2 8 12 8zM7.5 12h9M7.3 15.5h9.4M12 8c0-2 1-3.5 3-4M12 8c0-2-1-3.5-3-4M7 11c-2.5-1.5-4-.5-4 1s2 2 4 1M17 11c2.5-1.5 4-.5 4 1s-2 2-4 1',
  bumblebee: 'M12 7c3.3 0 6 2.7 6 6.5S15.3 21 12 21s-6-3.7-6-7.5S8.7 7 12 7zM6.2 12h11.6M6.2 16h11.6M12 7V4M8 9C5 6 2.5 7 3 9s3 2 5 1M16 9c3-3 5.5-2 5 0s-3 2-5 1',
  specialist: 'M12 9c2.5 0 4.5 2.2 4.5 5S14.5 19 12 19s-4.5-2.2-4.5-5S9.5 9 12 9zM8 13h8M8 16h8M12 9V6M17 4l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L14 6.3l2-.3z',
  butterfly: 'M12 6v13M12 9C9 4 4 4 4 8s3 5 8 4M12 9c3-5 8-5 8-1s-3 5-8 4M12 13c-3 0-6 1-6 4s3 3 6-1M12 13c3 0 6 1 6 4s-3 3-6-1M12 6l-2-3M12 6l2-3',
  hummingbird: 'M3 6l7 4M10 10c2-2 5-2 6 1l5 1-5 1c-1 3-4 5-8 4-2-.5-3 1-4 3 0-3 1-5 3-6 1-1 2-2 3-4zM15 11h.01M10 12c-2 1-4 0-6-2',
  caterpillar: 'M4 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 14a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 13a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 13a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M18 10.5L17 8M20 10.5l1-2.5M4 19h16',
  moth: 'M12 7v12M12 10C8 6 3 7 4 11s4 4 8 2M12 10c4-4 9-3 8 1s-4 4-8 2M12 7c-1-2-3-3-4-3M12 7c1-2 3-3 4-3',
  hoverfly: 'M12 9c2 0 3.5 2 3.5 5S14 20 12 20s-3.5-3-3.5-6S10 9 12 9zM9 13h6M9 16h6M12 9a2 2 0 1 0 0-4 2 2 0 1 0 0 4zM9.5 11L4 7l1 6M14.5 11L20 7l-1 6',
  bird: 'M4 15c2 3 6 4 9 3 4-1 6-4 7-8l2-1-2-1c-1-2-3-2-4-1-2 2-3 5-6 6-3 1-5 1-6 2zM16 8.5h.01M10 17l-1 4M13 17l1 4',
  // Traits
  native: 'M12 21V11M12 11l-5-2 1-3 3 1 1-4 1 4 3-1 1 3zM9 15l3 2 3-2',
  drought: 'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z',
  evergreen: 'M12 3l5 7h-3l4 6h-4l3 4H7l3-4H6l4-6H7zM12 20v2',
  edible: 'M12 7c-1-3 1-4 3-4 0 2-1 3-3 4zM12 8c-3-2-7 0-7 5s3 8 5 8c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-3 5-8s-4-7-7-5z',
  seeds: 'M7 14c0-3 2-5 5-5 0 3-2 5-5 5zM17 14c0-3-2-5-5-5 0 3 2 5 5 5zM12 9V5M5 20h14M8 17h.01M12 18h.01M16 17h.01',
  nitrogen: 'M5 20h14M12 20V9M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zM12 11c3 0 5-2 5-5-3 0-5 2-5 5zM9 20c0-2 1-3 3-3s3 1 3 3',
  shade: 'M9 15h9a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.6-1A3.5 3.5 0 0 0 9 15zM5 9a3 3 0 0 1 4-3M4 13h2M3 18h18',
  wet: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11zM9.5 15a2.5 2.5 0 0 0 2.5 2.5',
  nest: 'M9 3v18M15 3v18M9 8h6M9 14h6M12 10.5h.01M12 17h.01',
  seedheads: 'M12 21V9M12 9a3 3 0 1 0 0-6 3 3 0 1 0 0 6M8 13l4-2 4 2M7 6l-2-2M17 6l2-2M12 3V1',
  size: 'M4 20L20 4M4 20h5M4 20v-5M20 4h-5M20 4v5M9 15l1 1M12 12l1 1M15 9l1 1',
  // Kinds of plant, for a page with no photo
  flower: 'M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM12 9V4a3 3 0 0 1 0 5M15 12h5a3 3 0 0 1-5 0M12 15v5a3 3 0 0 1 0-5M9 12H4a3 3 0 0 1 5 0M12 15v6',
  tree: 'M12 22v-7M12 15c-4 0-7-2.5-7-6a7 7 0 0 1 14 0c0 3.5-3 6-7 6zM9 12l3 3 3-3',
  fern: 'M6 21c2-6 6-12 13-17M9 16l-4-1M10.5 13.5L7 11M12.5 11L10 7.5M14.5 8.5L13 5M10 18l2 3M12 15.5l3 1.5M14 13l3 .5M16 10l3-.5',
  bulb: 'M12 10c3 0 5 2.5 5 5.5S14.5 21 12 21s-5-2.5-5-5.5S9 10 12 10zM12 10c0-3 1-5 3-7M12 10c0-2-1-4-3-5M9 21l-1 1M15 21l1 1',
  seedling: 'M12 21v-8M12 13c0-4-3-6-7-6 0 4 3 6 7 6zM12 11c0-4 3-6 7-6 0 4-3 6-7 6zM6 21h12',
  leaf: 'M5 19C5 10 11 4 20 4c0 9-6 15-15 15zM5 19l9-9',
}

const KIND_ICON: Record<string, string> = {
  'perennial flower': 'flower',
  ornamental: 'flower',
  'tree or shrub': 'tree',
  fern: 'fern',
  bulb: 'bulb',
  'annual from seed': 'seedling',
  edible: 'leaf',
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const d = PATHS[name] ?? PATHS.leaf
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function KindIcon({ kind, size }: { kind: string; size?: number }) {
  return <Icon name={KIND_ICON[kind] ?? 'leaf'} size={size} />
}
