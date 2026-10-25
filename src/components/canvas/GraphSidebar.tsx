import { Delete, Keyboard, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { type FunctionPlot, isGraphableExpression, plotFunction } from '../../lib/math/graph-engine'

interface CoordinateCenter {
  x: number
  y: number
}

const DEFAULT_CENTER: CoordinateCenter = { x: 0, y: 0 }
const DEFAULT_ZOOM = 22 // 22 pixels per unit (standard 1:1 square grid)

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  n: 'ⁿ',
  x: 'ˣ',
  y: 'ʸ',
}

/**
 * Converts raw math expressions with caret exponents (e.g. x^2, x^{2}, \sqrt{x})
 * into clean, natural mathematical typography so the user never sees raw LaTeX syntax.
 */
function toNaturalMathDisplay(str: string): string {
  if (!str) return ''
  return str
    .replace(/\^\s*\{([0-9nxy+-]+)\}/g, (_match, group) => {
      return Array.from(group)
        .map((ch) => SUPERSCRIPT_MAP[ch as string] || ch)
        .join('')
    })
    .replace(/\^([0-9nxy+-])/g, (_match, ch) => SUPERSCRIPT_MAP[ch] || `^${ch}`)
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\(sin|cos|tan|sec|csc|cot|log|ln|abs)/g, '$1')
    .replace(/\\left|\\right/g, '')
    .trim()
}

/**
 * Formats user typing in real time: when user types `^2`, it automatically elevates into `²`
 * and adjusts cursor position so typing is completely fluid and requires zero LaTeX knowledge.
 */
function formatMathWithCursor(text: string, cursor: number): { text: string; cursor: number } {
  let newText = text
  let newCursor = cursor
  const regex = /\^([0-9nxy+-])/g
  let match: RegExpExecArray | null

  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((match = regex.exec(newText)) !== null) {
    const superChar = SUPERSCRIPT_MAP[match[1]]
    if (superChar) {
      const matchStart = match.index
      newText = newText.slice(0, matchStart) + superChar + newText.slice(matchStart + 2)
      if (cursor > matchStart) {
        newCursor = Math.max(matchStart + 1, newCursor - 1)
      }
      regex.lastIndex = matchStart + 1
    }
  }
  return { text: newText, cursor: newCursor }
}

function formatCoord(val: number): string {
  if (Math.abs(val) < 1e-9) return '0'
  return Number(val.toFixed(3)).toString()
}

export function GraphSidebar() {
  const [sidebarState, setSidebarState] = useState(inkyStore.graphSidebar)
  const [displayInput, setDisplayInput] = useState(() =>
    toNaturalMathDisplay(sidebarState.equation),
  )
  const [center, setCenter] = useState<CoordinateCenter>(DEFAULT_CENTER)
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)
  const [showKeypad, setShowKeypad] = useState(false)
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
      setDisplayInput(toNaturalMathDisplay(next.equation))
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

  const isValid = useMemo(() => isGraphableExpression(displayInput), [displayInput])

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
    return plotFunction(displayInput, {
      xMin: bounds.xMin,
      xMax: bounds.xMax,
      yMin: bounds.yMin,
      yMax: bounds.yMax,
      samples: 400,
      width: 420,
      height: 400,
    })
  }, [displayInput, isValid, bounds])

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

    // Step calculation for 1:1 isometric square grid
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

    // 1. Minor Grid Lines (0.75px ultra-light #f0f0f0)
    ctx.strokeStyle = '#f0f0f0'
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

    // 2. Major Grid Lines (1px light #e0e0e0)
    ctx.strokeStyle = '#e0e0e0'
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

    ctx.strokeStyle = '#222222'
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

    // 4. Subtle, quiet axis numbers
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillStyle = '#787774'
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
      const sx = Math.min(Math.max(originX - 6, 24), width - 6)
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

    // 5. Signature Crimson Red Function Curve (#c74440)
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

          ctx.fillStyle = isHighlighted ? '#111111' : '#a0a0a0'
          ctx.beginPath()
          ctx.arc(sx, sy, isHighlighted ? 5.5 : 4.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // 7. Minimal Coordinate Tooltip
      const targetPoint = activePoint || hoveredPoint
      if (targetPoint) {
        const sx = toScreenX(targetPoint.x)
        const sy = toScreenY(targetPoint.y)

        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        const textWidth = ctx.measureText(targetPoint.label).width
        const pillW = textWidth + 14
        const pillH = 22
        const pillX = sx - pillW / 2
        const pillY = sy - 28

        ctx.fillStyle = '#111111'
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
    const rawVal = e.target.value
    const cursor = e.target.selectionStart ?? rawVal.length
    const { text, cursor: newCursor } = formatMathWithCursor(rawVal, cursor)

    setDisplayInput(text)
    inkyStore.updateGraphedEquation(text)

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newCursor, newCursor)
      }
    })
  }

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const rawVal = (e.target as HTMLInputElement).value
    const cursor = (e.target as HTMLInputElement).selectionStart ?? rawVal.length
    const { text, cursor: newCursor } = formatMathWithCursor(rawVal, cursor)

    setDisplayInput(text)
    inkyStore.updateGraphedEquation(text)

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newCursor, newCursor)
      }
    })
  }

  const handleClearFormula = () => {
    setDisplayInput('')
    inkyStore.updateGraphedEquation('')
    inputRef.current?.focus()
  }

  // Keypad insertion helper
  const handleKeypadPress = (textToInsert: string) => {
    const input = inputRef.current
    if (!input) {
      const nextVal = displayInput + textToInsert
      setDisplayInput(nextVal)
      inkyStore.updateGraphedEquation(nextVal)
      return
    }

    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const currentVal = input.value
    const nextVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end)
    const nextCursor = start + textToInsert.length

    setDisplayInput(nextVal)
    inkyStore.updateGraphedEquation(nextVal)

    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handleKeypadBackspace = () => {
    const input = inputRef.current
    if (!input) {
      const nextVal = displayInput.slice(0, -1)
      setDisplayInput(nextVal)
      inkyStore.updateGraphedEquation(nextVal)
      return
    }

    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const currentVal = input.value

    if (start !== end) {
      const nextVal = currentVal.substring(0, start) + currentVal.substring(end)
      setDisplayInput(nextVal)
      inkyStore.updateGraphedEquation(nextVal)
      requestAnimationFrame(() => {
        input.focus()
        input.setSelectionRange(start, start)
      })
      return
    }

    if (start <= 0) return
    const nextVal = currentVal.substring(0, start - 1) + currentVal.substring(start)
    setDisplayInput(nextVal)
    inkyStore.updateGraphedEquation(nextVal)

    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start - 1, start - 1)
    })
  }

  return (
    <aside
      aria-label="Function Graph Sidebar"
      data-testid="graph-sidebar"
      className="inky-ui absolute top-0 right-0 h-full w-[400px] max-w-[95vw] bg-white border-l border-black/8 shadow-xl flex flex-col z-40 select-none overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 1. Minimalist Editorial Header */}
      <div className="flex items-center justify-between px-4 h-[46px] bg-white/95 backdrop-blur-md border-b border-black/6 shrink-0">
        <h2 className="text-[13px] font-medium text-[#111111] tracking-tight">Function Graph</h2>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowKeypad((prev) => !prev)}
            title={showKeypad ? 'Hide Keypad' : 'Show Keypad'}
            className={`p-1.5 rounded-lg text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer ${
              showKeypad ? 'bg-black/5 text-[#111111]' : ''
            }`}
          >
            <Keyboard size={16} />
          </button>

          <button
            type="button"
            onClick={handleClose}
            title="Close Graph (Esc)"
            className="p-1.5 rounded-lg text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
            aria-label="Close graph sidebar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 2. Interactive Coordinate Plane */}
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

        {/* Quiet, Minimal Floating Controls */}
        <div className="absolute top-3 right-3 flex flex-col bg-white/95 backdrop-blur-md border border-black/8 rounded-lg shadow-xs overflow-hidden z-20">
          <button
            type="button"
            title="Zoom In"
            onClick={handleZoomIn}
            className="p-1.5 text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={15} />
          </button>
          <div className="h-[1px] bg-black/6" />
          <button
            type="button"
            title="Zoom Out"
            onClick={handleZoomOut}
            className="p-1.5 text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
          >
            <Minus size={15} />
          </button>
          <div className="h-[1px] bg-black/6" />
          <button
            type="button"
            title="Reset View"
            onClick={handleResetView}
            className="p-1.5 text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* 3. Pure Desmos-Style Equation Box (Lower Stress, Zero Clutter) */}
      <div className="p-3.5 bg-white border-t border-black/6 shrink-0">
        <div className="flex items-center gap-3 px-3.5 py-2.5 bg-[#fbfbfa] hover:bg-white focus-within:bg-white rounded-xl border border-black/8 focus-within:border-black/25 focus-within:ring-2 focus-within:ring-black/5 transition-all shadow-2xs">
          {/* Wave Badge */}
          <div className="w-6 h-6 rounded-full bg-[#c74440] text-white flex items-center justify-center shrink-0 shadow-2xs">
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

          {/* Natural Math Input: Typing ^ automatically goes up to superscripts! */}
          <input
            ref={inputRef}
            id="graph-equation-input"
            type="text"
            value={displayInput}
            onChange={handleInputChange}
            onInput={handleInput}
            placeholder="y = x² - 4"
            className="flex-1 bg-transparent text-[17px] font-serif text-[#111111] focus:outline-none placeholder:text-stone-400 placeholder:font-sans"
            spellCheck={false}
            autoCapitalize="off"
          />

          {/* Clear Button */}
          {displayInput.length > 0 && (
            <button
              type="button"
              onClick={handleClearFormula}
              title="Clear expression"
              className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-black/5 transition-all cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* 4. Touch/Mobile Keypad (Minimal, Warm Monochrome) */}
      {showKeypad && (
        <div className="p-2.5 bg-[#fbfbfa] border-t border-black/6 grid grid-cols-8 gap-1.5 shrink-0">
          {/* Row 1: Variables, Exponents, Brackets & Backspace */}
          <button
            type="button"
            onClick={() => handleKeypadPress('x')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-serif italic font-bold active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            x
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('y')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-serif italic font-bold active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            y
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('²')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            x²
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('√(')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            √
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('(')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            (
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(')')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            )
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('π')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-serif active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            π
          </button>
          <button
            type="button"
            onClick={handleKeypadBackspace}
            title="Backspace"
            className="h-9 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            <Delete size={15} />
          </button>

          {/* Row 2: 7, 8, 9, ÷, sin, cos, tan, ^ */}
          <button
            type="button"
            onClick={() => handleKeypadPress('7')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            7
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('8')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            8
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('9')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            9
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' / ')}
            className="h-9 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-medium active:scale-95 transition-all text-sm cursor-pointer"
          >
            ÷
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('sin(')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-stone-700 text-xs active:scale-95 transition-all border border-black/6 shadow-2xs cursor-pointer"
          >
            sin
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('cos(')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-stone-700 text-xs active:scale-95 transition-all border border-black/6 shadow-2xs cursor-pointer"
          >
            cos
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('tan(')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-stone-700 text-xs active:scale-95 transition-all border border-black/6 shadow-2xs cursor-pointer"
          >
            tan
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('^')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            ^
          </button>

          {/* Row 3: 4, 5, 6, ×, <, >, |x|, Clear */}
          <button
            type="button"
            onClick={() => handleKeypadPress('4')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            4
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('5')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            5
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('6')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            6
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' * ')}
            className="h-9 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-medium active:scale-95 transition-all text-sm cursor-pointer"
          >
            ×
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('<')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-stone-800 text-xs active:scale-95 transition-all border border-black/6 shadow-2xs cursor-pointer"
          >
            &lt;
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('>')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-stone-800 text-xs active:scale-95 transition-all border border-black/6 shadow-2xs cursor-pointer"
          >
            &gt;
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('abs(')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-stone-800 text-xs active:scale-95 transition-all border border-black/6 shadow-2xs cursor-pointer"
          >
            |a|
          </button>
          <button
            type="button"
            onClick={handleClearFormula}
            title="Clear All"
            className="h-9 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 active:scale-95 transition-all text-xs cursor-pointer"
          >
            C
          </button>

          {/* Row 4: 1, 2, 3, −, 0, ., =, + */}
          <button
            type="button"
            onClick={() => handleKeypadPress('1')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('2')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            2
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('3')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            3
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' - ')}
            className="h-9 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-medium active:scale-95 transition-all text-sm cursor-pointer"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('0')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress('.')}
            className="h-9 rounded-lg bg-white hover:bg-stone-100 text-[#111111] font-medium active:scale-95 transition-all text-sm border border-black/6 shadow-2xs cursor-pointer"
          >
            .
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' = ')}
            className="h-9 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-medium active:scale-95 transition-all text-sm cursor-pointer"
          >
            =
          </button>
          <button
            type="button"
            onClick={() => handleKeypadPress(' + ')}
            className="h-9 rounded-lg bg-[#111111] hover:bg-[#333333] text-white font-medium active:scale-95 transition-all text-sm cursor-pointer"
          >
            +
          </button>
        </div>
      )}
    </aside>
  )
}
