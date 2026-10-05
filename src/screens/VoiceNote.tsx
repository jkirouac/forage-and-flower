import { useEffect, useRef, useState } from 'react'
import { useDictation } from '../lib/speech'
import { MAX_SPOKEN, rawNote, type DraftItem, type ItemKind, type MonthRef } from '../lib/notes'
import { upcomingMonths, type Section } from '../lib/month'
import { linkPlantNames, type FullPlant } from '../lib/plants'
import { MONTHS } from '../lib/season'
import { supabase } from '../lib/supabase'

type Stage = 'listening' | 'typing' | 'tidying' | 'review' | 'failed'

const SECTION_LABELS: Record<Section, string> = { do: 'Do', plant: 'Plant', buy: 'Buy' }
const TIDY_TIMEOUT = 20_000

// Speak a note: the words appear as you talk, Claude tidies them and sorts them
// into one-off tasks and notes, and you check them before they're saved. With no
// signal, or no Claude, what you said can still be kept as a note.
export default function VoiceNote({
  today,
  plants,
  onSave,
  onClose,
}: {
  today: MonthRef
  plants: FullPlant[]
  onSave: (items: DraftItem[], spoken: string) => void
  onClose: () => void
}) {
  const dictation = useDictation()
  const [stage, setStage] = useState<Stage>(dictation.supported ? 'listening' : 'typing')
  const [typed, setTyped] = useState('')
  const [spoken, setSpoken] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [failure, setFailure] = useState('')
  const sheet = useRef<HTMLDivElement>(null)
  const { supported, start, cancel } = dictation

  // Listening starts as the sheet opens; the tap on the mic was the go-ahead.
  useEffect(() => {
    if (!supported) return
    start()
    return cancel
  }, [supported, start, cancel])

  // Done (or Chrome's own end of speech): tidy what was heard.
  useEffect(() => {
    if (stage === 'listening' && dictation.state === 'stopped') {
      if (dictation.finalText.trim()) void tidy(dictation.finalText)
      else setStage('typing')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictation.state])

  useEffect(() => {
    if (dictation.error && stage === 'listening') setStage('typing')
  }, [dictation.error, stage])

  useEffect(() => {
    sheet.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    dictation.cancel()
    onClose()
  }

  async function tidy(text: string) {
    const said = text.trim().slice(0, MAX_SPOKEN)
    setSpoken(said)
    setStage('tidying')
    try {
      const reply = await Promise.race([
        supabase.functions.invoke<{ items: DraftItem[] }>('garden-note', { body: { transcript: said } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIDY_TIMEOUT)),
      ])
      if (reply.error || !reply.data?.items?.length) throw reply.error ?? new Error('empty')
      setItems(reply.data.items)
      setStage('review')
    } catch {
      setFailure(navigator.onLine ? "Couldn't tidy this note right now." : "Couldn't tidy this without signal.")
      setStage('failed')
    }
  }

  const edit = (i: number, patch: Partial<DraftItem>) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const usable = items.filter((i) => i.text.trim())
  const months = upcomingMonths(today.year, today.month, 12)
  const saveLabel =
    usable.length > 1 ? `Save ${usable.length} ${usable.every((i) => i.kind === 'note') ? 'notes' : 'items'}` : `Save to ${MONTHS[(usable[0]?.month ?? today.month) - 1]}`

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="voice-title" ref={sheet} tabIndex={-1}>
        <h2 id="voice-title" className="sheet-title">
          {stage === 'review' ? 'Check your note' : stage === 'typing' ? 'Write a note' : 'Speak a note'}
        </h2>

        {stage === 'listening' && (
          <>
            <p className="dictation" aria-live="polite">
              {dictation.finalText || dictation.interimText ? (
                <>
                  {dictation.finalText}{' '}
                  <span className="dictation-forming">{dictation.interimText}</span>
                </>
              ) : (
                <span className="dictation-forming">Listening…</span>
              )}
            </p>
            <div className="sheet-actions">
              <button type="button" className="listen-stop" onClick={dictation.stop}>
                <span className="listen-ring" aria-hidden="true" />
                Done
              </button>
              <button type="button" className="choice" onClick={close}>
                Cancel
              </button>
            </div>
          </>
        )}

        {stage === 'typing' && (
          <>
            {dictation.error === 'denied' && (
              <p className="notice notice-error">The microphone is off for this app. Turn it on in Chrome's site settings, or write the note here.</p>
            )}
            {dictation.error === 'offline' && <p className="notice notice-error">Speaking a note needs signal. Write it here instead.</p>}
            {dictation.error === 'failed' && <p className="notice notice-error">The microphone stopped. Write the note here instead.</p>}
            <label className="field">
              Your note
              <textarea
                className="note-field"
                rows={4}
                value={typed}
                maxLength={MAX_SPOKEN}
                autoFocus
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Pick up fir mulch next month"
              />
            </label>
            <div className="sheet-actions">
              <button type="button" className="button" disabled={!typed.trim()} onClick={() => void tidy(typed)}>
                Tidy it
              </button>
              {dictation.supported && !dictation.error && (
                <button type="button" className="choice" onClick={() => (setStage('listening'), dictation.start())}>
                  Speak instead
                </button>
              )}
              <button type="button" className="choice" onClick={close}>
                Cancel
              </button>
            </div>
          </>
        )}

        {stage === 'tidying' && (
          <>
            <p className="dictation" data-dim>
              {spoken}
            </p>
            <p className="sync-note" role="status">
              Tidying your note…
            </p>
          </>
        )}

        {stage === 'failed' && (
          <>
            <p className="dictation" data-dim>
              {spoken}
            </p>
            <p className="notice notice-error">
              {failure} Save what you said as a note in {MONTHS[today.month - 1]}?
            </p>
            <div className="sheet-actions">
              <button type="button" className="button" onClick={() => onSave([rawNote(spoken, today)], spoken)}>
                Save as a note
              </button>
              <button type="button" className="choice" onClick={() => void tidy(spoken)}>
                Try again
              </button>
              <button type="button" className="choice" onClick={close}>
                Discard
              </button>
            </div>
          </>
        )}

        {stage === 'review' && (
          <>
            <ul className="drafts">
              {items.map((item, i) => (
                <Draft key={i} item={item} months={months} plants={plants} onChange={(patch) => edit(i, patch)} />
              ))}
            </ul>
            <details className="spoken">
              <summary>What you said</summary>
              <p>{spoken}</p>
            </details>
            <div className="sheet-actions">
              <button type="button" className="button" disabled={usable.length === 0} onClick={() => onSave(usable, spoken)}>
                {saveLabel}
              </button>
              <button type="button" className="choice" onClick={close}>
                Discard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// One item to check: a task card or a note, its month, and any garden rule it clashes with.
function Draft({
  item,
  months,
  plants,
  onChange,
}: {
  item: DraftItem
  months: MonthRef[]
  plants: FullPlant[]
  onChange: (patch: Partial<DraftItem>) => void
}) {
  const linked = linkPlantNames(item.text, plants).filter((p) => p.plantId)
  // One choice, not two: a task's section, or a note.
  const choices: { key: Section | 'note'; label: string }[] = [...(['do', 'plant', 'buy'] as Section[]).map((s) => ({ key: s, label: SECTION_LABELS[s] })), { key: 'note', label: 'Note' }]
  const chosen = item.kind === 'note' ? 'note' : item.section
  return (
    <li className="draft" data-kind={item.kind}>
      <div className="draft-row">
        <div className="choices" role="radiogroup" aria-label="Where it goes">
          {choices.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={chosen === c.key}
              className="choice small"
              onClick={() => onChange(c.key === 'note' ? { kind: 'note' as ItemKind, section: null } : { kind: 'task' as ItemKind, section: c.key })}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="move-to draft-month">
          <span className="visually-hidden">Month</span>
          <select
            value={`${item.year}-${item.month}`}
            onChange={(e) => {
              const [year, month] = e.target.value.split('-').map(Number)
              onChange({ year, month })
            }}
          >
            {months.map((m) => (
              <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                {MONTHS[m.month - 1]}
                {m.year !== months[0].year ? ` ${m.year}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="visually-hidden">{item.kind === 'task' ? 'Task' : 'Note'}</span>
        <textarea className="note-field" rows={item.kind === 'task' ? 2 : 3} value={item.text} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      {linked.length > 0 && <p className="sync-note">Links to {listOf(linked.map((p) => plants.find((x) => x.id === p.plantId)?.common ?? p.text))}.</p>}
      {item.clashes.length > 0 && (
        <ul className="rules-box">
          {item.clashes.map((c) => (
            <li key={c.rule_id} data-verdict="no">
              <span className="rule-mark" aria-hidden="true">
                ✕
              </span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

const listOf = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
