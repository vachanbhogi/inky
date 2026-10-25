import { Activity, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { type FunctionPlot, isGraphableExpression, plotFunction } from '../../lib/math/graph-engine'

interface GraphViewport {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

const DEFAULT_VIEWPORT: GraphViewport = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
}

export function GraphSidebar() {
  const [sidebarState, setSidebarState] = useState(inkyStore.graphSidebar)
  const [rawInput, setRawInput] = useState(sidebarState.equation)
  const [viewport, setViewport] = useState<GraphViewport>(DEFAULT_VIEWPORT)
  const [_hoveredPoint, _setHoveredPoint] = useState<{
    x: number
    y: number
    label: string
  } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    return inkyStore.subscribe(() => {
      const next = inkyStore.graphSidebar
      setSidebarState({ ...next })
      setRawInput(next.equation)
    })
  }, [])

  // Auto-fit initial viewport whenever a new equation is received
  useEffect(() => {
    if (!sidebarState.equation) return
    const initialPlot = plotFunction(sidebarState.equation, {
      xMin: -10,
      xMax: 10,
      samples: 100,
    })
    if (initialPlot) {
      const yMin = Math.max(-50, Math.min(-5, Math.floor(initialPlot.bounds.yMin - 2)))
      const yMax = Math.min(50, Math.max(5, Math.ceil(initialPlot.bounds.yMax + 2)))
      setViewport({
        xMin: -10,
        xMax: 10,
        yMin,
        yMax,
      })
    }
  }, [sidebarState.equation])

  const isValid = useMemo(() => isGraphableExpression(rawInput), [rawInput])

  const plotData: FunctionPlot | null = useMemo(() => {
    if (!isValid) return null
    return plotFunction(rawInput, {
      xMin: viewport.xMin,
      xMax: viewport.xMax,
      yMin: viewport.yMin,
      yMax: viewport.yMax,
      samples: 300,
      width: 360,
      height: 360,
    })
  }, [rawInput, isValid, viewport])

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth || 360
    const height = canvas.clientHeight || 360

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
    }

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    // Background
    ctx.fillStyle = '#fafaf9'
    ctx.fillRect(0, 0, width, height)

    const xSpan = viewport.xMax - viewport.xMin
    const ySpan = viewport.yMax - viewport.yMin

    const toScreenX = (wx: number) => ((wx - viewport.xMin) / xSpan) * width
    const toScreenY = (wy: number) => ((viewport.yMax - wy) / ySpan) * height

    // Draw Grid Lines
    const step = 10 ** Math.floor(Math.log10(xSpan / 5))
    const firstGridX = Math.floor(viewport.xMin / step) * step
    const firstGridY = Math.floor(viewport.yMin / step) * step

    ctx.lineWidth = 1
    ctx.font = '10px monospace'
    ctx.fillStyle = '#a8a29e'

    // Minor / Major vertical grid lines
    ctx.strokeStyle = '#e7e5e4'
    ctx.beginPath()
    for (let gx = firstGridX; gx <= viewport.xMax; gx += step) {
      const sx = toScreenX(gx)
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, height)
    }
    for (let gy = firstGridY; gy <= viewport.yMax; gy += step) {
      const sy = toScreenY(gy)
      ctx.moveTo(0, sy)
      ctx.lineTo(width, sy)
    }
    ctx.stroke()

    // Main Axes
    const originX = toScreenX(0)
    const originY = toScreenY(0)

    ctx.strokeStyle = '#78716c'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    // X Axis
    if (originY >= 0 && originY <= height) {
      ctx.moveTo(0, originY)
      ctx.lineTo(width, originY)
    }
    // Y Axis
    if (originX >= 0 && originX <= width) {
      ctx.moveTo(originX, 0)
      ctx.lineTo(originX, height)
    }
    ctx.stroke()

    // Axis Labels
    for (let gx = firstGridX; gx <= viewport.xMax; gx += step) {
      if (Math.abs(gx) < 1e-9) continue
      const sx = toScreenX(gx)
      const sy = Math.min(Math.max(originY + 12, 12), height - 4)
      ctx.fillText(Number(gx.toFixed(2)).toString(), sx - 6, sy)
    }

    for (let gy = firstGridY; gy <= viewport.yMax; gy += step) {
      if (Math.abs(gy) < 1e-9) continue
      const sy = toScreenY(gy)
      const sx = Math.min(Math.max(originX + 4, 4), width - 24)
      ctx.fillText(Number(gy.toFixed(2)).toString(), sx, sy + 3)
    }

    // Draw Function Curve
    if (plotData && plotData.segments.length > 0) {
      ctx.strokeStyle = '#2563eb'
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

      // Draw Key Points: Roots, Y-Intercept, Vertex
      // 1. Roots (red points)
      for (const root of plotData.xIntercepts) {
        const sx = toScreenX(root.x)
        const sy = toScreenY(root.y)
        if (sx >= -5 && sx <= width + 5 && sy >= -5 && sy <= height + 5) {
          ctx.fillStyle = '#dc2626'
          ctx.beginPath()
          ctx.arc(sx, sy, 4.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // 2. Y-Intercept (green point)
      if (plotData.yIntercept) {
        const sx = toScreenX(plotData.yIntercept.x)
        const sy = toScreenY(plotData.yIntercept.y)
        if (sx >= -5 && sx <= width + 5 && sy >= -5 && sy <= height + 5) {
          ctx.fillStyle = '#16a34a'
          ctx.beginPath()
          ctx.arc(sx, sy, 4.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // 3. Vertex (purple point)
      if (plotData.vertex) {
        const sx = toScreenX(plotData.vertex.x)
        const sy = toScreenY(plotData.vertex.y)
        if (sx >= -5 && sx <= width + 5 && sy >= -5 && sy <= height + 5) {
          ctx.fillStyle = '#9333ea'
          ctx.beginPath()
          ctx.arc(sx, sy, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }
    }

    ctx.restore()
  }, [viewport, plotData])

  if (!sidebarState.isOpen) return null

  const handlePointerDownCanvas = (e: React.PointerEvent) => {
    isDraggingRef.current = true
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMoveCanvas = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !lastMousePosRef.current) return
    const dx = e.clientX - lastMousePosRef.current.x
    const dy = e.clientY - lastMousePosRef.current.y
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }

    const width = canvasRef.current?.clientWidth || 360
    const height = canvasRef.current?.clientHeight || 360

    const xSpan = viewport.xMax - viewport.xMin
    const ySpan = viewport.yMax - viewport.yMin

    const worldDx = -(dx / width) * xSpan
    const worldDy = (dy / height) * ySpan

    setViewport((prev) => ({
      xMin: prev.xMin + worldDx,
      xMax: prev.xMax + worldDx,
      yMin: prev.yMin + worldDy,
      yMax: prev.yMax + worldDy,
    }))
  }

  const handlePointerUpCanvas = (_e: React.PointerEvent) => {
    isDraggingRef.current = false
    lastMousePosRef.current = null
  }

  const handleWheelCanvas = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1
    zoomAt(zoomFactor)
  }

  const zoomAt = (factor: number) => {
    setViewport((prev) => {
      const xMid = (prev.xMin + prev.xMax) / 2
      const yMid = (prev.yMin + prev.yMax) / 2
      const newHalfX = ((prev.xMax - prev.xMin) * factor) / 2
      const newHalfY = ((prev.yMax - prev.yMin) * factor) / 2
      return {
        xMin: xMid - newHalfX,
        xMax: xMid + newHalfX,
        yMin: yMid - newHalfY,
        yMax: yMid + newHalfY,
      }
    })
  }

  const handleResetView = () => {
    setViewport(DEFAULT_VIEWPORT)
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

  return (
    <aside
      aria-label="Function Graph Sidebar"
      data-testid="graph-sidebar"
      className="inky-ui absolute top-0 right-0 h-full w-[380px] max-w-[85vw] bg-white border-l border-black/10 shadow-2xl flex flex-col z-40 pointer-events-auto select-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/8 bg-stone-50/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-[#2563eb]" />
          <h2 className="text-sm font-semibold text-[#111111]">Function Graph</h2>
        </div>
        <button
          type="button"
          onClick={handleClose}
          title="Close Graph (Esc)"
          className="p-1 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-black/5 transition-colors cursor-pointer"
          aria-label="Close graph sidebar"
        >
          <X size={16} />
        </button>
      </div>

      {/* Desmos-style editable equation card */}
      <div className="p-3 border-b border-black/8 bg-white flex flex-col gap-1.5">
        <label
          htmlFor="graph-equation-input"
          className="text-[11px] font-medium text-stone-500 uppercase tracking-wider"
        >
          Expression
        </label>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
            isValid
              ? 'border-blue-500/40 bg-blue-50/20 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500'
              : 'border-red-400 bg-red-50/30'
          }`}
        >
          {/* Function color circle badge (Desmos style) */}
          <div className="w-3.5 h-3.5 rounded-full bg-[#2563eb] shrink-0 shadow-xs" />
          <input
            id="graph-equation-input"
            type="text"
            value={rawInput}
            onChange={handleInputChange}
            onInput={handleInput}
            placeholder="e.g. y = x^2 - 4"
            className="flex-1 bg-transparent text-sm font-mono text-[#111111] focus:outline-none"
            spellCheck={false}
            autoCapitalize="off"
          />
        </div>
        {!isValid && (
          <p className="text-[11px] text-red-600 font-medium">Invalid or ungraphable expression</p>
        )}
      </div>

      {/* Interactive Cartesian Canvas */}
      <div className="relative flex-1 bg-stone-50 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid="graph-canvas"
          className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={handlePointerDownCanvas}
          onPointerMove={handlePointerMoveCanvas}
          onPointerUp={handlePointerUpCanvas}
          onPointerCancel={handlePointerUpCanvas}
          onWheel={handleWheelCanvas}
        />

        {/* Floating Pan/Zoom Controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1 bg-white/95 backdrop-blur-md border border-black/10 rounded-xl p-1 shadow-md">
          <button
            type="button"
            title="Zoom In"
            onClick={() => zoomAt(0.8)}
            className="p-1.5 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            title="Zoom Out"
            onClick={() => zoomAt(1.25)}
            className="p-1.5 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          >
            <ZoomOut size={15} />
          </button>
          <div className="w-full h-[1px] bg-black/8 my-0.5" />
          <button
            type="button"
            title="Reset View"
            onClick={handleResetView}
            className="p-1.5 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Critical Points Breakdown (Roots, Y-Intercept, Vertex) */}
      {plotData && (
        <div className="p-3 border-t border-black/8 bg-white/90 backdrop-blur-md flex flex-col gap-2 max-h-[180px] overflow-y-auto">
          <div className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
            Critical Points
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plotData.xIntercepts.map((root, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: simple coordinate list display
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono bg-red-50 text-red-700 border border-red-200"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Root: ({root.x}, 0)
              </span>
            ))}
            {plotData.yIntercept && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono bg-green-50 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                y-int: (0, {plotData.yIntercept.y})
              </span>
            )}
            {plotData.vertex && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono bg-purple-50 text-purple-700 border border-purple-200">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                Vertex: ({plotData.vertex.x}, {plotData.vertex.y})
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
