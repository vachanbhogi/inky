import { useEffect, useMemo, useState } from 'react'
import { validateCapsuleIntegrity } from '../../lib/canvas/capsule-integrity'
import { toScreen } from '../../lib/canvas/coordinates'
import { charBoundingBox, inkyStore } from '../../lib/canvas/store'
import { boardCatalog } from '../../lib/document/boardCatalog'
import { checkMultiLineWork, groupIntoHorizontalLines } from '../../lib/math/line-grouper'
import { type CoachingMethod, generateSocraticHint } from '../../lib/math/step-checker'
import { recognizeFormulaStrokes } from '../../lib/math/stroke-recognizer'
import { computeWritingMetrics } from './MathActionCapsule'

const MARGIN_WORLD_X = 428

const CYCLE_METHODS: { method: CoachingMethod; label: string }[] = [
  { method: 'completing-the-square', label: 'Completing the Square' },
  { method: 'factoring', label: 'Factoring' },
  { method: 'quadratic-formula', label: 'Quadratic Formula' },
  { method: 'auto', label: 'Step Coach' },
]

function getMethodLabel(method: CoachingMethod): string {
  switch (method) {
    case 'completing-the-square':
      return 'Completing the Square'
    case 'factoring':
      return 'Factoring'
    case 'quadratic-formula':
      return 'Quadratic Formula'
    case 'linear-balancing':
      return 'Linear Equations'
    case 'systems':
      return 'Systems'
    default:
      return 'Step Coach'
  }
}

export function SocraticMarginCoach() {
  const [capsule, setCapsule] = useState(inkyStore.mathCapsule)
  const [camera, setCamera] = useState(inkyStore.camera)
  const [worksheetMethod, setWorksheetMethod] = useState<CoachingMethod>(
    () => boardCatalog.getActiveBoard()?.worksheetMethod ?? 'auto',
  )

  useEffect(() => {
    const syncBoard = () => {
      setWorksheetMethod(boardCatalog.getActiveBoard()?.worksheetMethod ?? 'auto')
    }
    syncBoard()
    const unsubCatalog = boardCatalog.subscribe(syncBoard)
    const unsubStore = inkyStore.subscribe(() => {
      const next = inkyStore.mathCapsule
      if (!validateCapsuleIntegrity(next, inkyStore.strokes, inkyStore.stamps)) {
        return
      }
      setCapsule(next)
      setCamera((prev) => {
        const c = inkyStore.camera
        return prev.x === c.x && prev.y === c.y && prev.z === c.z ? prev : { ...c }
      })
    })
    return () => {
      unsubCatalog()
      unsubStore()
    }
  }, [])

  const activeMethod: CoachingMethod =
    boardCatalog.getActiveBoard()?.worksheetMethod ?? worksheetMethod

  const multiLineResult = useMemo(() => {
    if (!capsule || capsule.mlPending) return null
    const rawLines = capsule.latex
      .split(/\n|\\\\/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (rawLines.length >= 2) {
      return checkMultiLineWork(rawLines)
    }

    const enclosedStrokes = inkyStore.strokes.filter((s) =>
      capsule.enclosedStrokeIds.includes(s.id),
    )
    const enclosedChars = capsule.enclosedCharIds
      ? inkyStore.stamps
          .flatMap((s) => s.chars)
          .filter((c) => capsule.enclosedCharIds?.includes(c.id))
      : []

    const lineGroups = groupIntoHorizontalLines(enclosedStrokes, enclosedChars)
    if (lineGroups.length >= 2) {
      const groupLines = lineGroups
        .map((g) => {
          if (g.charIds.length > 0) {
            const stamp = inkyStore.stamps.find((st) =>
              st.chars.some((ch) => g.charIds.includes(ch.id)),
            )
            if (stamp?.text) return stamp.text
          }
          const gStrokes = enclosedStrokes.filter((s) => g.strokeIds.includes(s.id))
          return recognizeFormulaStrokes(gStrokes)
        })
        .filter((l) => l.trim().length > 0)
      if (groupLines.length >= 2) {
        return checkMultiLineWork(groupLines)
      }
    }
    return null
  }, [capsule])

  const socraticHint = useMemo(() => {
    if (!capsule || capsule.mlPending) return null
    const directHint = generateSocraticHint(capsule.latex, { method: activeMethod })
    if (directHint) return directHint
    if (multiLineResult?.nextHint) return multiLineResult.nextHint
    const lines = capsule.latex
      .split(/\n|\\\\/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (lines.length >= 2) {
      return generateSocraticHint(lines[lines.length - 1], { method: activeMethod })
    }
    return null
  }, [capsule, activeMethod, multiLineResult])

  const anchorWorldY = useMemo(() => {
    if (!capsule) return 0
    const enclosedStrokes = inkyStore.strokes.filter((s) =>
      capsule.enclosedStrokeIds.includes(s.id),
    )
    const enclosedChars = capsule.enclosedCharIds
      ? inkyStore.stamps
          .flatMap((s) => s.chars)
          .filter((c) => capsule.enclosedCharIds?.includes(c.id))
      : []
    const boxes = [
      ...enclosedStrokes.map((s) => s.boundingBox),
      ...enclosedChars.map(charBoundingBox),
    ]
    if (boxes.length === 0) return capsule.worldPosition.y
    const minY = Math.min(...boxes.map((b) => b.minY))
    const maxY = Math.max(...boxes.map((b) => b.maxY))
    return (minY + maxY) / 2
  }, [capsule])

  const screenPos = useMemo(() => {
    if (!capsule) return [0, 0] as const
    const isWorksheet = boardCatalog.getActiveBoard()?.type === 'worksheet'
    const enclosedStrokes = inkyStore.strokes.filter((s) =>
      capsule.enclosedStrokeIds.includes(s.id),
    )
    const enclosedChars = capsule.enclosedCharIds
      ? inkyStore.stamps
          .flatMap((s) => s.chars)
          .filter((c) => capsule.enclosedCharIds?.includes(c.id))
      : []
    const boxes = [
      ...enclosedStrokes.map((s) => s.boundingBox),
      ...enclosedChars.map(charBoundingBox),
    ]
    const maxX =
      boxes.length > 0 ? Math.max(...boxes.map((b) => b.maxX)) : capsule.worldPosition.x + 80
    const worldX = isWorksheet ? MARGIN_WORLD_X : Math.max(MARGIN_WORLD_X, maxX + 32)
    return toScreen(worldX, anchorWorldY, camera)
  }, [capsule, anchorWorldY, camera])

  if (!capsule || capsule.mlPending) return null
  if (!socraticHint && !multiLineResult?.isMultiLine) return null

  const methodLabel = getMethodLabel(activeMethod)
  const [rawScreenX, rawScreenY] = screenPos
  const vw = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 800
  const clampedX = Math.max(12, Math.min(vw - 296, rawScreenX))
  const clampedY = Math.max(64, Math.min(vh - 200, rawScreenY - 40))

  const handleCycleMethod = (e: React.MouseEvent) => {
    e.stopPropagation()
    const currentIdx = CYCLE_METHODS.findIndex((m) => m.method === activeMethod)
    const nextItem = CYCLE_METHODS[(currentIdx + 1) % CYCLE_METHODS.length]
    boardCatalog.setActiveBoardMethod(nextItem.method, nextItem.label)
    setWorksheetMethod(nextItem.method)
  }

  const handleStampGuidedStep = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!socraticHint) return
    const enclosedStrokes = inkyStore.strokes.filter((s) =>
      capsule.enclosedStrokeIds.includes(s.id),
    )
    const enclosedChars = capsule.enclosedCharIds
      ? inkyStore.stamps
          .flatMap((s) => s.chars)
          .filter((c) => capsule.enclosedCharIds?.includes(c.id))
      : []
    const strokeBoxes = enclosedStrokes.map((s) => s.boundingBox)
    const charBoxes = enclosedChars.map(charBoundingBox)
    const charFontSizes = enclosedChars.map((c) => c.fontSize)
    const metrics = computeWritingMetrics(
      strokeBoxes,
      charBoxes,
      charFontSizes,
      capsule.worldPosition,
    )

    inkyStore.stampResult({
      text: socraticHint.expectedNextForm,
      worldX: metrics.hintWorldX,
      worldY: metrics.hintWorldY,
      color: '#2563eb',
      fontSize: metrics.fontSize,
    })
  }

  return (
    <aside
      aria-label="Socratic Margin Coach"
      className="inky-ui inky-capsule-in absolute z-30 w-[280px] bg-[#fbfbfa] text-[#111111] border border-black/8 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.03)] p-3.5 flex flex-col gap-2.5 pointer-events-auto"
      style={{
        left: `${clampedX}px`,
        top: `${clampedY}px`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Active Method Badge & Cycle Control */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleCycleMethod}
          aria-label={`Coaching method: ${methodLabel}. Click to cycle method`}
          title="Cycle coaching method"
          className="min-h-[40px] w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-white border border-black/8 hover:border-black/20 text-xs font-semibold text-[#111111] transition-[transform,background-color,border-color] duration-150 active:scale-[0.98] cursor-pointer"
        >
          <span className="truncate">{methodLabel}</span>
          <span className="text-[11px] font-medium text-[#787774] shrink-0 ml-2">Switch</span>
        </button>
      </div>

      {/* Multi-line step check diagnostic banner */}
      {multiLineResult?.isMultiLine && (
        <div
          className={`px-3 py-2 rounded-xl text-xs font-medium border ${
            multiLineResult.allValid
              ? 'bg-emerald-50/90 text-emerald-900 border-emerald-500/20'
              : 'bg-amber-50/90 text-amber-900 border-amber-500/25'
          }`}
        >
          {multiLineResult.allValid
            ? 'All steps valid'
            : `Line ${(multiLineResult.errorLineIndex ?? 1) + 1}: ${multiLineResult.diagnosticMessage}`}
        </div>
      )}

      {/* Socratic Guiding Question & Operation */}
      {socraticHint && (
        <>
          <div className="flex flex-col gap-1 px-0.5">
            <p className="text-xs font-medium text-[#111111] leading-relaxed">
              {socraticHint.socraticPrompt}
            </p>
            <p className="text-[11px] font-medium text-[#787774]">{socraticHint.operation}</p>
          </div>

          <button
            type="button"
            onClick={handleStampGuidedStep}
            aria-label="Stamp Guided Step"
            className="min-h-[40px] w-full px-3 py-2 rounded-xl bg-[#111111] hover:bg-[#2a2a2a] text-white text-xs font-semibold transition-[transform,background-color] duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-center"
          >
            Stamp Guided Step
          </button>
        </>
      )}
    </aside>
  )
}
