import katex from 'katex'
import 'katex/dist/katex.min.css'
import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { validateCapsuleIntegrity } from '../../lib/canvas/capsule-integrity'
import { toScreen } from '../../lib/canvas/coordinates'
import { inkyStore } from '../../lib/canvas/store'
import {
  getAvailableActions,
  type MathAction,
  solveMath,
  stampedTextFor,
} from '../../lib/math/math-solver'
import { planStamp } from '../../lib/math/math-to-strokes'

// Render math with KaTeX; fall back to the raw string if the model or rule
// engine emitted something KaTeX can't parse (never show red error text).
function renderFormula(latex: string): React.ReactNode {
  try {
    const html = katex.renderToString(latex, { throwOnError: true, displayMode: false })
    // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX generates and escapes this markup itself; throwOnError:true makes bad LaTeX throw here (caught below) instead of emitting error nodes.
    return <span className="inky-capsule-formula" dangerouslySetInnerHTML={{ __html: html }} />
  } catch {
    return <span className="text-xs font-medium text-stone-200 tracking-wide">{latex}</span>
  }
}

export function MathActionCapsule() {
  const [capsule, setCapsule] = useState(inkyStore.mathCapsule)
  const [camera, setCamera] = useState(inkyStore.camera)
  // Keeps the last open capsule mounted (frozen) during the 140ms exit fade.
  const [exiting, setExiting] = useState(false)
  const lastCapsuleRef = useRef(inkyStore.mathCapsule)
  const pillRef = useRef<HTMLDivElement>(null)
  // Offset that keeps the pill inside the viewport when anchored near an edge.
  const [edgeOffset, setEdgeOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    return inkyStore.subscribe(() => {
      const next = inkyStore.mathCapsule
      // Stale guard: dismiss when any enclosed stroke was erased/deleted.
      if (!validateCapsuleIntegrity(next, inkyStore.strokes)) {
        inkyStore.setMathCapsule(null)
        return
      }
      setCapsule(next)
      setCamera({ ...inkyStore.camera })
    })
  }, [])

  // Exit animation: when the capsule closes, keep rendering the last one with
  // the .inky-capsule-out fade for 140ms, then unmount. Reopening mid-fade
  // cancels the timer and restores the live capsule.
  useEffect(() => {
    if (capsule) {
      lastCapsuleRef.current = capsule
      setExiting(false)
      return
    }
    if (!lastCapsuleRef.current) return
    setExiting(true)
    const timer = setTimeout(() => {
      setExiting(false)
      lastCapsuleRef.current = null
    }, 140)
    return () => clearTimeout(timer)
  }, [capsule])

  const display = capsule ?? lastCapsuleRef.current

  // Actions that make sense for this formula (e.g. no Solve without an "=").
  const actions = useMemo(() => (display ? getAvailableActions(display.latex) : []), [display])

  // Sparkle resolve pop: when mlPending transitions true→false (ML settled or
  // fell back), flash the one-shot resolve class for 200ms so the dot "pops".
  const [sparkleResolved, setSparkleResolved] = useState(false)
  // Inline note when a result cannot be hand-written (e.g. "No real roots") —
  // the click must never be a silent no-op (final review I1).
  const [notice, setNotice] = useState('')
  const prevPendingRef = useRef(capsule?.mlPending ?? false)
  useEffect(() => {
    const pending = capsule?.mlPending ?? false
    const wasPending = prevPendingRef.current
    prevPendingRef.current = pending
    if (wasPending && !pending) {
      setSparkleResolved(true)
      const timer = setTimeout(() => setSparkleResolved(false), 200)
      return () => clearTimeout(timer)
    }
  }, [capsule?.mlPending])

  // Derived anchor, memoized so the clamp effect isn't re-fired every render.
  const screen = useMemo(() => {
    return display
      ? toScreen(display.worldPosition.x, display.worldPosition.y, camera)
      : ([0, 0] as const)
  }, [display, camera])

  // Clamp the pill (and flip it below the anchor) when it would overflow
  // the viewport — a capsule half off-screen is unreachable.
  useLayoutEffect(() => {
    if (!display || !pillRef.current) return
    const pill = pillRef.current
    const vw = window.innerWidth
    const rect = pill.getBoundingClientRect()
    const anchorX = screen[0]
    const anchorY = screen[1]

    let dx = 0
    let dy = 0
    const half = rect.width / 2
    if (anchorX - half < 8) dx = 8 - (anchorX - half)
    if (anchorX + half > vw - 8) dx = vw - 8 - (anchorX + half)
    // Pill sits 120% above the anchor; flip below when that clips the top.
    if (anchorY - rect.height * 1.2 < 8) dy = rect.height * 1.2 + 12
    setEdgeOffset({ x: dx, y: dy })
    // Recomputing is idempotent; deps are the render inputs that move the pill.
  }, [display, screen])

  // Reset the un-stampable-result notice whenever the formula changes (e.g.
  // the ML upgrade replaces the rule latex). Must sit above the early return —
  // hooks after a conditional return crash on the null→value transition (I1).
  const currentLatex = display?.latex
  useEffect(() => {
    if (currentLatex !== undefined) setNotice('')
  }, [currentLatex])

  if (!display) return null

  const [screenX, screenY] = screen

  const handleAction = (e: React.MouseEvent, action: 'solve' | 'factor' | 'simplify') => {
    e.stopPropagation()
    if (exiting) return
    const solution = solveMath(display.latex, action)
    if (!solution?.resultLatex) return

    // Find bounding box of enclosed strokes to place answer to the right
    const enclosedStrokes = inkyStore.strokes.filter((s) =>
      display.enclosedStrokeIds.includes(s.id),
    )
    let maxX = display.worldPosition.x + 100
    let centerY = display.worldPosition.y
    if (enclosedStrokes.length > 0) {
      maxX = Math.max(...enclosedStrokes.map((s) => s.boundingBox.maxX))
      const minY = Math.min(...enclosedStrokes.map((s) => s.boundingBox.minY))
      const maxY = Math.max(...enclosedStrokes.map((s) => s.boundingBox.maxY))
      centerY = (minY + maxY) / 2
    }

    // Synthesize realistic handwritten strokes for the result — or surface it
    // as text when the glyph table cannot draw it (never a silent no-op).
    const textToStamp = stampedTextFor(solution, action)
    const plan = planStamp(
      textToStamp,
      maxX + 30,
      centerY - 18,
      36,
      inkyStore.strokeColor,
      inkyStore.strokeSize,
    )
    if (plan.kind === 'show') {
      setNotice(plan.message)
      return
    }

    // Stamp the whole answer as ONE undo step: appends, selects, arms the
    // handwriting wipe, and dismisses the capsule in a single store call.
    inkyStore.stampResult(plan.strokes)
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    inkyStore.setMathCapsule(null)
  }

  return (
    <div
      className="inky-ui absolute z-40 origin-bottom pointer-events-auto"
      style={{
        left: `${screenX + edgeOffset.x}px`,
        top: `${screenY + edgeOffset.y}px`,
        transform: 'translate(-50%, -120%)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={pillRef}
        data-capsule-state={exiting ? 'exiting' : 'open'}
        className={`${exiting ? 'inky-capsule-out' : 'inky-capsule-in'} bg-[#111111]/90 backdrop-blur-md text-white border border-white/10 shadow-2xl rounded-2xl px-3 py-2 flex items-center gap-3 max-w-[min(60vw,420px)]`}
      >
        {/* Formula typography — key on latex so upgrades crossfade in place */}
        <span key={display.latex} title={display.latex} className="min-w-0 flex-1 truncate">
          <span className="inky-capsule-swap inline-block max-w-full align-middle">
            {renderFormula(display.latex)}
          </span>
        </span>

        {notice && (
          <span className="max-w-40 truncate text-[10px] italic text-stone-400" title={notice}>
            {notice}
          </span>
        )}

        {/* ML-refinement sparkle: pulses while inference is pending, pops once
            on settle. Hidden once resolved (dot is a pending affordance). */}
        {(display.mlPending || sparkleResolved) && (
          <span
            aria-hidden="true"
            className={`inky-capsule-sparkle${sparkleResolved ? ' inky-capsule-sparkle-resolve' : ''}`}
          />
        )}

        <div className="w-[1px] h-4 bg-white/20 shrink-0" />

        {/* Action buttons — rendered from the availability list; unavailable
            actions stay visible but inert (aria-disabled, dimmed). Solve stays
            visually primary when available. */}
        <div className="flex items-center gap-1 shrink-0">
          {(
            [
              { action: 'solve' as const, label: 'Solve', primary: true },
              { action: 'factor' as const, label: 'Factor', primary: false },
              { action: 'simplify' as const, label: 'Simplify', primary: false },
            ] satisfies { action: MathAction; label: string; primary: boolean }[]
          ).map(({ action, label, primary }) => {
            const available = actions.includes(action)
            const base =
              'text-xs px-2 py-1 rounded-lg transition-[transform,background-color,color,opacity] duration-150'
            const style = primary
              ? 'font-semibold px-2.5 bg-white text-[#111111] hover:bg-stone-200 active:scale-95 cursor-pointer'
              : 'font-medium text-stone-300 hover:text-white hover:bg-white/10 active:scale-95 cursor-pointer'
            return (
              <button
                key={action}
                type="button"
                aria-disabled={!available}
                onClick={available ? (e) => handleAction(e, action) : (e) => e.stopPropagation()}
                className={available ? `${base} ${style}` : `${base} opacity-40 cursor-default`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Dismiss Icon */}
        <button
          type="button"
          onClick={handleDismiss}
          className="text-stone-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer shrink-0"
          title="Close"
          aria-label="Close formula capsule"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
