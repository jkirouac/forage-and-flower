// The kicker and title at the top of This month. Victoria, zone 9a:
// frost-free roughly Mar 6 to Nov 16, mild wet winters, dry summers.

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const THEMES = [
  'Pruning and planning',
  'First seeds indoors',
  'Spring planting begins',
  'Sow and plant out',
  'Tender plants go out',
  'Summer care',
  'Harvest and summer pruning',
  'Late sowings',
  'Getting ready for fall',
  'Fall planting window',
  'Bare-root season begins',
  'Rest and plan',
] as const

export function monthHeading(date = new Date()) {
  const m = date.getMonth()
  return { month: MONTHS[m], theme: THEMES[m] }
}

// "2026-10-05" -> "5 Oct" (or "Oct 5", by the phone's language).
export function shortDate(day: string) {
  return new Date(day + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
