import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Check, Copy, Delete, Keyboard, LineChart, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { type FunctionPlot, isGraphableExpression, plotFunction } from '../../lib/math/graph-engine'

interface CoordinateCenter {
  x: number
  y: number
}

const DEFAULT_CENTER: CoordinateCenter = { x: 0, y: 0 }
const DEFAULT_ZOOM = 22 // 22 pixels per unit -> 10 units = 220px (isometric square grid)

const PRESETS = [
  { label: 'y = 2x + 1', formula: 'y = 2x + 1' },
  { label: 'y = x² - 4', formula: 'y = x^2 - 4' },
  { label: 'y = sin(x)', formula: 'y = sin(x)' },
  { label: 'y = |x|', formula: 'y = abs(x)' },
  { label: 'y = 1/x', formula: 'y = 1/x' },
  { label: 'y = x³ - 3x', formula: 'y = x^3 - 3x' },
]

function formatCoord(val: number): string {
  if (Math.abs(val) < 1e-9) return '0'
  return Number(val.toFixed(3)).toString()
}

function renderKatexFormula(formula: string): string {
  const clean = formula.trim().replace(/^\$+|\$+$/g, '')
  if (!clean) return ''
  try {
    return katex.renderToString(clean, {
      throwOnError: false,
      displayMode: false,
    })
  } catch {
    return clean
  }
}

export function GraphSidebar() {
  const [sidebarState, setSidebarState] = useState(inkyStore.graphSidebar)
  const [rawInput, setRawInput] = useState(sidebarState.equation)
  const [center, setCenter] = useState<CoordinateCenter>(DEFAULT_CENTER)
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)
  const [showKeypad, setShowKeypad] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activePoint, setActivePoint] = useState<{
    x: number
    y: number
    label: string
  } | null>(null)
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number
    y: number
    label: string
  } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isDraggingRef = useRef(false)
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    return inkyStore.subscribe(() => {
      const next = inkyStore.graphSidebar
      setSidebarState({ ...next })
      setRawInput(next.equation)
    })
  }, [])

  // Auto-center or adjust zoom on receiving new equation
  useEffect(() => {
    if (!sidebarState.equation) return
    const initialPlot = plotFunction(sidebarState.equation, {
      xMin: -10,
      xMax: 10,
      samples: 100,
    })
    if (initialPlot) {
      if (initialPlot.vertex) {
        setCenter({
          x: Math.round(initialPlot.vertex.x),
          y: Math.round(initialPlot.vertex.y),
        })
      } else if (initialPlot.yIntercept) {
        setCenter({ x: 0, y: Math.round(initialPlot.yIntercept.y / 2) })
      } else {
        setCenter(DEFAULT_CENTER)
      }
      setZoom(DEFAULT_ZOOM)
    }
  }, [sidebarState.equation])

  const isValid = useMemo(() => isGraphableExpression(rawInput), [rawInput])

  // Compute view bounds from isometric zoom and center
  const bounds = useMemo(() => {
    const width = 420
    const height = 400
    const halfW = width / 2 / zoom
    const halfH = height / 2 / zoom
    return {
      xMin: center.x - halfW,
      xMax: center.x + halfW,
      yMin: center.y - halfH,
      yMax: center.y + halfH,
    }
  }, [center, zoom])

  const plotData: FunctionPlot | null = useMemo(() => {
    if (!isValid) return null
    return plotFunction(rawInput, {
      xMin: bounds.xMin,
      xMax: bounds.xMax,
      yMin: bounds.yMin,
      yMax: bounds.yMax,
      samples: 400,
      width: 420,
      height: 400,
    })
  }, [rawInput, isValid, bounds])

  const keyPoints = useMemo(() => {
    if (!plotData) return []
    const pts: { x: number; y: number; label: string }[] = []
    for (const root of plotData.xIntercepts) {
      pts.push({
        x: root.x,
        y: root.y,
        label: `(${formatCoord(root.x)}, 0)`,
      })
    }
    const yInt = plotData.yIntercept
    if (yInt) {
      const isDup = pts.some((p) => Math.abs(p.x - 0) < 1e-4 && Math.abs(p.y - yInt.y) < 1e-4)
      if (!isDup) {
        pts.push({
          x: yInt.x,
          y: yInt.y,
          label: `(0, ${formatCoord(yInt.y)})`,
        })
      }
    }
    const v = plotData.vertex
    if (v) {
      const isDup = pts.some((p) => Math.abs(p.x - v.x) < 1e-4 && Math.abs(p.y - v.y) < 1e-4)
      if (!isDup) {
        pts.push({
          x: v.x,
          y: v.y,
          label: `(${formatCoord(v.x)}, ${formatCoord(v.y)})`,
        })
      }
    }
    return pts
  }, [plotData])

  const renderedKatex = useMemo(() => {
    return renderKatexFormula(rawInput || '')
  }, [rawInput])

  // Desmos-Quality Isometric Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth || 420
    const height = canvas.clientHeight || 400

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
    }

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    // Pure crisp white coordinate plane
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    // Isometric world to screen coordinate mappings
    const halfW = width / 2
    const halfH = height / 2
    const toScreenX = (wx: number) => halfW + (wx - center.x) * zoom
    const toScreenY = (wy: number) => halfH - (wy - center.y) * zoom

    const xMin = center.x - halfW / zoom
    const xMax = center.x + halfW / zoom
    const yMin = center.y - halfH / zoom
    const yMax = center.y + halfH / zoom

    // Step calculation for 1:1 isometric grid
    const targetPx = 80
    const rawStep = targetPx / zoom
    const mag = 10 ** Math.floor(Math.log10(rawStep))
    const norm = rawStep / mag

    let majorStep = 1 * mag
    let minorDivs = 5
    if (norm < 1.5) {
      majorStep = 1 * mag
      minorDivs = 5
    } else if (norm < 3.5) {
      majorStep = 2 * mag
      minorDivs = 4
    } else if (norm < 7.5) {
      majorStep = 5 * mag
      minorDivs = 5
    } else {
      majorStep = 10 * mag
      minorDivs = 5
    }
    const minorStep = majorStep / minorDivs

    // 1. Minor Grid Lines (0.75px #e6e8eb)
    ctx.strokeStyle = '#e6e8eb'
    ctx.lineWidth = 0.75
    ctx.beginPath()

    const firstMinorX = Math.floor(xMin / minorStep) * minorStep
    for (let gx = firstMinorX; gx <= xMax; gx += minorStep) {
      const sx = toScreenX(gx)
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, height)
    }

    const firstMinorY = Math.floor(yMin / minorStep) * minorStep
    for (let gy = firstMinorY; gy <= yMax; gy += minorStep) {
      const sy = toScreenY(gy)
      ctx.moveTo(0, sy)
      ctx.lineTo(width, sy)
    }
    ctx.stroke()

    // 2. Major Grid Lines (1px #c4c8d0)
    ctx.strokeStyle = '#c4c8d0'
    ctx.lineWidth = 1
    ctx.beginPath()

    const firstMajorX = Math.floor(xMin / majorStep) * majorStep
    for (let gx = firstMajorX; gx <= xMax; gx += majorStep) {
      const sx = toScreenX(gx)
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, height)
    }

    const firstMajorY = Math.floor(yMin / majorStep) * majorStep
    for (let gy = firstMajorY; gy <= yMax; gy += majorStep) {
      const sy = toScreenY(gy)
      ctx.moveTo(0, sy)
      ctx.lineTo(width, sy)
    }
    ctx.stroke()

    // 3. Main Coordinate Axes (x=0, y=0)
    const originX = toScreenX(0)
    const originY = toScreenY(0)

    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    if (originY >= 0 && originY <= height) {
      ctx.moveTo(0, originY)
      ctx.lineTo(width, originY)
    }
    if (originX >= 0 && originX <= width) {
      ctx.moveTo(originX, 0)
      ctx.lineTo(originX, height)
    }
    ctx.stroke()

    // 4. Axis Labels
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillStyle = '#111827'
    ctx.textBaseline = 'middle'

    // X-axis numbers
    for (let gx = firstMajorX; gx <= xMax; gx += majorStep) {
      if (Math.abs(gx) < 1e-9) continue
      const sx = toScreenX(gx)
      const sy = Math.min(Math.max(originY + 14, 14), height - 8)
      ctx.textAlign = 'center'
      ctx.fillText(formatCoord(gx), sx, sy)
    }

    // Y-axis numbers
    for (let gy = firstMajorY; gy <= yMax; gy += majorStep) {
      if (Math.abs(gy) < 1e-9) continue
      const sy = toScreenY(gy)
      const sx = Math.min(Math.max(originX - 6, 26), width - 6)
      ctx.textAlign = 'right'
      ctx.fillText(formatCoord(gy), sx, sy)
    }

    // Origin '0'
    if (originX >= 0 && originX <= width && originY >= 0 && originY <= height) {
      const sx = Math.min(Math.max(originX - 6, 12), width - 12)
      const sy = Math.min(Math.max(originY + 12, 12), height - 6)
      ctx.textAlign = 'right'
      ctx.fillText('0', sx, sy)
    }

    // 5. Function Curve (Signature Crimson Red #c74440)
    if (plotData && plotData.segments.length > 0) {
      ctx.strokeStyle = '#c74440'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (const segment of plotData.segments) {
        if (segment.length === 0) continue
        ctx.beginPath()
        ctx.moveTo(toScreenX(segment[0].x), toScreenY(segment[0].y))
        for (let i = 1; i < segment.length; i++) {
          ctx.lineTo(toScreenX(segment[i].x), toScreenY(segment[i].y))
        }
        ctx.stroke()
      }

      // 6. Distinct Grey Intercept Points (Roots & Y-intercept)
      for (const pt of keyPoints) {
        const sx = toScreenX(pt.x)
        const sy = toScreenY(pt.y)
        if (sx >= -10 && sx <= width + 10 && sy >= -10 && sy <= height + 10) {
          const isHighlighted =
            (hoveredPoint &&
              Math.abs(hoveredPoint.x - pt.x) < 1e-4 &&
              Math.abs(hoveredPoint.y - pt.y) < 1e-4) ||
            (activePoint &&
              Math.abs(activePoint.x - pt.x) < 1e-4 &&
              Math.abs(activePoint.y - pt.y) < 1e-4)

          ctx.fillStyle = isHighlighted ? '#1e2022' : '#a0a0a0'
          ctx.beginPath()
          ctx.arc(sx, sy, isHighlighted ? 5.5 : 4.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // 7. Floating Coordinate Pill Tooltip
      const targetPoint = activePoint || hoveredPoint
      if (targetPoint) {
        const sx = toScreenX(targetPoint.x)
        const sy = toScreenY(targetPoint.y)

        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        const textWidth = ctx.measureText(targetPoint.label).width
        const pillW = textWidth + 14
        const pillH = 22
        const pillX = sx - pillW / 2
        const pillY = sy - 30

        ctx.fillStyle = '#1e2022'
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillW, pillH, 4)
        ctx.fill()

        // Pointer triangle
        ctx.beginPath()
        ctx.moveTo(sx - 4, pillY + pillH)
        ctx.lineTo(sx + 4, pillY + pillH)
        ctx.lineTo(sx, pillY + pillH + 4)
        ctx.closePath()
        ctx.fill()

        // Label Text
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(targetPoint.label, sx, pillY + pillH / 2)
      }
    }

    ctx.restore()
  }, [center, zoom, plotData, keyPoints, hoveredPoint, activePoint])

  if (!sidebarState.isOpen) return null

  const handlePointerDownCanvas = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Check if clicking a key point
    const halfW = (canvas.clientWidth || 420) / 2
    const halfH = (canvas.clientHeight || 400) / 2
    const toScreenX = (wx: number) => halfW + (wx - center.x) * zoom
    const toScreenY = (wy: number) => halfH - (wy - center.y) * zoom

    let clickedPoint: { x: number; y: number; label: string } | null = null
    for (const pt of keyPoints) {
      const dist = Math.hypot(toScreenX(pt.x) - mouseX, toScreenY(pt.y) - mouseY)
      if (dist < 12) {
        clickedPoint = pt
        break
      }
    }

    if (clickedPoint) {
      setActivePoint(activePoint?.label === clickedPoint.label ? null : clickedPoint)
      return
    }

    // Otherwise start panning
    isDraggingRef.current = true
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMoveCanvas = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    if (isDraggingRef.current && lastMousePosRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x
      const dy = e.clientY - lastMousePosRef.current.y
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }

      setCenter((prev) => ({
        x: prev.x - dx / zoom,
        y: prev.y + dy / zoom,
      }))
      return
    }

    // Hover inspection on key points
    const halfW = (canvas.clientWidth || 420) / 2
    const halfH = (canvas.clientHeight || 400) / 2
    const toScreenX = (wx: number) => halfW + (wx - center.x) * zoom
    const toScreenY = (wy: number) => halfH - (wy - center.y) * zoom

    let foundPoint: { x: number; y: number; label: string } | null = null
    for (const pt of keyPoints) {
      const dist = Math.hypot(toScreenX(pt.x) - mouseX, toScreenY(pt.y) - mouseY)
      if (dist < 12) {
        foundPoint = pt
        break
      }
    }

    setHoveredPoint(foundPoint)
  }

  const handlePointerUpCanvas = (_e: React.PointerEvent) => {
    isDraggingRef.current = false
    lastMousePosRef.current = null
  }

  const handleWheelCanvas = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setZoom((prev) => Math.max(2, Math.min(500, prev * factor)))
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(500, prev * 1.25))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(2, prev * 0.8))
  }

  const handleResetView = () => {
    setCenter(DEFAULT_CENTER)
    setZoom(DEFAULT_ZOOM)
    setActivePoint(null)
  }

  const handleClose = () => {
    inkyStore.closeGraphSidebar()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setRawInput(val)
    inkyStore.updateGraphedEquation(val)
  }

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const val = (e.target as HTMLInputElement).value
    setRawInput(val)
    inkyStore.updateGraphedEquation(val)
  }

  const handleClearFormula = () => {
    setRawInput('')
    inkyStore.updateGraphedEquation('')
    inputRef.current?.focus()
  }

  const handleCopyFormula = () => {
    if (!rawInput) return
    navigator.clipboard?.writeText(rawInput)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleApplyPreset = (formula: string) => {
    setRawInput(formula)
    inkyStore.updateGraphedEquation(formula)
    inputRef.current?.focus()
  }

  // Virtual Keypad Insertion Helper
  const handleKeypadPress = (textToInsert: string) => {
    const input = inputRef.current
    if (!input) {
      const nextVal = rawInput + textToInsert
      setRawInput(nextVal)
      inkyStore.updateGraphedEquation(nextVal)
      return
    }

    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const currentVal = input.value
    const nextVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end)
    const nextCursor = start + textToInsert.length

    setRawInput(nextVal)
    inkyStore.updateGraphedEquation(nextVal)

    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handleKeypadBackspace = () => {
    const input = inputRef.current
    if (!input) {
      const nextVal = rawInput.slice(0, -1)
      setRawInput(nextVal)
      inkyStore.updateGraphedEquation(nextVal)
      return
    }

    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const currentVal = input.value

    if (start !== end) {
      const nextVal = currentVal.substring(0, start) + currentVal.substring(end)
      setRawInput(nextVal)
      inkyStore.updateGraphedEquation(nextVal)
      requestAnimationFrame(() => {
        input.focus()
        input.setSelectionRange(start, start)
      })
      return
    }

    if (start <= 0) return
    const nextVal = currentVal.substring(0, start - 1) + currentVal.substring(start)
    setRawInput(nextVal)
    inkyStore.updateGraphedEquation(nextVal)

    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start - 1, start - 1)
    })
  }

  const handleCenterOnPoint = (pt: { x: number; y: number }) => {
    setCenter({ x: pt.x, y: pt.y })
    setActivePoint({
      x: pt.x,
      y: pt.y,
      label: `(${formatCoord(pt.x)}, ${formatCoord(pt.y)})`,
    })
  }

  return (
    <aside
      aria-label="Function Graph Sidebar"
      data-testid="graph-sidebar"
      className="inky-ui absolute top-0 right-0 h-full w-[440px] max-w-[95vw] bg-white border-l border-black/10 shadow-2xl flex flex-col z-40 select-none overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 1. Cohesive Header (Unified with Inky Command Bar / Navbar) */}
      <div className="flex items-center justify-between px-4 h-[52px] bg-white/95 backdrop-blur-xl border-b border-black/8 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/50 shadow-xs">
            <LineChart size={18} />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#111111] tracking-tight">Function Graph</h2>
            {isValid ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                Active
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                Draft
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Keypad Toggle Button */}
          <button
            type="button"
            onClick={() => setShowKeypad((prev) => !prev)}
            title={showKeypad ? 'Hide Math Keypad' : 'Show Math Keypad'}
            className={`p-2 rounded-xl text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer ${
              showKeypad ? 'bg-black/8 text-[#111111]' : ''
            }`}
          >
            <Keyboard size={17} />
          </button>

          {/* Reset View Button */}
          <button
            type="button"
            onClick={handleResetView}
            title="Reset View (1:1 Zoom)"
            className="p-2 rounded-xl text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw size={16} />
          </button>

          {/* Close Sidebar Button */}
          <button
            type="button"
            onClick={handleClose}
            title="Close Graph (Esc)"
            className="p-2 rounded-xl text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer ml-1"
            aria-label="Close graph sidebar"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* 2. Interactive Cartesian Coordinate Plane */}
      <div className="relative flex-1 bg-white min-h-[140px] overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid="graph-canvas"
          className="w-full h-full cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={handlePointerDownCanvas}
          onPointerMove={handlePointerMoveCanvas}
          onPointerUp={handlePointerUpCanvas}
          onPointerCancel={handlePointerUpCanvas}
          onWheel={handleWheelCanvas}
        />

        {/* Floating Canvas Controls (All functional!) */}
        <div className="absolute top-3 right-3 flex flex-col bg-white/95 backdrop-blur-md border border-black/10 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] overflow-hidden z-20">
          <button
            type="button"
            title="Zoom In (+)"
            onClick={handleZoomIn}
            className="p-2 text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={16} />
          </button>
          <div className="h-[1px] bg-black/6" />
          <button
            type="button"
            title="Zoom Out (−)"
            onClick={handleZoomOut}
            className="p-2 text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
          >
            <Minus size={16} />
          </button>
          <div className="h-[1px] bg-black/6" />
          <button
            type="button"
            title="Reset View"
            onClick={handleResetView}
            className="p-2 text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* 3. Elite Single-Equation Input Deck with Quality of Life Features */}
      <div className="p-3.5 bg-white border-t border-black/8 flex flex-col gap-2.5 shrink-0">
        {/* Main Equation Input Box */}
        <div className="flex items-center gap-2 px-3 py-2 bg-stone-50/80 rounded-xl border border-black/10 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
          {/* Wave Icon Badge */}
          <div className="w-6 h-6 rounded-lg bg-[#c74440] text-white flex items-center justify-center shrink-0 shadow-xs">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12c3-8 6-8 10 0s7 8 10 0" />
            </svg>
          </div>

          {/* Native Text Input with Monospace/Math Font */}
          <input
            ref={inputRef}
            id="graph-equation-input"
            type="text"
            value={rawInput}
            onChange={handleInputChange}
            onInput={handleInput}
            placeholder="e.g. y = 3x + 3 or y = x^2 - 4"
            className="flex-1 bg-transparent text-[15px] font-mono font-medium text-[#111111] focus:outline-none placeholder:text-stone-400 placeholder:font-sans"
            spellCheck={false}
            autoCapitalize="off"
          />

          {/* Action Buttons: Copy & Clear */}
          <div className="flex items-center gap-0.5 shrink-0">
            {rawInput.length > 0 && (
              <button
                type="button"
                onClick={handleCopyFormula}
                title={copied ? 'Copied!' : 'Copy formula'}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-black/5 transition-all cursor-pointer"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            )}

            {rawInput.length > 0 && (
              <button
                type="button"
                onClick={handleClearFormula}
                title="Clear expression"
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-black/5 transition-all cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Live KaTeX Math Preview or Helpful Syntax Guide */}
        <div className="px-1 min-h-[24px] flex items-center justify-between text-xs">
          {rawInput.trim() ? (
            isValid ? (
              <div className="flex items-center gap-2 overflow-x-auto text-[15px] text-[#111111]">
                <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wider font-sans">
                  Formula:
                </span>
                <span
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: safe KaTeX math rendering
                  dangerouslySetInnerHTML={{ __html: renderedKatex }}
                />
              </div>
            ) : (
              <span className="text-amber-700 font-medium">
                Enter an equation in x (e.g. y = 2x - 1)
              </span>
            )
          ) : (
            <span className="text-stone-400 font-sans">Type a formula or tap a preset below</span>
          )}
        </div>

        {/* Quick Function Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none">
          <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wider shrink-0 mr-1">
            Presets:
          </span>
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.formula}
              onClick={() => handleApplyPreset(p.formula)}
              className={`px-2 py-1 text-xs font-mono rounded-lg transition-all active:scale-95 cursor-pointer shrink-0 ${
                rawInput.trim() === p.formula
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Critical Intercepts & Vertex Points Chips */}
        {keyPoints.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5">
            <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wider shrink-0 mr-1">
              Points:
            </span>
            {keyPoints.map((pt) => (
              <button
                type="button"
                key={pt.label}
                onClick={() => handleCenterOnPoint(pt)}
                title="Click to center on point"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-stone-100 hover:bg-blue-50 hover:text-blue-700 text-stone-700 border border-stone-200/80 transition-colors cursor-pointer shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#c74440]" />
                {pt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. Touch/Mobile Virtual Math Keypad */}
      {showKeypad && (
        <div className="p-2.5 bg-stone-100/90 border-t border-black/8 grid grid-cols-8 gap-1.5 shrink-0 shadow-inner">
          {/* Row 1: Variables, Exponents, Brackets & Backspace */}
          <button
            type="button"
            onClick={() => handleKeypadPress('x')}
            className="h-9 rounded-lg bg-blue-50 text-blue-700 font-serif italic font-bold hover:bg-blue-100 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-blue-200/60"
          >
            x
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('y')}
            className="h-9 rounded-lg bg-blue-50 text-blue-700 font-serif italic font-bold hover:bg-blue-100 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-blue-200/60"
          >
            y
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('^2')}
            className="h-9 rounded-lg bg-white text-stone-800 font-medium hover:bg-stone-50 active:scale-95 transition-all text-xs shadow-2xs cursor-pointer border border-black/5"
          >
            x²
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('^')}
            className="h-9 rounded-lg bg-white text-stone-800 font-medium hover:bg-stone-50 active:scale-95 transition-all text-xs shadow-2xs cursor-pointer border border-black/5"
          >
            xʸ
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('sqrt(')}
            className="h-9 rounded-lg bg-white text-stone-800 font-medium hover:bg-stone-50 active:scale-95 transition-all text-xs shadow-2xs cursor-pointer border border-black/5"
          >
            √
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('(')}
            className="h-9 rounded-lg bg-white text-stone-800 font-medium hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            (
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(')')}
            className="h-9 rounded-lg bg-white text-stone-800 font-medium hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            )
          </button>
          <button
            type="button"
            onClick={handleKeypadBackspace}
            title="Backspace"
            className="h-9 rounded-lg bg-stone-200 text-stone-700 hover:bg-stone-300 active:scale-95 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
          >
            <Delete size={15} />
          </button>

          {/* Row 2: 7, 8, 9, ÷, sin, cos, tan, π */}
          <button
            type="button"
            onClick={() => handleKeypadPress('7')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            7
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('8')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            8
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('9')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            9
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' / ')}
            className="h-9 rounded-lg bg-stone-200/80 text-stone-800 font-semibold hover:bg-stone-300 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer"
          >
            ÷
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('sin(')}
            className="h-9 rounded-lg bg-white text-stone-700 font-mono text-xs hover:bg-stone-50 active:scale-95 transition-all shadow-2xs cursor-pointer border border-black/5"
          >
            sin
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('cos(')}
            className="h-9 rounded-lg bg-white text-stone-700 font-mono text-xs hover:bg-stone-50 active:scale-95 transition-all shadow-2xs cursor-pointer border border-black/5"
          >
            cos
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('tan(')}
            className="h-9 rounded-lg bg-white text-stone-700 font-mono text-xs hover:bg-stone-50 active:scale-95 transition-all shadow-2xs cursor-pointer border border-black/5"
          >
            tan
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('pi')}
            className="h-9 rounded-lg bg-white text-stone-800 font-serif hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            π
          </button>

          {/* Row 3: 4, 5, 6, ×, <, >, |x|, Clear */}
          <button
            type="button"
            onClick={() => handleKeypadPress('4')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            4
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('5')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            5
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('6')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            6
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' * ')}
            className="h-9 rounded-lg bg-stone-200/80 text-stone-800 font-semibold hover:bg-stone-300 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer"
          >
            ×
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('<')}
            className="h-9 rounded-lg bg-white text-stone-800 font-medium hover:bg-stone-50 active:scale-95 transition-all text-xs shadow-2xs cursor-pointer border border-black/5"
          >
            &lt;
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('>')}
            className="h-9 rounded-lg bg-white text-stone-800 font-medium hover:bg-stone-50 active:scale-95 transition-all text-xs shadow-2xs cursor-pointer border border-black/5"
          >
            &gt;
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('abs(')}
            className="h-9 rounded-lg bg-white text-stone-800 font-mono text-xs hover:bg-stone-50 active:scale-95 transition-all shadow-2xs cursor-pointer border border-black/5"
          >
            |a|
          </button>
          <button
            type="button"
            onClick={handleClearFormula}
            title="Clear All"
            className="h-9 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100 active:scale-95 transition-all text-xs shadow-2xs cursor-pointer border border-red-200/50"
          >
            AC
          </button>

          {/* Row 4: 1, 2, 3, −, 0, ., =, + */}
          <button
            type="button"
            onClick={() => handleKeypadPress('1')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('2')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            2
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('3')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            3
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' - ')}
            className="h-9 rounded-lg bg-stone-200/80 text-stone-800 font-semibold hover:bg-stone-300 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('0')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-semibold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('.')}
            className="h-9 rounded-lg bg-white text-[#111111] font-mono font-bold hover:bg-stone-50 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer border border-black/5"
          >
            .
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' = ')}
            className="h-9 rounded-lg bg-stone-200/80 text-stone-800 font-semibold hover:bg-stone-300 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer"
          >
            =
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' + ')}
            className="h-9 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-95 transition-all text-sm shadow-2xs cursor-pointer"
          >
            +
          </button>
        </div>
      )}

      {/* 5. Minimal Cohesive Footer */}
      <div className="py-2 bg-stone-50/80 text-center border-t border-black/6 shrink-0 flex items-center justify-between px-4">
        <span className="text-[11px] font-sans text-stone-400 select-none">
          Cartesian 1:1 isometric grid
        </span>
        <button
          type="button"
          onClick={() => setShowKeypad((prev) => !prev)}
          className="text-[11px] font-sans text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
        >
          {showKeypad ? 'Hide keypad' : 'Virtual keypad'}
        </button>
      </div>
    </aside>
  )
}
