import katex from 'katex'
import 'katex/dist/katex.min.css'
import {
  ChevronsDown,
  Folder,
  Keyboard,
  Minus,
  MoreHorizontal,
  Plus,
  Redo2,
  Settings,
  Undo2,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { type FunctionPlot, isGraphableExpression, plotFunction } from '../../lib/math/graph-engine'

interface CoordinateCenter {
  x: number
  y: number
}

const DEFAULT_CENTER: CoordinateCenter = { x: 0, y: 0 }
const DEFAULT_ZOOM = 20 // 20 pixels per unit -> 10 units = 200px (standard Desmos view)

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
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [center, setCenter] = useState<CoordinateCenter>(DEFAULT_CENTER)
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)
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
    const height = 460
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
      height: 460,
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
    return renderKatexFormula(rawInput || '3x + 3 = y')
  }, [rawInput])

  // Desmos Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth || 420
    const height = canvas.clientHeight || 460

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
    }

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    // Pure Desmos white background
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

    // Desmos Step Calculation for Square Grids
    const targetPx = 90
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

    // 1. Minor Grid Lines (Desmos light grey 0.75px)
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

    // 2. Major Grid Lines (Desmos medium grey 1px)
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

    // 4. Clean Axis Labels
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

    // 5. Function Curve (Desmos Signature Crimson Red #c74440)
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

          ctx.fillStyle = isHighlighted ? '#4b5563' : '#a0a0a0'
          ctx.beginPath()
          ctx.arc(sx, sy, isHighlighted ? 5.5 : 4.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // 7. Desmos Floating Coordinate Pill Tooltip
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
    const halfH = (canvas.clientHeight || 460) / 2
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
    const halfH = (canvas.clientHeight || 460) / 2
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

  return (
    <aside
      aria-label="Function Graph Sidebar"
      data-testid="graph-sidebar"
      className="inky-ui absolute top-0 right-0 h-full w-[420px] max-w-[90vw] bg-white border-l border-[#d1d5db] shadow-2xl flex flex-col z-40 select-none overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 1. Header Bar: Dark Charcoal, Folder, Title, Save Pill, Menu, Close */}
      <div className="flex items-center justify-between px-3 h-[42px] bg-[#1e2022] text-white shrink-0 border-b border-[#2d3135]">
        <div className="flex items-center gap-2">
          {/* Folder Icon Button with Tooltip */}
          <button
            type="button"
            title="Open File (cmd+o)"
            className="p-1.5 rounded text-stone-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Folder size={17} />
          </button>

          {/* Vertical divider */}
          <div className="w-[1px] h-4 bg-[#3d4248]" />

          {/* Graph Title */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-white/95 select-none hover:text-white cursor-pointer">
              Untitled Graph
            </span>
            <span className="sr-only">Function Graph</span>
          </div>

          {/* Save Button */}
          <button
            type="button"
            className="px-3 py-1 text-xs font-semibold text-white bg-[#2d70b3] hover:bg-[#3880c9] active:bg-[#25609c] rounded-md transition-colors cursor-pointer shadow-xs ml-1"
          >
            Save
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Triple-dots menu button */}
          <button
            type="button"
            title="Graph options"
            className="p-1 rounded-full text-stone-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <MoreHorizontal size={18} />
          </button>

          {/* Close Sidebar button */}
          <button
            type="button"
            onClick={handleClose}
            title="Close Graph (Esc)"
            className="p-1 ml-1 rounded-md text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close graph sidebar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 2. Interactive Coordinate Plane */}
      <div className="relative flex-1 bg-white min-h-[300px] overflow-hidden">
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

        {/* Floating Top-Right Controls (Wrench, Zoom In, Zoom Out) */}
        <div className="absolute top-3 right-3 flex flex-col bg-white border border-[#d1d5db] rounded-lg shadow-sm overflow-hidden z-20">
          <button
            type="button"
            title="Graph Settings"
            onClick={handleResetView}
            className="p-2 text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] transition-colors cursor-pointer"
          >
            <Wrench size={15} />
          </button>
          <div className="h-[1px] bg-[#e5e7eb]" />
          <button
            type="button"
            title="Zoom In"
            onClick={handleZoomIn}
            className="p-2 text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] transition-colors cursor-pointer"
          >
            <Plus size={15} />
          </button>
          <div className="h-[1px] bg-[#e5e7eb]" />
          <button
            type="button"
            title="Zoom Out"
            onClick={handleZoomOut}
            className="p-2 text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] transition-colors cursor-pointer"
          >
            <Minus size={15} />
          </button>
        </div>
      </div>

      {/* 3. Middle Action Toolbar (Between Canvas & Item List) */}
      <div className="h-[36px] px-3 bg-[#f9fafb] border-t border-b border-[#e5e7eb] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Add Expression"
            className="p-1.5 text-[#374151] hover:text-[#111827] hover:bg-black/5 rounded cursor-pointer transition-colors"
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            title="Show Keypad"
            className="p-1.5 text-[#4b5563] hover:text-[#111827] hover:bg-black/5 rounded cursor-pointer transition-colors"
          >
            <Keyboard size={15} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Undo (cmd+z)"
            className="p-1.5 text-[#4b5563] hover:text-[#111827] hover:bg-black/5 rounded cursor-pointer transition-colors"
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            title="Redo (cmd+shift+z)"
            className="p-1.5 text-[#9ca3af] hover:text-[#4b5563] hover:bg-black/5 rounded cursor-pointer transition-colors"
          >
            <Redo2 size={15} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Edit List"
            className="p-1.5 text-[#4b5563] hover:text-[#111827] hover:bg-black/5 rounded cursor-pointer transition-colors"
          >
            <Settings size={15} />
          </button>
          <button
            type="button"
            title="Hide List"
            className="p-1.5 text-[#4b5563] hover:text-[#111827] hover:bg-black/5 rounded cursor-pointer transition-colors"
          >
            <ChevronsDown size={16} />
          </button>
        </div>
      </div>

      {/* 4. Expression Item Deck */}
      <div className="bg-white flex flex-col shrink-0">
        {/* Row 1: Active Expression */}
        <div className="relative flex items-center min-h-[50px] bg-white border-b border-[#e5e7eb] px-1 py-1">
          {/* Left Active Selection Bar */}
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#2d70b3]" />

          {/* Row Number & Color Badge */}
          <div className="w-[44px] h-full flex flex-col items-center justify-center relative shrink-0">
            <span className="absolute top-1 left-2 text-[10px] font-sans font-medium text-gray-500">
              1
            </span>
            <div className="w-[26px] h-[26px] rounded-full bg-[#c74440] flex items-center justify-center text-white shadow-xs cursor-pointer hover:opacity-90 transition-opacity mt-1">
              <svg
                width="14"
                height="14"
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
          </div>

          {/* Math Formula Input & Typeset Display */}
          <label
            htmlFor="graph-equation-input"
            className={`flex-1 flex items-center justify-between ml-1 mr-2 px-3 py-1 bg-white border rounded-[3px] shadow-xs relative min-h-[38px] cursor-text transition-all ${
              isInputFocused ? 'border-[#2d70b3] ring-1 ring-[#2d70b3]' : 'border-[#2d70b3]'
            }`}
          >
            {/* Always mounted input for tests, typing, and syncing */}
            <input
              ref={inputRef}
              id="graph-equation-input"
              type="text"
              value={rawInput}
              onChange={handleInputChange}
              onInput={handleInput}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder="e.g. 3x + 3 = y"
              className={`flex-1 bg-transparent text-[16px] font-mono text-[#111827] focus:outline-none ${
                isInputFocused ? 'block' : 'sr-only'
              }`}
              spellCheck={false}
              autoCapitalize="off"
            />

            {/* KaTeX Typeset Formula (displayed when not actively typing) */}
            {!isInputFocused && (
              <div className="flex-1 flex items-center overflow-x-auto text-[17px] text-[#111827] select-none py-0.5">
                {rawInput.trim() ? (
                  <span
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: safe KaTeX math output
                    dangerouslySetInnerHTML={{ __html: renderedKatex }}
                  />
                ) : (
                  <span className="text-gray-400 font-sans text-sm italic">
                    Type an equation...
                  </span>
                )}
              </div>
            )}

            {/* Clear Button */}
            {rawInput.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleClearFormula()
                }}
                title="Clear Expression"
                className="ml-2 text-[#9ca3af] hover:text-[#4b5563] p-1 rounded hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </label>
        </div>

        {/* Row 2: Empty placeholder row */}
        <button
          type="button"
          className="relative flex items-center min-h-[44px] w-full bg-white border-b border-[#e5e7eb] px-1 py-1 cursor-pointer hover:bg-gray-50/50 transition-colors text-left"
          onClick={() => {
            setIsInputFocused(true)
            inputRef.current?.focus()
          }}
        >
          <div className="w-[44px] h-full flex flex-col items-center justify-center relative shrink-0">
            <span className="absolute top-1 left-2 text-[10px] font-sans font-medium text-gray-400">
              2
            </span>
          </div>
          <div className="flex-1" />
        </button>
      </div>

      {/* 5. Bottom Watermark Branding */}
      <div className="py-2.5 bg-white text-center border-t border-[#f0f0f0] shrink-0">
        <span className="text-[11px] font-sans text-gray-400 tracking-wider select-none">
          powered by inky
        </span>
      </div>
    </aside>
  )
}
