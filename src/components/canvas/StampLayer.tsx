import '@fontsource/caveat/600.css'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toScreen } from '../../lib/canvas/coordinates'
import { prefersReducedMotion, STAMP_WIPE_EDGE_PX, stampWipe } from '../../lib/canvas/motion'
import { inkyStore, type Stamp, stampBoundingBox } from '../../lib/canvas/store'

function StampView({
  stamp,
  camera,
}: {
  stamp: Stamp
  camera: { x: number; y: number; z: number }
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [screenX, screenY] = toScreen(stamp.worldX, stamp.worldY, camera)
  // Container width covers the char extent so the wipe's offsetWidth sweep
  // measures the real rendered run (children are absolutely positioned and
  // would otherwise leave the container at width 0).
  const stampWidthPx = (stampBoundingBox(stamp).maxX - stamp.worldX) * camera.z

  // Feathered left-to-right wipe for the freshly stamped answer: a 16px
  // soft-edge mask sweeps across the text over STAMP_WIPE_MS with the locked
  // easeOutQuint, mirroring the old canvas stamp wipe. Reduced motion snaps
  // straight to the revealed state.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const reveal = inkyStore.stampedReveal
    if (reveal?.stampId !== stamp.id) return
    if (prefersReducedMotion()) {
      inkyStore.setStampedReveal(null)
      return
    }
    let raf = 0
    const width = el.offsetWidth
    const tick = (t: number) => {
      const { revealX, done } = stampWipe(t - reveal.startedAt, width)
      const mask = `linear-gradient(90deg, #000 ${Math.max(0, revealX - STAMP_WIPE_EDGE_PX)}px, transparent ${Math.max(0, revealX)}px)`
      el.style.maskImage = mask
      el.style.webkitMaskImage = mask
      if (!done) {
        raf = requestAnimationFrame(tick)
      } else {
        el.style.maskImage = 'none'
        el.style.webkitMaskImage = 'none'
        if (inkyStore.stampedReveal?.stampId === stamp.id) inkyStore.setStampedReveal(null)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      el.style.maskImage = 'none'
      el.style.webkitMaskImage = 'none'
    }
    // Deps are the stamp identity only: the reveal is cleared when the wipe
    // finishes, and camera moves re-position the span without re-sweeping.
  }, [stamp.id])

  return (
    <span
      ref={ref}
      data-stamp-id={stamp.id}
      className="absolute origin-top-left whitespace-pre pointer-events-none select-none"
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        color: stamp.color,
        fontFamily: '"Caveat", cursive',
        fontWeight: 600,
        fontSize: `${stamp.fontSize * camera.z}px`,
        lineHeight: 1.25,
        width: `${stampWidthPx}px`,
      }}
    >
      {stamp.chars.map((c) => (
        <span
          key={c.id}
          data-char-id={c.id}
          className="absolute whitespace-pre"
          style={{
            left: `${(c.worldX - stamp.worldX) * camera.z}px`,
            top: `${(c.worldY - stamp.worldY) * camera.z}px`,
            fontSize: `${c.fontSize * camera.z}px`,
            lineHeight: 1.25,
            transform: c.angle
              ? `rotate(${Number(((c.angle * 180) / Math.PI).toFixed(4))}deg)`
              : undefined,
            transformOrigin: 'center',
          }}
        >
          {c.char}
        </span>
      ))}
    </span>
  )
}

/** DOM overlay for stamped answers: real text in a handwriting face, sized
 * from the user's own writing, living on the world plane (pans and zooms
 * with the canvas) and revealed by the feathered wipe. Each char is its own
 * span (data-char-id) so single glyphs can be selected, transformed and
 * erased like strokes. */
export function StampLayer() {
  const [, setVersion] = useState(0)
  useEffect(() => inkyStore.subscribe(() => setVersion((v) => v + 1)), [])

  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {inkyStore.stamps.map((stamp) => (
        <StampView key={stamp.id} stamp={stamp} camera={inkyStore.camera} />
      ))}
    </div>
  )
}
