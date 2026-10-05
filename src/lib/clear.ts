// "Clear N checked off", as in Mealboard's groceries: who checked off what decides
// whether to offer the button and whether to ask first. Pure, so it can be tested.
//
// The lists are shared, so the button appears only once you've checked something
// off yourself (it shouldn't appear because of a tap on the other phone), and it
// asks before clearing anything the other person checked off, since that changes
// what they see too. Clearing hides; nothing is deleted.

export interface ClearSummary {
  mine: number // checked off by you, or by nobody we can name
  others: number // checked off by the other person
  total: number
}

// Unknown names count as yours, so items checked before names were kept (and the
// moment before sign-in resolves) never hide the button from the person who did them.
export function clearSummary(checkedBy: (string | null)[], me: string | null): ClearSummary {
  let mine = 0
  let others = 0
  for (const by of checkedBy) {
    if (me !== null && by !== null && by !== me) others++
    else mine++
  }
  return { mine, others, total: mine + others }
}
