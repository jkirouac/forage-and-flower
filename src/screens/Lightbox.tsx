import { useEffect, useRef, useState, type TouchEvent } from 'react'

export interface Picture {
  src: string
  title: string
  paper?: boolean // a plan drawing: shown on white, as drawn
}

// A site's designs full screen: swipe or use the arrows to go between them, tap the
// picture to zoom in (then scroll around it), Escape or ✕ to close.
export default function Lightbox({ pictures, start, onClose }: { pictures: Picture[]; start: number; onClose: () => void }) {
  const [at, setAt] = useState(start)
  const [zoom, setZoom] = useState(false)
  const touch = useRef<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const pic = pictures[at]
  const go = (step: number) => {
    setZoom(false)
    setAt((i) => (i + step + pictures.length) % pictures.length)
  }

  useEffect(() => {
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A sideways swipe moves between pictures, unless zoomed in (then it scrolls).
  const onStart = (e: TouchEvent) => {
    touch.current = zoom ? null : e.touches[0].clientX
  }
  const onEnd = (e: TouchEvent) => {
    if (touch.current === null) return
    const dx = e.changedTouches[0].clientX - touch.current
    touch.current = null
    if (Math.abs(dx) > 50 && pictures.length > 1) go(dx < 0 ? 1 : -1)
  }

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={pic.title} ref={box} tabIndex={-1}>
      <div className="lightbox-bar">
        <span>
          {pic.title}
          {pictures.length > 1 && <span className="lightbox-count"> · {at + 1} of {pictures.length}</span>}
        </span>
        <button type="button" className="lightbox-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="lightbox-stage" data-zoom={zoom || undefined} onTouchStart={onStart} onTouchEnd={onEnd}>
        <img
          src={pic.src}
          alt={pic.title}
          className={pic.paper ? 'paper' : undefined}
          onClick={() => setZoom(!zoom)}
        />
      </div>
      {pictures.length > 1 && (
        <div className="lightbox-nav">
          <button type="button" className="choice" onClick={() => go(-1)} aria-label="Previous picture">
            ‹ Previous
          </button>
          <button type="button" className="choice" onClick={() => go(1)} aria-label="Next picture">
            Next ›
          </button>
        </div>
      )}
    </div>
  )
}
