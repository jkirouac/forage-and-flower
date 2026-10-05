// Speech to text with the phone's own recogniser (Chrome on Android). The words
// come back as you talk: settled ones, and the guess still forming. Claude never
// hears audio; it gets this text (garden-note function).

import { useCallback, useEffect, useRef, useState } from 'react'

// The Web Speech API isn't in TypeScript's DOM types yet; this is the part used.
interface Result {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<Result>
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type DictationState = 'idle' | 'listening' | 'stopped'
// 'denied': microphone permission refused; 'offline': no signal for the recogniser;
// 'failed': anything else.
export type DictationError = 'denied' | 'offline' | 'failed' | null

export function useDictation() {
  const supported = recognitionClass() !== null
  const [state, setState] = useState<DictationState>('idle')
  const [finalText, setFinalText] = useState('')
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState<DictationError>(null)
  const rec = useRef<Recognition | null>(null)
  // Settled words from earlier sessions: Chrome sometimes ends a session on a
  // pause, and listening carries on in a new one.
  const kept = useRef('')
  const wanted = useRef(false)

  // One recognition session; a new one follows a pause while still listening.
  const begin = useCallback(function session() {
    const Rec = recognitionClass()
    if (!Rec) return
    const r = new Rec()
    r.lang = 'en-CA'
    r.continuous = true
    r.interimResults = true
    let settled = ''
    let forming = ''
    // Events from a session that was cancelled or replaced are ignored.
    const current = () => rec.current === r
    r.onresult = (e) => {
      if (!current()) return
      settled = ''
      forming = ''
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) settled += res[0].transcript
        else forming += res[0].transcript
      }
      setFinalText(join(kept.current, settled))
      setInterimText(forming)
    }
    r.onerror = (e) => {
      if (!current()) return
      if (e.error === 'no-speech' || e.error === 'aborted') return
      wanted.current = false
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'network' ? 'offline' : 'failed')
    }
    // A session ends on a pause, or on Done. Words still forming count as heard.
    r.onend = () => {
      if (!current()) return
      kept.current = join(join(kept.current, settled), forming)
      setFinalText(kept.current)
      setInterimText('')
      if (wanted.current) session()
      else setState('stopped')
    }
    rec.current = r
    try {
      r.start()
    } catch {
      setError('failed')
    }
  }, [])

  const start = useCallback(() => {
    kept.current = ''
    wanted.current = true
    setFinalText('')
    setInterimText('')
    setError(null)
    setState('listening')
    begin()
  }, [begin])

  // Done: keep what was heard, including the guess still forming.
  const stop = useCallback(() => {
    wanted.current = false
    rec.current?.stop()
  }, [])

  const cancel = useCallback(() => {
    wanted.current = false
    const r = rec.current
    rec.current = null
    r?.abort()
    setState('idle')
  }, [])

  useEffect(() => cancel, [cancel])

  return { supported, state, finalText, interimText, error, start, stop, cancel }
}

const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ')
