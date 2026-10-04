// Line icons for the tab bar, drawn on a 24px grid in the current text colour.

export type NavKind = 'month' | 'seasons' | 'plants' | 'pollinators'

export function NavIcon({ kind }: { kind: NavKind }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (kind) {
    case 'month':
      // A checklist page.
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="2" />
          <path d="M8 9l1.5 1.5L12 8M8 15l1.5 1.5L12 14M14.5 9.5H17M14.5 15.5H17" />
        </svg>
      )
    case 'seasons':
      // Half the year in leaf, half bare: fall and spring.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v16" />
          <path d="M12 9c2.5-.5 4 .5 4.5 2.5-2.5.5-4-.5-4.5-2.5zM12 14c2-.3 3.2.6 3.6 2.2-2 .3-3.2-.6-3.6-2.2z" />
        </svg>
      )
    case 'plants':
      // A sprout.
      return (
        <svg {...common}>
          <path d="M12 20v-9" />
          <path d="M12 13c-4 0-6-2.5-6-6 4 0 6 2.5 6 6zM12 11c0-3.5 2-5.5 6-5.5 0 3.5-2 5.5-6 5.5z" />
          <path d="M7.5 20h9" />
        </svg>
      )
    case 'pollinators':
      // A bumblebee.
      return (
        <svg {...common}>
          <ellipse cx="12" cy="14" rx="4.5" ry="5.5" />
          <path d="M7.8 12.5h8.4M7.8 15.8h8.4" />
          <path d="M10 8.8C8 6 5.5 5.8 4.5 7.5s1.5 3.5 4 3.3M14 8.8c2-2.8 4.5-3 5.5-1.3s-1.5 3.5-4 3.3" />
        </svg>
      )
  }
}
