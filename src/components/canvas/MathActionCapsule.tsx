import katex from 'katex'
import 'katex/dist/katex.min.css'
import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { validateCapsuleIntegrity } from '../../lib/canvas/capsule-integrity'
import { toScreen } from '../../lib/canvas/coordinates'
import { charBoundingBox, inkyStore } from '../../lib/canvas/store'
import { isGraphableExpression } from '../../lib/math/graph-engine'
import {
  getAvailableActions,
  type MathAction,
  solveMath,
  stampedTextFor,
} from '../../lib/math/math-solver'
import { getModelStatus, type ModelStatus, onModelStatusChange } from '../../lib/math/ml-recognizer'
import { generateSocraticHint } from '../../lib/math/step-checker'

// Render math with KaTeX; fall back to the raw string if the model or rule
// engine emitted something KaTeX can't parse (never show red error text).
function renderFormula(latex: string): React.ReactNode {
  // Model output can arrive $-wrapped; KaTeX throws on `$`, which would drop
  // the pill into the raw-latex fallback. Strip the delimiters — they are
  // display noise anyway (the solver strips them on its side too).
  const source = latex.replace(/\$/g, '')
  try {
    const html = katex.renderToString(source, { throwOnError: true, displayMode: false })
    // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX generates and escapes this markup itself; throwOnError:true makes bad LaTeX throw here (caught below) instead of emitting error nodes.
    return <span className="inky-capsule-formula" dangerouslySetInnerHTML={{ __html: html }} />
  } catch {
    return <span className="text-xs font-medium text-stone-200 tracking-wide">{source}</span>
  }
}

export function MathActionCapsule() {
  const [capsule, setCapsule] = useState(inkyStore.mathCapsule)
  const [camera, setCamera] = useState(inkyStore.camera)
  const [modelStatus, setModelStatus] = useState<ModelStatus>(getModelStatus)
  // Keeps the last open capsule mounted (frozen) during the 140ms exit fade.
  const [exiting, setExiting] = useState(false)
  const lastCapsuleRef = useRef(inkyStore.mathCapsule)
  const pillRef = useRef<HTMLDivElement>(null)
  // Offset that keeps the pill inside the viewport when anchored near an edge.
  const [edgeOffset, setEdgeOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    return onModelStatusChange(setModelStatus)
  }, [])

  useEffect(() => {
    return inkyStore.subscribe(() => {
      const next = inkyStore.mathCapsule
      // Stale guard: dismiss when any enclosed stroke or char was erased/deleted.
      if (!validateCapsuleIntegrity(next, inkyStore.strokes, inkyStore.stamps)) {
        inkyStore.setMathCapsule(null)
        return
      }
      setCapsule(next)
      // Only re-render for real camera moves (M6): compare before setting so
      // unrelated store notifications don't invalidate the memoized anchor.
      setCamera((prev) => {
        const c = inkyStore.camera
        return prev.x === c.x && prev.y === c.y && prev.z === c.z ? prev : { ...c }
      })
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
  // None are offered while ML is still reading the ink — the rule latex may
  // only be a placeholder, so don't invite a click on it.
  const actions = useMemo(
    () => (display && !display.mlPending ? getAvailableActions(display.latex) : []),
    [display],
  )

  const socraticHint = useMemo(
    () => (display && !display.mlPending ? generateSocraticHint(display.latex) : null),
    [display],
  )

  const isGraphable = useMemo(
    () => (display && !display.mlPending ? isGraphableExpression(display.latex) : false),
    [display],
  )

  // Sparkle resolve pop: when mlPending transitions true→false (ML settled or
  // fell back), flash the one-shot resolve class for 200ms so the dot "pops".
  // Guard on the capsule existing (M3): a dismissal mid-pending must not arm
  // the pop for a pill that is already fading out.
  const [sparkleResolved, setSparkleResolved] = useState(false)
  const prevPendingRef = useRef(capsule?.mlPending ?? false)
  useEffect(() => {
    if (!capsule) {
      prevPendingRef.current = false
      return
    }
    const pending = capsule.mlPending ?? false
    const wasPending = prevPendingRef.current
    prevPendingRef.current = pending
    if (wasPending && !pending) {
      setSparkleResolved(true)
      const timer = setTimeout(() => setSparkleResolved(false), 200)
      return () => clearTimeout(timer)
    }
  }, [capsule])

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

  if (!display) return null

  const [screenX, screenY] = screen

  const handleAction = (e: React.MouseEvent, action: MathAction | 'hint' | 'graph') => {
    e.stopPropagation()
    if (exiting) return

    if (action === 'graph') {
      inkyStore.openGraphSidebar(display.latex)
      inkyStore.setMathCapsule(null)
      inkyStore.clearSelection()
      inkyStore.setActiveTool('draw')
      return
    }

    if (action === 'hint') {
      if (!socraticHint) return
      const enclosedStrokes = inkyStore.strokes.filter((s) =>
        display.enclosedStrokeIds.includes(s.id),
      )
      const enclosedChars = display.enclosedCharIds
        ? inkyStore.stamps
            .flatMap((s) => s.chars)
            .filter((c) => display.enclosedCharIds?.includes(c.id))
        : []

      const strokeBoxes = enclosedStrokes.map((s) => s.boundingBox)
      const charBoxes = enclosedChars.map(charBoundingBox)
      const allBoxes = [...strokeBoxes, ...charBoxes]

      const anchorX =
        allBoxes.length > 0 ? Math.min(...allBoxes.map((b) => b.minX)) : display.worldPosition.x
      const maxY =
        allBoxes.length > 0 ? Math.max(...allBoxes.map((b) => b.maxY)) : display.worldPosition.y
      let fontSize = 36
      if (allBoxes.length > 0) {
        const minY = Math.min(...allBoxes.map((b) => b.minY))
        fontSize = Math.min(96, Math.max(16, (maxY - minY) * 1.6))
      }

      inkyStore.stampResult({
        text: socraticHint.expectedNextForm,
        worldX: anchorX,
        worldY: maxY + 45,
        color: '#2563eb',
        fontSize,
      })
      return
    }

    const solution = solveMath(display.latex, action)
    if (!solution?.resultLatex) return

    // The enclosed strokes or chars anchor the stamp to the right of the formula and
    // define the hand it should match: the answer is sized from the height of
    // the user's own glyphs (Caveat digits ≈ 0.6em tall).
    const enclosedStrokes = inkyStore.strokes.filter((s) =>
      display.enclosedStrokeIds.includes(s.id),
    )
    const enclosedChars = display.enclosedCharIds
      ? inkyStore.stamps
          .flatMap((s) => s.chars)
          .filter((c) => display.enclosedCharIds?.includes(c.id))
      : []

    const strokeBoxes = enclosedStrokes.map((s) => s.boundingBox)
    const charBoxes = enclosedChars.map(charBoundingBox)
    const allBoxes = [...strokeBoxes, ...charBoxes]

    const maxX =
      allBoxes.length > 0 ? Math.max(...allBoxes.map((b) => b.maxX)) : display.worldPosition.x + 100
    let fontSize = 36
    let stampY = display.worldPosition.y - 18
    if (allBoxes.length > 0) {
      const minY = Math.min(...allBoxes.map((b) => b.minY))
      const maxY = Math.max(...allBoxes.map((b) => b.maxY))
      const centerY = (minY + maxY) / 2
      fontSize = Math.min(96, Math.max(16, (maxY - minY) * 1.6))
      stampY = centerY - fontSize * 0.6
    }

    // The whole answer stamps as ONE undo step: appends the text stamp, arms
    // the reveal wipe, dismisses the capsule, and returns the user to the pen.
    inkyStore.stampResult({
      text: stampedTextFor(solution, action),
      worldX: maxX + 30,
      worldY: stampY,
      color: inkyStore.strokeColor,
      fontSize,
    })
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    inkyStore.setMathCapsule(null)
    // Dismissal returns the board to a clean pen-ready state (QoL pass).
    inkyStore.clearSelection()
    inkyStore.setActiveTool('draw')
  }

  return (
    <fieldset
      aria-label="Formula actions"
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
        {/* Formula — shows "Loading math model…" or "Reading…" while ML is upgrading the rule latex,
            so the pill never displays a raw placeholder guess.
            mlPending ? ( <span className="text-xs italic text-stone-300">Reading… */}
        <span className="min-w-0 flex-1 truncate" aria-live="polite">
          {display.mlPending ? (
            <span className="text-xs italic text-stone-300">
              {modelStatus === 'loading' ? 'Loading math model…' : 'Reading…'}
            </span>
          ) : (
            <span
              key={display.latex}
              title={display.latex}
              className="inky-capsule-swap inline-block max-w-full align-middle"
            >
              {renderFormula(display.latex)}
            </span>
          )}
        </span>

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
            visually primary when available. Hint is offered when a Socratic next step exists. */}
        <div className="flex items-center gap-1 shrink-0">
          {(
            [
              {
                action: 'solve' as const,
                label: 'Solve',
                primary: true,
                available: actions.includes('solve'),
                title: undefined,
              },
              {
                action: 'factor' as const,
                label: 'Factor',
                primary: false,
                available: actions.includes('factor'),
                title: undefined,
              },
              {
                action: 'simplify' as const,
                label: 'Simplify',
                primary: false,
                available: actions.includes('simplify'),
                title: undefined,
              },
              ...(isGraphable
                ? [
                    {
                      action: 'graph' as const,
                      label: 'Graph',
                      primary: false,
                      available: true,
                      title: 'Open function graph in side panel',
                    },
                  ]
                : []),
              ...(socraticHint
                ? [
                    {
                      action: 'hint' as const,
                      label: 'Hint',
                      primary: false,
                      available: true,
                      title: socraticHint.operation,
                    },
                  ]
                : []),
            ] satisfies {
              action: MathAction | 'hint' | 'graph'
              label: string
              primary: boolean
              available: boolean
              title?: string
            }[]
          ).map(({ action, label, primary, available, title }) => {
            const base =
              'text-xs px-2 py-1 rounded-lg transition-[transform,background-color,color,opacity] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#111111]'
            const style = primary
              ? 'font-semibold px-2.5 bg-white text-[#111111] hover:bg-stone-200 active:scale-[0.96] cursor-pointer'
              : 'font-medium text-stone-300 hover:text-white hover:bg-white/10 active:scale-[0.96] cursor-pointer'
            const defaultTitle = available ? undefined : 'Not applicable to this formula'
            return (
              <button
                key={action}
                type="button"
                aria-disabled={!available}
                title={title ?? defaultTitle}
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
    </fieldset>
  )
}
