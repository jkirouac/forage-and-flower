// node --test scripts/transcript.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeResults, mergeTexts } from '../src/lib/transcript.ts'

const final = (transcript: string) => ({ transcript, isFinal: true })
const forming = (transcript: string) => ({ transcript, isFinal: false })

test('Android: each result is the whole sentence so far, so the last one wins', () => {
  // The sequence from the first test on a phone (2026-10-05).
  const said = [
    'next', 'next', 'next', 'next month', 'next month pick', 'next month pick up', 'next month pick up',
    'next month pick up fur', 'next month pick up fur mulch', 'next month pick up fur mulch at',
    'next month pick up fur mulch at souksoil', 'next month pick up fur mulch at souksoil and',
    'next month pick up fur mulch at souksoil and the',
  ]
  assert.deepEqual(mergeResults(said.map(final)), {
    settled: 'next month pick up fur mulch at souksoil and the',
    forming: '',
  })
})

test('Android: a corrected word replaces the sentence instead of repeating it', () => {
  assert.equal(mergeTexts(['next month pick up fur mulch', 'next month pick up fir mulch at']), 'next month pick up fir mulch at')
})

test('Android: after a pause a new sentence grows on its own, added after the first', () => {
  assert.equal(
    mergeTexts(['next month pick up fir mulch', 'and', 'and the camas', 'and the camas by the path came up thin']),
    'next month pick up fir mulch and the camas by the path came up thin',
  )
})

test('Android: the sentence re-heard with a word changed in the middle replaces it', () => {
  // The second test on a phone (2026-10-05): it showed twice.
  const first = 'next month pick up fur mulch at soups oil and the canvas by the path came up'
  const again = 'next month pick up fur mulch at suksoil and the canvas by the path came up thin'
  assert.deepEqual(mergeResults([final(first), final(again)]), { settled: again, forming: '' })
  const half = mergeResults([final(first), forming(again)])
  assert.equal(`${half.settled} ${half.forming}`, again)
  assert.equal(half.settled, 'next month pick up fur mulch at')
})

test('Desktop: separate pieces join with single spaces', () => {
  assert.equal(mergeTexts(['next month pick up ', 'fir mulch at', ' sooke soil']), 'next month pick up fir mulch at sooke soil')
  assert.equal(mergeTexts(['the camas', 'the fig is fine']), 'the camas the fig is fine')
})

test('a repeated piece is said once', () => {
  assert.equal(mergeTexts(['pick up mulch', 'mulch']), 'pick up mulch')
})

test('only the words still forming show after the settled ones', () => {
  assert.deepEqual(mergeResults([final('next month pick up'), forming('next month pick up fir mul')]), {
    settled: 'next month pick up',
    forming: 'fir mul',
  })
  assert.deepEqual(mergeResults([final('next month pick up '), forming('fir mul')]), {
    settled: 'next month pick up',
    forming: 'fir mul',
  })
})
