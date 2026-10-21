import katex from 'katex'
import 'katex/dist/katex.min.css'
import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toScreen } from '../../lib/canvas/coordinates'
import { inkyStore } from '../../lib/canvas/store'
import { solveMath } from '../../lib/math/math-solver'
import { synthesizeHandwrittenStrokes } from '../../lib/math/math-to-strokes'

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
  const pillRef = useRef<HTMLDivElement>(null)
  // Offset that keeps the pill inside the viewport when anchored near an edge.
  const [edgeOffset, setEdgeOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    return inkyStore.subscribe(() => {
      setCapsule(inkyStore.mathCapsule)
      setCamera({ ...inkyStore.camera })
    })
  }, [])

  // Derived anchor, memoized so the clamp effect isn't re-fired every render.
  const screen = useMemo(() => {
    return capsule
      ? toScreen(capsule.worldPosition.x, capsule.worldPosition.y, camera)
      : ([0, 0] as const)
  }, [capsule, camera])

  // Clamp the pill (and flip it below the anchor) when it would overflow
  // the viewport — a capsule half off-screen is unreachable.
  useLayoutEffect(() => {
    if (!capsule || !pillRef.current) return
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
  }, [capsule, screen])

  if (!capsule) return null

  const [screenX, screenY] = screen

  const handleAction = (e: React.MouseEvent, action: 'solve' | 'factor' | 'simplify') => {
    e.stopPropagation()
    const solution = solveMath(capsule.latex, action)
    if (!solution?.resultLatex) return

    // Find bounding box of enclosed strokes to place answer to the right
    const enclosedStrokes = inkyStore.strokes.filter((s) =>
      capsule.enclosedStrokeIds.includes(s.id),
    )
    let maxX = capsule.worldPosition.x + 100
    let centerY = capsule.worldPosition.y
    if (enclosedStrokes.length > 0) {
      maxX = Math.max(...enclosedStrokes.map((s) => s.boundingBox.maxX))
      const minY = Math.min(...enclosedStrokes.map((s) => s.boundingBox.minY))
      const maxY = Math.max(...enclosedStrokes.map((s) => s.boundingBox.maxY))
      centerY = (minY + maxY) / 2
    }

    // Synthesize realistic handwritten strokes for the result
    const textToStamp = action === 'solve' ? solution.plainText : solution.resultLatex
    const newStrokes = synthesizeHandwrittenStrokes(
      textToStamp,
      maxX + 30,
      centerY - 18,
      36,
      inkyStore.strokeColor,
      inkyStore.strokeSize,
    )

    // Add directly to inkyStore canvas
    for (const s of newStrokes) {
      inkyStore.addStroke(s)
    }

    // Select the new answer strokes and dismiss capsule
    inkyStore.selectStrokes(newStrokes.map((s) => s.id))
    inkyStore.setMathCapsule(null)
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
        className="inky-capsule-in bg-[#111111]/90 backdrop-blur-md text-white border border-white/10 shadow-2xl rounded-2xl px-3 py-2 flex items-center gap-3 max-w-[min(60vw,420px)]"
      >
        {/* Formula typography — key on latex so upgrades crossfade in place */}
        <span key={capsule.latex} title={capsule.latex} className="min-w-0 flex-1 truncate">
          <span className="inky-capsule-swap inline-block max-w-full align-middle">
            {renderFormula(capsule.latex)}
          </span>
        </span>

        <div className="w-[1px] h-4 bg-white/20 shrink-0" />

        {/* Clean Apple-style Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => handleAction(e, 'solve')}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white text-[#111111] hover:bg-stone-200 active:scale-95 transition-[transform,background-color] duration-150 cursor-pointer"
          >
            Solve
          </button>
          <button
            type="button"
            onClick={(e) => handleAction(e, 'factor')}
            className="text-xs font-medium px-2 py-1 rounded-lg text-stone-300 hover:text-white hover:bg-white/10 active:scale-95 transition-[transform,background-color,color] duration-150 cursor-pointer"
          >
            Factor
          </button>
          <button
            type="button"
            onClick={(e) => handleAction(e, 'simplify')}
            className="text-xs font-medium px-2 py-1 rounded-lg text-stone-300 hover:text-white hover:bg-white/10 active:scale-95 transition-[transform,background-color,color] duration-150 cursor-pointer"
          >
            Simplify
          </button>
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
