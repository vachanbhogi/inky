import { AlertCircle, Check, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toScreen } from '../../lib/canvas/coordinates'
import { inkyStore, stampBoundingBox } from '../../lib/canvas/store'
import {
  checkEquationEquivalence,
  generateSocraticHint,
  type SocraticHint,
} from '../../lib/math/step-checker'

export type ErrorCategory =
  | 'sign_error'
  | 'arithmetic_error'
  | 'division_error'
  | 'factor_error'
  | 'syntax_error'
  | 'unknown'

export interface MarginChipItem {
  id: string
  worldX: number
  worldY: number
  type: 'valid' | 'discrepancy'
  errorType?: ErrorCategory
  label?: string
  latex?: string
  prevLatex?: string
  hint?: string
  socraticHint?: SocraticHint | null
}

export interface MarginFeedbackLayerProps {
  /** Explicit items to render. If not provided, items are derived from canvas state (stamps and capsule). */
  items?: MarginChipItem[]
  /** Optional callback fired when a chip's expanded state changes. */
  onToggleExpand?: (id: string, expanded: boolean) => void
}

/**
 * Maps error categories to human-friendly, non-punitive chip labels.
 */
export function getErrorBadgeLabel(reason?: ErrorCategory): string {
  switch (reason) {
    case 'sign_error':
      return 'Sign Error'
    case 'arithmetic_error':
      return 'Arithmetic Error'
    case 'division_error':
      return 'Division Error'
    case 'factor_error':
      return 'Factor Error'
    case 'syntax_error':
      return 'Check Syntax'
    default:
      return 'Check Step'
  }
}

/**
 * Helper to evaluate a sequential chain of derivation equations into tactile margin chips.
 */
export function evaluateDerivationSteps(
  steps: string[],
  anchors?: { x: number; y: number }[],
): MarginChipItem[] {
  const result: MarginChipItem[] = []

  for (let i = 0; i < steps.length; i++) {
    const current = steps[i]
    const anchor = anchors?.[i] ?? { x: 300, y: 100 + i * 50 }

    if (i === 0) {
      // First step / prompt: if linear or quadratic, provide next-step hint
      const hint = generateSocraticHint(current)
      result.push({
        id: `step-${i}`,
        worldX: anchor.x,
        worldY: anchor.y,
        type: 'valid',
        latex: current,
        socraticHint: hint,
      })
      continue
    }

    const prev = steps[i - 1]
    const check = checkEquationEquivalence(prev, current)
    const socratic = generateSocraticHint(current)

    if (check.isValid) {
      result.push({
        id: `step-${i}`,
        worldX: anchor.x,
        worldY: anchor.y,
        type: 'valid',
        latex: current,
        prevLatex: prev,
        socraticHint: socratic,
      })
    } else {
      result.push({
        id: `step-${i}`,
        worldX: anchor.x,
        worldY: anchor.y,
        type: 'discrepancy',
        errorType: check.reason,
        latex: current,
        prevLatex: prev,
        hint: check.hint,
        socraticHint: socratic,
      })
    }
  }

  return result
}

export function MarginFeedbackLayer({
  items: propItems,
  onToggleExpand,
}: MarginFeedbackLayerProps) {
  const [camera, setCamera] = useState(() => ({ ...inkyStore.camera }))
  const [activeTool, setActiveTool] = useState(inkyStore.activeTool)
  const [capsule, setCapsule] = useState(inkyStore.mathCapsule)
  const [stamps, setStamps] = useState(inkyStore.stamps)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return inkyStore.subscribe(() => {
      const c = inkyStore.camera
      setCamera((prev) => {
        if (prev.x !== c.x || prev.y !== c.y || prev.z !== c.z) {
          return { ...c }
        }
        return prev
      })
      setActiveTool(inkyStore.activeTool)
      setCapsule(inkyStore.mathCapsule ? { ...inkyStore.mathCapsule } : null)
      setStamps([...inkyStore.stamps])
    })
  }, [])

  // Auto-derived items when propItems is not supplied
  const autoItems = useMemo<MarginChipItem[]>(() => {
    if (propItems) return propItems

    const derived: MarginChipItem[] = []

    // 1. Math capsule: if an equation is circled/evaluated, place a margin chip to its right
    if (capsule?.latex) {
      let worldX = capsule.worldPosition.x + 160
      let worldY = capsule.worldPosition.y

      if (capsule.enclosedStrokeIds.length > 0) {
        const strokes = inkyStore.strokes.filter((s) => capsule.enclosedStrokeIds.includes(s.id))
        if (strokes.length > 0) {
          const maxX = Math.max(...strokes.map((s) => s.boundingBox.maxX))
          const minY = Math.min(...strokes.map((s) => s.boundingBox.minY))
          const maxY = Math.max(...strokes.map((s) => s.boundingBox.maxY))
          worldX = maxX + 28
          worldY = (minY + maxY) / 2
        }
      }

      const socratic = generateSocraticHint(capsule.latex)
      derived.push({
        id: 'capsule-step',
        worldX,
        worldY,
        type: 'valid',
        latex: capsule.latex,
        socraticHint: socratic,
      })
    }

    // 2. Stamps: if multiple equation stamps exist, evaluate consecutive steps
    const equationStamps = stamps
      .filter((s) => s.text.includes('='))
      .sort((a, b) => a.worldY - b.worldY)

    for (let i = 1; i < equationStamps.length; i++) {
      const prevStamp = equationStamps[i - 1]
      const currStamp = equationStamps[i]
      const bbox = stampBoundingBox(currStamp)
      const worldX = bbox.maxX + 28
      const worldY = currStamp.worldY + currStamp.fontSize * 0.45

      const check = checkEquationEquivalence(prevStamp.text, currStamp.text)
      const socratic = generateSocraticHint(currStamp.text)

      if (check.isValid) {
        derived.push({
          id: `stamp-step-${currStamp.id}`,
          worldX,
          worldY,
          type: 'valid',
          latex: currStamp.text,
          prevLatex: prevStamp.text,
          socraticHint: socratic,
        })
      } else {
        derived.push({
          id: `stamp-step-${currStamp.id}`,
          worldX,
          worldY,
          type: 'discrepancy',
          errorType: check.reason,
          latex: currStamp.text,
          prevLatex: prevStamp.text,
          hint: check.hint,
          socraticHint: socratic,
        })
      }
    }

    return derived
  }, [propItems, capsule, stamps])

  const items = propItems ?? autoItems

  // Dismiss expanded card on outside click or escape
  useEffect(() => {
    if (!expandedId) return

    const handlePointerDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setExpandedId(null)
        onToggleExpand?.(expandedId, false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedId(null)
        onToggleExpand?.(expandedId, false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [expandedId, onToggleExpand])

  const toggleExpand = (id: string) => {
    const next = expandedId === id ? null : id
    setExpandedId(next)
    onToggleExpand?.(id, next === id)
  }

  const isDrawing = activeTool === 'draw'

  return (
    <div
      data-testid="margin-feedback-layer"
      className="inky-ui pointer-events-none absolute inset-0 z-15 overflow-hidden"
    >
      <style>{`
        @keyframes marginChipSpring {
          0% {
            opacity: 0;
            transform: translateY(-50%) scale(0.85);
          }
          100% {
            opacity: 1;
            transform: translateY(-50%) scale(1);
          }
        }
        @keyframes socraticCardIn {
          0% {
            opacity: 0;
            transform: scale(0.95);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-margin-spring {
          animation: marginChipSpring 360ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-card-in {
          animation: socraticCardIn 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: left center;
        }
      `}</style>

      {items.map((item) => {
        const [screenX, screenY] = toScreen(item.worldX, item.worldY, camera)
        const isExpanded = expandedId === item.id

        return (
          <div key={item.id}>
            {/* The Tactile Chip */}
            <button
              type="button"
              data-testid={`margin-chip-${item.id}`}
              aria-label={
                item.type === 'valid'
                  ? 'Step verified: correct'
                  : `Derivation discrepancy: ${getErrorBadgeLabel(item.errorType)}`
              }
              aria-expanded={isExpanded}
              disabled={isDrawing}
              onClick={() => toggleExpand(item.id)}
              style={{
                left: `${screenX}px`,
                top: `${screenY}px`,
              }}
              className={`absolute animate-margin-spring transition-transform duration-100 ease-out select-none flex items-center font-sans ${
                isDrawing
                  ? 'pointer-events-none opacity-40'
                  : 'pointer-events-auto cursor-pointer hover:scale-105 active:scale-95'
              } ${
                item.type === 'valid'
                  ? 'w-6 h-6 justify-center rounded-full bg-emerald-50/95 text-emerald-700 border border-emerald-300/80 shadow-xs'
                  : 'h-7 px-2.5 gap-1.5 rounded-full bg-amber-50/95 text-amber-800 border border-amber-300/80 shadow-xs text-xs font-semibold tracking-tight'
              }`}
            >
              {item.type === 'valid' ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                  <span className="sr-only">✓</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>{getErrorBadgeLabel(item.errorType)}</span>
                </>
              )}
            </button>

            {/* Expandable Socratic Guidance Card */}
            {isExpanded && (
              <div
                ref={cardRef}
                data-testid="socratic-guidance-card"
                style={{
                  left: `${screenX + 36}px`,
                  top: `${screenY}px`,
                }}
                className="animate-card-in pointer-events-auto absolute -translate-y-1/2 w-72 rounded-2xl bg-white/95 backdrop-blur-md border border-stone-200/90 shadow-xl shadow-stone-900/10 p-4 z-30 select-text"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      item.type === 'valid'
                        ? 'bg-emerald-100/80 text-emerald-800 border border-emerald-200/60'
                        : 'bg-amber-100/80 text-amber-900 border border-amber-200/60'
                    }`}
                  >
                    {item.type === 'valid' ? (
                      <>
                        <Check className="w-3 h-3 stroke-[2.5]" />
                        <span>Step Verified</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3 text-amber-700" />
                        <span>{getErrorBadgeLabel(item.errorType)}</span>
                      </>
                    )}
                  </span>

                  <button
                    type="button"
                    aria-label="Close guidance"
                    onClick={() => toggleExpand(item.id)}
                    className="p-1 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 active:scale-95 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Primary Feedback / Explanation */}
                <div className="text-xs text-stone-700 font-normal leading-relaxed mb-3">
                  {item.hint ? (
                    <p>{item.hint}</p>
                  ) : item.type === 'valid' ? (
                    <p>This line follows algebraically from the previous step.</p>
                  ) : (
                    <p>A discrepancy was detected in this derivation step.</p>
                  )}
                </div>

                {/* Socratic Prompt & Pedagogical Next Move */}
                {item.socraticHint && (
                  <div className="rounded-xl bg-stone-50 border border-stone-200/60 p-2.5 space-y-2">
                    <div className="flex items-start gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-stone-900 font-medium leading-snug">
                        {item.socraticHint.socraticPrompt}
                      </div>
                    </div>

                    {item.socraticHint.operation && (
                      <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-mono">
                        <span className="text-stone-400">Move:</span>
                        <span className="font-semibold text-stone-700">
                          {item.socraticHint.operation}
                        </span>
                      </div>
                    )}

                    {item.socraticHint.expectedNextForm && (
                      <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-mono">
                        <span className="text-stone-400">Target:</span>
                        <span className="font-semibold text-stone-800 bg-white px-1.5 py-0.5 rounded border border-stone-200/80">
                          {item.socraticHint.expectedNextForm}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
