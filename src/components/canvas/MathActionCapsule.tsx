import katex from 'katex'
import 'katex/dist/katex.min.css'
import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { validateCapsuleIntegrity } from '../../lib/canvas/capsule-integrity'
import { toScreen } from '../../lib/canvas/coordinates'
import { charBoundingBox, inkyStore } from '../../lib/canvas/store'
import { boardCatalog } from '../../lib/document/boardCatalog'
import { isGraphableExpression } from '../../lib/math/graph-engine'
import {
  getAvailableActions,
  type MathAction,
  solveMath,
  stampedTextFor,
} from '../../lib/math/math-solver'
import { getModelStatus, type ModelStatus, onModelStatusChange } from '../../lib/math/ml-recognizer'
import { type CoachingMethod, generateSocraticHint } from '../../lib/math/step-checker'

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
    return <span className="text-xs font-medium text-[#787774] tracking-wide">{source}</span>
  }
}

/**
 * Estimates handwritten glyph height and baseline metrics from the enclosed
 * strokes or stamped characters so that stamped Hints and Solved answers
 * match the student's actual handwriting scale and line spacing rather than
 * exploding when multi-line or superscript strokes have a tall overall AABB.
 */
export function computeWritingMetrics(
  strokeBoxes: { minX: number; minY: number; maxX: number; maxY: number }[],
  charBoxes: { minX: number; minY: number; maxX: number; maxY: number }[],
  charFontSizes: number[],
  fallbackAnchor: { x: number; y: number },
): {
  minX: number
  maxX: number
  minY: number
  maxY: number
  fontSize: number
  hintWorldX: number
  hintWorldY: number
  answerWorldX: number
  answerWorldY: number
} {
  const allBoxes = [...strokeBoxes, ...charBoxes]
  if (allBoxes.length === 0) {
    const fontSize = 36
    const lineGap = Math.round(Math.max(16, Math.min(48, fontSize * 0.6)))
    return {
      minX: fallbackAnchor.x,
      maxX: fallbackAnchor.x + 100,
      minY: fallbackAnchor.y,
      maxY: fallbackAnchor.y,
      fontSize,
      hintWorldX: fallbackAnchor.x,
      hintWorldY: fallbackAnchor.y + lineGap,
      answerWorldX: fallbackAnchor.x + 130,
      answerWorldY: fallbackAnchor.y - 18,
    }
  }

  const minX = Math.min(...allBoxes.map((b) => b.minX))
  const maxX = Math.max(...allBoxes.map((b) => b.maxX))
  const minY = Math.min(...allBoxes.map((b) => b.minY))
  const maxY = Math.max(...allBoxes.map((b) => b.maxY))
  const overallH = Math.max(12, maxY - minY)

  let fontSize = 36
  if (charFontSizes.length > 0 && strokeBoxes.length === 0) {
    // When acting on an existing stamp, preserve its exact handwriting font size!
    const sum = charFontSizes.reduce((acc, s) => acc + s, 0)
    fontSize = Math.round(Math.min(96, Math.max(16, sum / charFontSizes.length)))
  } else {
    // Filter out tiny dots/minus bars (< 28% of overall height) when computing median stroke height
    const strokeHeights = strokeBoxes
      .map((b) => b.maxY - b.minY)
      .filter((h) => h >= Math.max(8, overallH * 0.28))
      .sort((a, b) => a - b)

    const representativeH =
      strokeHeights.length > 0 ? strokeHeights[Math.floor(strokeHeights.length * 0.6)] : overallH

    // Blend representative glyph height with overall height (capped so fractions/tall loops don't explode)
    const effectiveH = Math.min(overallH, representativeH * 1.05)
    fontSize = Math.round(Math.min(72, Math.max(16, effectiveH * 1.15)))
  }

  // Line gap below writing scales naturally with the user's writing size, kept compact
  // so multi-step equations don't drift down the page into subsequent worksheet problems
  const lineGap = Math.round(Math.max(6, Math.min(22, fontSize * 0.22)))
  const rightGap = Math.round(Math.max(14, Math.min(36, fontSize * 0.5)))
  const centerY = (minY + maxY) / 2

  return {
    minX,
    maxX,
    minY,
    maxY,
    fontSize,
    hintWorldX: minX,
    hintWorldY: Math.round(maxY + lineGap),
    answerWorldX: Math.round(maxX + rightGap),
    answerWorldY: Math.round(centerY - fontSize * 0.6),
  }
}

export function MathActionCapsule() {
  const [capsule, setCapsule] = useState(inkyStore.mathCapsule)
  const [camera, setCamera] = useState(inkyStore.camera)
  const [modelStatus, setModelStatus] = useState<ModelStatus>(getModelStatus)
  const [activeMethod, setActiveMethod] = useState<CoachingMethod>(
    () => boardCatalog.getActiveBoard()?.worksheetMethod ?? 'auto',
  )
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
    const syncCatalog = () => {
      setActiveMethod(boardCatalog.getActiveBoard()?.worksheetMethod ?? 'auto')
    }
    syncCatalog()
    return boardCatalog.subscribe(syncCatalog)
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
    () =>
      display && !display.mlPending
        ? generateSocraticHint(display.latex, { method: activeMethod })
        : null,
    [display, activeMethod],
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
      const charFontSizes = enclosedChars.map((c) => c.fontSize)
      const metrics = computeWritingMetrics(
        strokeBoxes,
        charBoxes,
        charFontSizes,
        display.worldPosition,
      )

      inkyStore.stampResult({
        text: socraticHint.expectedNextForm,
        worldX: metrics.hintWorldX,
        worldY: metrics.hintWorldY,
        color: '#2563eb',
        fontSize: metrics.fontSize,
      })
      return
    }

    const solution = solveMath(display.latex, action)
    if (!solution?.resultLatex) return

    // The enclosed strokes or chars anchor the stamp to the right of the formula and
    // define the hand it should match: the answer is sized from the height of
    // the user's own glyphs (maxY - minY) * 1.6 / Math.min(96, Math.max(16, ...)).
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
    const charFontSizes = enclosedChars.map((c) => c.fontSize)
    const metrics = computeWritingMetrics(
      strokeBoxes,
      charBoxes,
      charFontSizes,
      display.worldPosition,
    )

    // The whole answer stamps as ONE undo step: appends the text stamp, arms
    // the reveal wipe, dismisses the capsule, and returns the user to the pen.
    inkyStore.stampResult({
      text: stampedTextFor(solution, action),
      worldX: metrics.answerWorldX,
      worldY: metrics.answerWorldY,
      color: inkyStore.strokeColor,
      fontSize: metrics.fontSize,
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
      className="inky-ui absolute z-40 origin-bottom pointer-events-auto border-none p-0 m-0"
      style={{
        left: `${screenX + edgeOffset.x}px`,
        top: `${screenY + edgeOffset.y}px`,
        transform: 'translate(-50%, -115%)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={pillRef}
        data-capsule-state={exiting ? 'exiting' : 'open'}
        className={`${exiting ? 'inky-capsule-out' : 'inky-capsule-in'} bg-white/95 backdrop-blur-xl text-[#111111] border border-black/8 shadow-[0_12px_36px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-1.5 pl-3.5 flex flex-col max-w-[min(88vw,520px)]`}
      >
        <div className="flex items-center gap-2">
          {/* Formula — shows "Loading math model…" or "Reading…" while ML is upgrading the rule latex,
              so the pill never displays a raw placeholder guess.
              mlPending ? ( <span className="text-xs italic text-[#787774]">Reading… */}
          <span className="min-w-0 flex-1 truncate py-0.5" aria-live="polite">
            {display.mlPending ? (
              <span className="text-xs font-medium text-[#787774]">
                {modelStatus === 'loading' ? 'Loading math model…' : 'Reading…'}
              </span>
            ) : (
              <span
                key={display.latex}
                title={display.latex}
                className="inky-capsule-swap inline-block max-w-full align-middle text-[#111111]"
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

          <div className="w-[1px] h-4 bg-black/8 shrink-0 mx-0.5" />

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
                'text-xs px-2.5 py-1.5 rounded-xl transition-[transform,background-color,color,opacity] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1'
              const style = primary
                ? 'font-semibold bg-[#111111] text-white hover:bg-[#2a2a2a] active:scale-[0.96] cursor-pointer shadow-2xs'
                : action === 'hint'
                  ? 'font-semibold text-[#2563eb] bg-blue-50/90 hover:bg-blue-100/90 active:scale-[0.96] cursor-pointer'
                  : 'font-medium text-[#111111] bg-black/[0.04] hover:bg-black/[0.08] active:scale-[0.96] cursor-pointer'
              const defaultTitle = available ? undefined : 'Not applicable to this formula'
              return (
                <button
                  key={action}
                  type="button"
                  aria-disabled={!available}
                  title={title ?? defaultTitle}
                  onClick={available ? (e) => handleAction(e, action) : (e) => e.stopPropagation()}
                  className={
                    available
                      ? `${base} ${style}`
                      : `${base} text-[#787774] opacity-40 cursor-default`
                  }
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
            className="text-[#787774] hover:text-[#111111] hover:bg-black/5 p-1.5 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Close"
            aria-label="Close formula capsule"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {socraticHint && !display.mlPending && (
          <div
            data-testid="socratic-coach-tray"
            className="border-t border-black/6 pt-2 mt-1.5 pr-2 pb-0.5 flex items-center justify-between gap-3 text-xs"
          >
            <span className="text-[#4b5563] leading-snug">{socraticHint.socraticPrompt}</span>
            <span className="font-medium text-[#2563eb] shrink-0">{socraticHint.operation}</span>
          </div>
        )}
      </div>
    </fieldset>
  )
}
