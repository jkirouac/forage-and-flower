import { useEffect, useRef, useState, type PointerEvent } from 'react'

export interface Picture {
  src: string
  title: string
  paper?: boolean // a plan drawing: shown on white, as drawn
}

const MAX = 6 // zoom limit
const DOUBLE_TAP_MS = 300
const SWIPE = 50 // px sideways to go to the next picture

interface View {
  scale: number
  x: number // px, from the centre of the stage
  y: number
}
const FIT: View = { scale: 1, x: 0, y: 0 }

// A site's designs full screen, with the phone's usual gestures: pinch to zoom,
// drag to move around a zoomed picture, double-tap to zoom in or back out, and
// swipe sideways (when not zoomed) to go between pictures. Arrows and Escape work
// with a keyboard.
export default function Lightbox({ pictures, start, onClose }: { pictures: Picture[]; start: number; onClose: () => void }) {
  const [at, setAt] = useState(start)
  const [view, setView] = useState<View>(FIT)
  const [moving, setMoving] = useState(false) // no easing while a finger is down
  const box = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; from: View } | null>(null)
  const drag = useRef<{ x: number; y: number; from: View; startX: number } | null>(null)
  const lastTap = useRef(0)
  const pic = pictures[at]

  const go = (step: number) => {
    setView(FIT)
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

  // A point on screen, relative to the centre of the stage.
  const local = (p: { x: number; y: number }) => {
    const r = stage.current!.getBoundingClientRect()
    return { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) }
  }
  // Zoom to `scale`, keeping the picture point under `focus` (stage coordinates) still.
  const zoomAt = (from: View, scale: number, focus: { x: number; y: number }, to = focus): View => {
    const s = Math.min(MAX, Math.max(1, scale))
    if (s === 1) return FIT
    const px = (focus.x - from.x) / from.scale
    const py = (focus.y - from.y) / from.scale
    return { scale: s, x: to.x - px * s, y: to.y - py * s }
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    stage.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setMoving(true)
    const ps = [...pointers.current.values()]
    if (ps.length === 2) {
      drag.current = null
      gesture.current = {
        dist: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y),
        mid: local({ x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }),
        from: view,
      }
    } else if (ps.length === 1) {
      drag.current = { x: e.clientX, y: e.clientY, from: view, startX: e.clientX }
    }
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const ps = [...pointers.current.values()]
    const g = gesture.current
    if (g && ps.length >= 2) {
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y)
      const mid = local({ x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 })
      setView(zoomAt(g.from, (g.from.scale * dist) / g.dist, g.mid, mid))
      return
    }
    const d = drag.current
    if (d && d.from.scale > 1) setView({ ...d.from, x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y })
  }

  function up(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    const d = drag.current
    if (pointers.current.size === 0) {
      setMoving(false)
      gesture.current = null
      drag.current = null
      // A sideways swipe at normal size goes to the next or previous picture.
      if (d && d.from.scale === 1 && pictures.length > 1 && Math.abs(e.clientX - d.startX) > SWIPE) return go(e.clientX < d.startX ? 1 : -1)
      // A double tap zooms in on that spot, or back out.
      const still = d && Math.abs(e.clientX - d.x) < 10 && Math.abs(e.clientY - d.y) < 10
      if (still) {
        const now = Date.now()
        if (now - lastTap.current < DOUBLE_TAP_MS) {
          lastTap.current = 0
          setView((v) => (v.scale > 1 ? FIT : zoomAt(v, 2.5, local({ x: e.clientX, y: e.clientY }))))
        } else lastTap.current = now
      }
    } else if (pointers.current.size === 1) {
      // One finger lifted from a pinch: carry on dragging with the other.
      gesture.current = null
      const [p] = [...pointers.current.values()]
      setView((v) => {
        drag.current = { x: p.x, y: p.y, from: v, startX: p.x }
        return v
      })
    }
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
      <div
        className="lightbox-stage"
        ref={stage}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <img
          src={pic.src}
          alt={pic.title}
          className={pic.paper ? 'paper' : undefined}
          draggable={false}
          data-moving={moving || undefined}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>
      <p className="lightbox-hint">{view.scale > 1 ? 'Drag to look around · double-tap to fit' : 'Pinch or double-tap to zoom'}</p>
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
