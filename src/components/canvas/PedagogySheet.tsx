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

      {/* Content — Flat Editorial Layout (No cards or SaaS boxes) */}
      <div className="flex-1 overflow-y-auto divide-y divide-black/[0.06] text-sm">
        {isTeach ? (
          <>
            <div className="p-5">
              <p className="text-xs text-[#555555] leading-relaxed">{lesson.summary}</p>
            </div>

            <div className="p-5 space-y-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
                Steps
              </h3>
              <ol className="space-y-4 list-none m-0 p-0">
                {lesson.steps.map((step) => (
                  <li key={step.number} className="flex gap-3 text-xs">
                    <span className="font-mono text-[11px] font-semibold text-[#787774] shrink-0 pt-0.5">
                      {String(step.number).padStart(2, '0')}.
                    </span>
                    <div className="space-y-1">
                      <div className="font-medium text-[#111111]">{step.title}</div>
                      <p className="text-[#666666] leading-relaxed">{step.detail}</p>
                      {step.latex && (
                        <div className="pt-0.5 font-mono text-[11px] text-[#111111]">
                          <code>{step.latex}</code>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="p-5 space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
                Worked Example
              </h3>
              <div className="space-y-2 text-xs">
                <div className="font-medium text-[#111111]">
                  Problem: <code className="font-mono">{lesson.workedExample.problem}</code>
                </div>
                <div className="space-y-1.5 pt-1 pl-3 border-l-2 border-black/10">
                  {lesson.workedExample.solutionSteps.map((s, idx) => (
                    <div key={idx} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-[#666666] text-[11px]">{s.description}</span>
                      <code className="font-mono text-[11px] text-[#111111] font-medium shrink-0">
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
            {/* Flat Inline Metrics (Hairline Columns, No Cards) */}
            <div className="grid grid-cols-3 divide-x divide-black/[0.06] bg-[#fbfbfa]/60 py-4 px-2">
              <div className="text-center px-2">
                <span className="text-xl font-medium tracking-tight text-[#111111] block">
                  {review.metrics.stampedSteps}
                </span>
                <span className="text-[10px] text-[#787774] uppercase tracking-wider mt-0.5 block">
                  Steps Logged
                </span>
              </div>
              <div className="text-center px-2">
                <span className="text-xl font-medium tracking-tight text-[#111111] block">
                  {review.metrics.hintsRequested}
                </span>
                <span className="text-[10px] text-[#787774] uppercase tracking-wider mt-0.5 block">
                  Hints Used
                </span>
              </div>
              <div className="text-center px-2">
                <span className={`text-xl font-medium tracking-tight block ${review.metrics.correctionsFlagged > 0 ? 'text-[#c74440]' : 'text-[#111111]'}`}>
                  {review.metrics.correctionsFlagged}
                </span>
                <span className="text-[10px] text-[#787774] uppercase tracking-wider mt-0.5 block">
                  Errors
                </span>
              </div>
            </div>

            {/* Observations (Clean editorial list, no card borders) */}
            <div className="p-5 space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
                Derivation Notes
              </h3>
              <div className="space-y-2.5">
                {review.observations.map((obs, idx) => (
                  <p key={idx} className="text-xs text-[#333333] leading-relaxed">
                    {obs}
                  </p>
                ))}
              </div>
            </div>

            {/* Rule of thumb (Clean pull-quote style, no rounded box) */}
            <div className="p-5 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
                Rule of Thumb
              </h3>
              <p className="text-xs text-[#111111] leading-relaxed pl-3 border-l-2 border-[#111111]/30 font-medium italic">
                "{review.ruleOfThumb}"
              </p>
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
