import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { boardCatalog } from '../../lib/document/boardCatalog'
import { generatePedagogyLesson, generateSessionReview } from '../../lib/pedagogy/pedagogy-engine'

export function PedagogySheet() {
  const [sheetState, setSheetState] = useState(inkyStore.pedagogySheet)
  const [activeBoard, setActiveBoard] = useState(boardCatalog.getActiveBoard())

  useEffect(() => {
    const unsubStore = inkyStore.subscribe(() => {
      setSheetState(inkyStore.pedagogySheet)
    })
    const unsubCatalog = boardCatalog.subscribe(() => {
      setActiveBoard(boardCatalog.getActiveBoard())
    })
    return () => {
      unsubStore()
      unsubCatalog()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sheetState.isOpen) {
        inkyStore.closePedagogySheet()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sheetState.isOpen])

  const lesson = useMemo(() => {
    const method = activeBoard?.worksheetMethod ?? 'auto'
    const topic = activeBoard?.worksheetTopic
    return generatePedagogyLesson(method, topic)
  }, [activeBoard])

  const review = useMemo(() => {
    const topic = activeBoard?.worksheetTopic || lesson.title
    // Derivation & stamps check
    const stamps = inkyStore.stamps
    const hintsUsed = stamps
      .filter((s) => s.text.includes('=') || s.text.includes('+') || s.text.includes('-'))
      .map((s) => s.text)

    return generateSessionReview({
      topic,
      hintsUsed,
      stepErrors: inkyStore.sessionErrors,
      totalStamps: stamps.length,
    })
  }, [activeBoard, lesson.title, sheetState])

  if (!sheetState.isOpen) return null

  const isTeach = sheetState.mode === 'teach'

  return (
    <aside
      data-testid="pedagogy-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={isTeach ? 'Lesson Reference' : 'Session Review'}
      className="inky-ui fixed top-0 right-0 h-full w-[400px] max-w-[95vw] bg-white border-l border-black/8 shadow-2xl flex flex-col z-40 select-none overflow-hidden text-[#111111] animate-in fade-in slide-in-from-right duration-200"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 1. Apple-style clean header matching GraphSidebar */}
      <div className="flex items-center justify-between px-4 h-[44px] bg-white/95 backdrop-blur-md border-b border-black/6 shrink-0">
        <h2 className="text-[13px] font-medium text-[#111111] tracking-tight">
          {isTeach ? 'Method Reference' : 'Session Review'}
        </h2>
        <button
          type="button"
          onClick={() => inkyStore.closePedagogySheet()}
          aria-label="Close panel"
          title="Close (Esc)"
          className="w-7 h-7 rounded-md flex items-center justify-center text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Subheader Title */}
      <div className="px-5 py-3.5 bg-[#fbfbfa] border-b border-black/[0.04]">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
          {isTeach ? activeBoard?.worksheetTopic || 'Curriculum Focus' : 'Worksheet Derivation'}
        </div>
        <div className="text-sm font-semibold text-[#111111] mt-0.5">
          {isTeach ? lesson.title : review.headline}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">
        {isTeach ? (
          <>
            <p className="text-xs text-[#555555] leading-relaxed">{lesson.summary}</p>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#787774]">
                Steps
              </h3>
              {lesson.steps.map((step) => (
                <div
                  key={step.number}
                  className="p-3 rounded-xl bg-black/[0.02] border border-black/[0.04] space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-black/5 text-[#111111] text-[11px] font-semibold flex items-center justify-center">
                      {step.number}
                    </span>
                    <span className="font-medium text-xs text-[#111111]">{step.title}</span>
                  </div>
                  <p className="text-xs text-[#666666] pl-7 leading-normal">{step.detail}</p>
                  {step.latex && (
                    <div className="pl-7 pt-1 font-mono text-[11px] text-[#222222]">
                      <code>{step.latex}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-1 border-t border-black/[0.06]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#787774]">
                Worked Example
              </h3>
              <div className="p-3 rounded-xl bg-[#fbfbfa] border border-black/[0.06] space-y-2">
                <div className="text-xs font-semibold text-[#111111]">
                  Problem: <code className="font-mono text-xs">{lesson.workedExample.problem}</code>
                </div>
                <div className="space-y-1.5 pt-1">
                  {lesson.workedExample.solutionSteps.map((s, idx) => (
                    <div key={idx} className="text-xs flex items-baseline justify-between gap-2">
                      <span className="text-[#666666] text-[11px]">{s.description}</span>
                      <code className="font-mono text-[11px] text-[#111111] font-medium">
                        {s.latex}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Review Metrics */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-black/[0.02] border border-black/[0.04] text-center">
                <span className="text-lg font-semibold text-[#111111] block">
                  {review.metrics.stampedSteps}
                </span>
                <span className="text-[10px] text-[#787774] font-medium uppercase tracking-wide">
                  Steps Logged
                </span>
              </div>
              <div className="p-3 rounded-xl bg-black/[0.02] border border-black/[0.04] text-center">
                <span className="text-lg font-semibold text-[#111111] block">
                  {review.metrics.hintsRequested}
                </span>
                <span className="text-[10px] text-[#787774] font-medium uppercase tracking-wide">
                  Hints Used
                </span>
              </div>
              <div className="p-3 rounded-xl bg-black/[0.02] border border-black/[0.04] text-center">
                <span className="text-lg font-semibold text-[#111111] block">
                  {review.metrics.correctionsFlagged}
                </span>
                <span className="text-[10px] text-[#787774] font-medium uppercase tracking-wide">
                  Errors
                </span>
              </div>
            </div>

            {/* Observations */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#787774]">
                Derivation Observations
              </h3>
              <div className="space-y-2">
                {review.observations.map((obs, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-black/[0.02] border border-black/[0.04] text-xs text-[#444444] leading-relaxed"
                  >
                    {obs}
                  </div>
                ))}
              </div>
            </div>

            {/* Rule of thumb */}
            <div className="space-y-2 pt-1 border-t border-black/[0.06]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#787774]">
                Key Rule of Thumb
              </h3>
              <div className="p-3.5 rounded-xl bg-[#fbfbfa] border border-black/[0.06] text-xs text-[#222222] font-medium leading-relaxed">
                {review.ruleOfThumb}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-black/[0.06] bg-[#fbfbfa] flex items-center justify-end">
        <button
          type="button"
          onClick={() => inkyStore.closePedagogySheet()}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </aside>
  )
}
