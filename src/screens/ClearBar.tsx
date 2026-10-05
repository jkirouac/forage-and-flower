import { useState } from 'react'
import type { ClearSummary } from '../lib/clear'

// "Clear N checked off", pinned above the tab bar. Shown only once you've checked
// something off yourself; asks first when the other person checked some of them.
export function ClearBar({ summary, onClear }: { summary: ClearSummary; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (summary.mine === 0) return null
  const n = summary.total

  return (
    <div className="clear-bar" role="region" aria-label="Clear checked off">
      {confirming ? (
        <>
          <p className="clear-ask">
            {summary.others === 1 ? 'One was' : `${summary.others} were`} checked off by the other person. Clear all {n}?
          </p>
          <div className="choices">
            <button
              type="button"
              className="button"
              onClick={() => {
                setConfirming(false)
                onClear()
              }}
            >
              Clear all
            </button>
            <button type="button" className="choice" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="button clear-button" onClick={() => (summary.others > 0 ? setConfirming(true) : onClear())}>
          Clear {n} checked off
        </button>
      )}
    </div>
  )
}

// "Show 4 cleared" / "Hide cleared", at the end of a list.
export function ShowCleared({ count, shown, onToggle }: { count: number; shown: boolean; onToggle: () => void }) {
  if (count === 0) return null
  return (
    <button type="button" className="text-button" aria-pressed={shown} onClick={onToggle}>
      {shown ? 'Hide cleared' : `Show ${count} cleared`}
    </button>
  )
}
