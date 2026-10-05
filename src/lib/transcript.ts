// Putting the speech recogniser's results together into one text. Pure, so it can
// be tested without a phone (scripts/transcript.test.ts).
//
// Chrome gives results in two shapes:
// - Desktop: separate pieces, each new ("next month pick up", " fir mulch at").
// - Android: a growing list where each result is the whole sentence so far
//   ("next", "next month", "next month pick", ...), all marked final, with no
//   leading spaces, sometimes correcting an earlier word ("fur" -> "fir").
// Adding them all up repeats the sentence over and over, so each new result
// either replaces the text (a longer or corrected version of it), is skipped (a
// repeat), or is added on (a new piece).

export interface SpeechPiece {
  transcript: string
  isFinal: boolean
}

const words = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

function leadingMatch(a: string[], b: string[]) {
  let k = 0
  while (k < a.length && k < b.length && a[k] === b[k]) k++
  return k
}

function endsWith(a: string[], b: string[]) {
  return b.length <= a.length && b.every((w, i) => a[a.length - b.length + i] === w)
}

// True when `next` is a longer version of `have`, or the same words with one
// corrected near the end.
function grows(have: string[], next: string[]) {
  const k = leadingMatch(have, next)
  return have.length === 0 || k === have.length || (k >= 2 && k * 2 >= have.length)
}

export function mergeTexts(pieces: string[]): string {
  // Earlier pieces, and the latest one, which may still be growing (Android
  // starts a new growing sentence after a pause).
  let before = ''
  let latest = ''
  for (const raw of pieces) {
    const piece = tidy(raw)
    if (!piece) continue
    const whole = tidy(`${before} ${latest}`)
    if (grows(words(whole), words(piece))) {
      before = ''
      latest = piece
    } else if (grows(words(latest), words(piece))) latest = piece
    else if (endsWith(words(whole), words(piece))) continue
    else {
      before = whole
      latest = piece
    }
  }
  return tidy(`${before} ${latest}`)
}

// What's settled, and the words still forming after it.
export function mergeResults(results: SpeechPiece[]): { settled: string; forming: string } {
  const settled = mergeTexts(results.filter((r) => r.isFinal).map((r) => r.transcript))
  const whole = mergeTexts(results.map((r) => r.transcript))
  const s = words(settled)
  const w = whole.split(' ').filter(Boolean)
  if (leadingMatch(s, words(whole)) === s.length) return { settled, forming: w.slice(s.length).join(' ') }
  return { settled, forming: mergeTexts(results.filter((r) => !r.isFinal).map((r) => r.transcript)) }
}
