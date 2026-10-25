import { Delete, Keyboard, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { type FunctionPlot, isGraphableExpression, plotFunction } from '../../lib/math/graph-engine'

interface CoordinateCenter {
  x: number
  y: number
}

const DEFAULT_CENTER: CoordinateCenter = { x: 0, y: 0 }
const DEFAULT_ZOOM = 22 // 22 pixels per unit (standard 1:1 isometric grid)
const DEFAULT_WIDTH = 420
const MIN_WIDTH = 320

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
 * Real-time natural math typing formatting:
 * 1. Automatically turns ^2, ^3 into true mathematical superscripts (², ³, etc.)
 * 2. Automatically expands function names like sin, cos, tan, sqrt to sin(), cos(), etc.
 */
function formatNaturalMathTyping(text: string, cursor: number): { text: string; cursor: number } {
  let newText = text
  let newCursor = cursor

  // 1. Convert ^2, ^3, etc. to superscripts
  const superRegex = /\^([0-9nxy+-])/g
  let match: RegExpExecArray | null

  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((match = superRegex.exec(newText)) !== null) {
    const superChar = SUPERSCRIPT_MAP[match[1]]
    if (superChar) {
      const matchStart = match.index
      newText = newText.slice(0, matchStart) + superChar + newText.slice(matchStart + 2)
      if (cursor > matchStart) {
        newCursor = Math.max(matchStart + 1, newCursor - 1)
      }
      superRegex.lastIndex = matchStart + 1
    }
  }

  // 2. Auto-expand function names (sin -> sin(), cos -> cos(), sqrt -> sqrt())
  const beforeCursor = newText.slice(0, newCursor)
  const fnMatch = beforeCursor.match(/(sin|cos|tan|sqrt|abs|log|ln)$/i)
  if (fnMatch) {
    const after = newText.slice(newCursor)
    if (!after.startsWith('(')) {
      newText = `${beforeCursor}()${after}`
      newCursor = newCursor + 1
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
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [center, setCenter] = useState<CoordinateCenter>(DEFAULT_CENTER)
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM)
  const [showKeypad, setShowKeypad] = useState(false)

  // Interactive probe / point dragged along the curve
  const [probePoint, setProbePoint] = useState<{
    x: number
    y: number
    label: string
    isPinned?: boolean
  } | null>(null)
  const isTracingRef = useRef(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isDraggingRef = useRef(false)
  const isResizingRef = useRef(false)
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
      setProbePoint(null)
    }
  }, [sidebarState.equation])

  const isValid = useMemo(() => isGraphableExpression(displayInput), [displayInput])

  // Compute view bounds from isometric zoom and center
  const bounds = useMemo(() => {
    const width = sidebarWidth
    const height = 400
    const halfW = width / 2 / zoom
    const halfH = height / 2 / zoom
    return {
      xMin: center.x - halfW,
      xMax: center.x + halfW,
      yMin: center.y - halfH,
      yMax: center.y + halfH,
    }
  }, [center, zoom, sidebarWidth])

  const plotData: FunctionPlot | null = useMemo(() => {
    if (!isValid) return null
    return plotFunction(displayInput, {
      xMin: bounds.xMin,
      xMax: bounds.xMax,
      yMin: bounds.yMin,
      yMax: bounds.yMax,
      samples: 400,
      width: sidebarWidth,
      height: 400,
    })
  }, [displayInput, isValid, bounds, sidebarWidth])

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

  // Curve interpolation helper: evaluates curve y-value for any given x
  const getCurvePointAtX = useCallback(
    (targetX: number): { x: number; y: number } | null => {
      if (!plotData || plotData.segments.length === 0) return null

      // Check key points for subtle magnetic snap (gentle ~3.5px window so sliding feels natural)
      for (const kp of keyPoints) {
        if (Math.abs(kp.x - targetX) < 3.5 / zoom) {
          return { x: kp.x, y: kp.y }
        }
      }

      for (const seg of plotData.segments) {
        if (seg.length < 2) continue
        const first = seg[0]
        const last = seg[seg.length - 1]
        if (targetX < Math.min(first.x, last.x) || targetX > Math.max(first.x, last.x)) {
          continue
        }
        for (let i = 0; i < seg.length - 1; i++) {
          const p1 = seg[i]
          const p2 = seg[i + 1]
          if ((targetX >= p1.x && targetX <= p2.x) || (targetX >= p2.x && targetX <= p1.x)) {
            const dx = p2.x - p1.x
            const t = Math.abs(dx) > 1e-9 ? (targetX - p1.x) / dx : 0
            const y = p1.y + t * (p2.y - p1.y)
            return { x: targetX, y }
          }
        }
      }
      return null
    },
    [plotData, keyPoints, zoom],
  )

  // Desmos-Quality Isometric Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth || sidebarWidth
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
          ctx.fillStyle = '#a0a0a0'
          ctx.beginPath()
          ctx.arc(sx, sy, 4.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // 7. Interactive Probe Point (Slide / Drag along the curve)
      if (probePoint) {
        const sx = toScreenX(probePoint.x)
        const sy = toScreenY(probePoint.y)

        // Halo + Dot
        ctx.fillStyle = 'rgba(199, 68, 64, 0.2)'
        ctx.beginPath()
        ctx.arc(sx, sy, 9, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#c74440'
        ctx.beginPath()
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()

        // Minimal Coordinate Tooltip
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        const textWidth = ctx.measureText(probePoint.label).width
        const pillW = textWidth + 14
        const pillH = 22
        const pillX = sx - pillW / 2
        const pillY = sy - 30

        ctx.fillStyle = '#111111'
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillW, pillH, 4)
        ctx.fill()

        // Downward pointer triangle
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
        ctx.fillText(probePoint.label, sx, pillY + pillH / 2)
      }
    }

    ctx.restore()
  }, [center, zoom, plotData, keyPoints, probePoint, sidebarWidth])

  if (!sidebarState.isOpen) return null

  // Canvas pointer handlers for interactive tracing & panning
  const handlePointerDownCanvas = (e: React.PointerEvent | React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const halfW = (canvas.clientWidth || sidebarWidth) / 2
    const halfH = (canvas.clientHeight || 400) / 2
    const worldX = center.x + (mouseX - halfW) / zoom

    // Check if clicked near the function curve
    const curvePt = getCurvePointAtX(worldX)
    if (curvePt) {
      const screenY = halfH - (curvePt.y - center.y) * zoom
      if (Math.abs(screenY - mouseY) < 26) {
        // Start tracing along curve (pinned point)
        isTracingRef.current = true
        setProbePoint({
          x: curvePt.x,
          y: curvePt.y,
          label: `(${formatCoord(curvePt.x)}, ${formatCoord(curvePt.y)})`,
          isPinned: true,
        })
        if ('setPointerCapture' in e.target && 'pointerId' in e) {
          try {
            ;(e.target as HTMLElement).setPointerCapture((e as React.PointerEvent).pointerId)
          } catch {}
        }
        return
      }
    }

    // Otherwise dismiss pinned probe and start panning coordinate space
    setProbePoint(null)
    isDraggingRef.current = true
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    if ('setPointerCapture' in e.target && 'pointerId' in e) {
      try {
        ;(e.target as HTMLElement).setPointerCapture((e as React.PointerEvent).pointerId)
      } catch {}
    }
  }

  const handlePointerMoveCanvas = (e: React.PointerEvent | React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const halfW = (canvas.clientWidth || sidebarWidth) / 2
    const halfH = (canvas.clientHeight || 400) / 2

    // 1. If actively tracing along the curve
    if (isTracingRef.current) {
      const worldX = center.x + (mouseX - halfW) / zoom
      const curvePt = getCurvePointAtX(worldX)
      if (curvePt) {
        setProbePoint({
          x: curvePt.x,
          y: curvePt.y,
          label: `(${formatCoord(curvePt.x)}, ${formatCoord(curvePt.y)})`,
          isPinned: true,
        })
      }
      return
    }

    // 2. If actively panning
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

    // 3. Hovering near curve: show probe dot
    const worldX = center.x + (mouseX - halfW) / zoom
    const curvePt = getCurvePointAtX(worldX)
    if (curvePt) {
      const screenY = halfH - (curvePt.y - center.y) * zoom
      if (Math.abs(screenY - mouseY) < 20) {
        setProbePoint({
          x: curvePt.x,
          y: curvePt.y,
          label: `(${formatCoord(curvePt.x)}, ${formatCoord(curvePt.y)})`,
          isPinned: false,
        })
        return
      }
    }

    if (probePoint && !probePoint.isPinned) {
      setProbePoint(null)
    }
  }

  const handlePointerUpCanvas = (_e: React.PointerEvent | React.MouseEvent) => {
    isTracingRef.current = false
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
    setProbePoint(null)
  }

  const handleClose = () => {
    inkyStore.closeGraphSidebar()
  }

  // Left-edge drag-to-resize handlers
  const handleStartResize = (e: React.PointerEvent | React.MouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    const startX = e.clientX
    const startW = sidebarWidth

    const onMove = (ev: PointerEvent | MouseEvent) => {
      if (!isResizingRef.current) return
      const dx = ev.clientX - startX
      const maxW = Math.min(900, Math.floor(window.innerWidth * 0.85))
      const nextW = Math.max(MIN_WIDTH, Math.min(maxW, startW - dx))
      setSidebarWidth(nextW)
    }

    const onUp = () => {
      isResizingRef.current = false
      window.removeEventListener('pointermove', onMove as EventListener)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('mousemove', onMove as EventListener)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('pointermove', onMove as EventListener)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('mousemove', onMove as EventListener)
    window.addEventListener('mouseup', onUp)
  }

  // Natural Math Typing: Auto-parentheses, overtype, backspace pairing, and auto-superscript
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = inputRef.current
    if (!input) return

    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const val = input.value

    // 1. Auto-close parentheses: '(' -> '()' with cursor inside
    if (e.key === '(') {
      e.preventDefault()
      const selectedText = val.substring(start, end)
      const nextVal = `${val.substring(0, start)}(${selectedText})${val.substring(end)}`
      const nextCursor = start + 1
      setDisplayInput(nextVal)
      inkyStore.updateGraphedEquation(nextVal)
      requestAnimationFrame(() => {
        input.setSelectionRange(nextCursor, nextCursor + selectedText.length)
      })
      return
    }

    // 2. Overtype closing parenthesis: ')' steps over existing ')'
    if (e.key === ')' && start === end && val[start] === ')') {
      e.preventDefault()
      input.setSelectionRange(start + 1, start + 1)
      return
    }

    // 3. Auto-close absolute value: '|' -> '||' with cursor inside
    if (e.key === '|') {
      if (start === end && val[start] === '|') {
        e.preventDefault()
        input.setSelectionRange(start + 1, start + 1)
        return
      }
      e.preventDefault()
      const selectedText = val.substring(start, end)
      const nextVal = `${val.substring(0, start)}|${selectedText}|${val.substring(end)}`
      const nextCursor = start + 1
      setDisplayInput(nextVal)
      inkyStore.updateGraphedEquation(nextVal)
      requestAnimationFrame(() => {
        input.setSelectionRange(nextCursor, nextCursor + selectedText.length)
      })
      return
    }

    // 4. Paired backspace: removes both '(' and ')' or both '|' and '|'
    if (e.key === 'Backspace' && start === end && start > 0) {
      const prevChar = val[start - 1]
      const nextChar = val[start]
      if ((prevChar === '(' && nextChar === ')') || (prevChar === '|' && nextChar === '|')) {
        e.preventDefault()
        const nextVal = val.substring(0, start - 1) + val.substring(start + 1)
        setDisplayInput(nextVal)
        inkyStore.updateGraphedEquation(nextVal)
        requestAnimationFrame(() => {
          input.setSelectionRange(start - 1, start - 1)
        })
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value
    const cursor = e.target.selectionStart ?? rawVal.length
    const { text, cursor: newCursor } = formatNaturalMathTyping(rawVal, cursor)

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
    const { text, cursor: newCursor } = formatNaturalMathTyping(rawVal, cursor)

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
    setProbePoint(null)
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
      style={{ width: `${sidebarWidth}px` }}
      className="inky-ui absolute top-0 right-0 h-full max-w-[95vw] bg-white border-l border-black/8 shadow-2xl flex flex-col z-40 select-none overflow-hidden transition-[width] duration-75"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Resizable Left-Edge Drag Handle */}
      <div
        role="slider"
        aria-orientation="horizontal"
        aria-label="Resize graph panel"
        aria-valuenow={sidebarWidth}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={900}
        tabIndex={0}
        title="Drag to resize panel"
        className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1.5 cursor-ew-resize hover:bg-blue-500/10 active:bg-blue-500/25 transition-colors z-50 flex items-center justify-center group touch-none"
        onPointerDown={handleStartResize}
        onMouseDown={handleStartResize}
      >
        <div className="w-[3px] h-8 rounded-full bg-black/15 group-hover:bg-black/40 group-active:bg-blue-500 transition-colors" />
      </div>

      {/* 1. Minimalist Editorial Header */}
      <div className="flex items-center justify-between px-4 h-[44px] bg-white/95 backdrop-blur-md border-b border-black/6 shrink-0">
        <h2 className="text-[13px] font-medium text-[#111111] tracking-tight">Function Graph</h2>

        <button
          type="button"
          onClick={handleClose}
          title="Close Graph (Esc)"
          className="p-1.5 rounded-md text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-colors cursor-pointer border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
          style={{ outline: 'none' }}
          aria-label="Close graph sidebar"
        >
          <X size={15} />
        </button>
      </div>

      {/* 2. Interactive Cartesian Coordinate Plane (Trace & Drag Points) */}
      <div className="relative flex-1 bg-white min-h-[140px] overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid="graph-canvas"
          className="w-full h-full cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={handlePointerDownCanvas}
          onPointerMove={handlePointerMoveCanvas}
          onPointerUp={handlePointerUpCanvas}
          onPointerCancel={handlePointerUpCanvas}
          onMouseDown={handlePointerDownCanvas}
          onMouseMove={handlePointerMoveCanvas}
          onMouseUp={handlePointerUpCanvas}
          onWheel={handleWheelCanvas}
        />

        {/* Floating Zoom & Reset Controls */}
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

      {/* 3. Flush Full-Width Equation Dock (No floating card, edge-to-edge) */}
      <div className="flex items-center gap-2.5 px-4 h-13 bg-white border-t border-black/8 shrink-0">
        {/* Minimal Crimson Curve Dot/Icon */}
        <div
          title="Function curve y = f(x)"
          className="w-5 h-5 rounded-md bg-[#c74440]/10 text-[#c74440] flex items-center justify-center shrink-0"
        >
          <svg
            width="12"
            height="12"
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

        {/* Natural Math Input: Completely seamless, zero blue focus boxes */}
        <input
          ref={inputRef}
          id="graph-equation-input"
          type="text"
          value={displayInput}
          onKeyDown={handleKeyDown}
          onChange={handleInputChange}
          onInput={handleInput}
          placeholder="y = x² - 4"
          className="flex-1 bg-transparent text-[16px] font-serif tracking-[0.08em] text-[#111111] border-0 p-0 m-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 placeholder:text-stone-300 placeholder:font-sans placeholder:tracking-normal selection:bg-black/10"
          style={{ outline: 'none', boxShadow: 'none' }}
          spellCheck={false}
          autoCapitalize="off"
        />

        {/* Action Controls on Bottom Bar */}
        <div className="flex items-center gap-1 shrink-0">
          {displayInput.length > 0 && (
            <button
              type="button"
              onClick={handleClearFormula}
              title="Clear expression"
              className="p-1.5 rounded-md text-stone-400 hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-colors cursor-pointer border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              style={{ outline: 'none' }}
            >
              <X size={15} />
            </button>
          )}

          {/* Keypad Toggle Button (placed right on the bottom bar) */}
          <button
            type="button"
            onClick={() => setShowKeypad((prev) => !prev)}
            title={showKeypad ? 'Hide Keypad' : 'Show Keypad'}
            aria-label={showKeypad ? 'Hide Keypad' : 'Show Keypad'}
            className={`p-1.5 rounded-md transition-colors cursor-pointer border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 ${
              showKeypad
                ? 'bg-black/8 text-[#111111]'
                : 'text-stone-400 hover:text-[#111111] hover:bg-black/5'
            }`}
            style={{ outline: 'none' }}
          >
            <Keyboard size={16} />
          </button>
        </div>
      </div>

      {/* 4. Touch/Mobile Keypad (Natural Desmos 2-Block Layout) */}
      {showKeypad && (
        <div className="p-2.5 bg-[#fcfcfb] border-t border-black/8 flex gap-2 shrink-0">
          {/* Left Block: Math Functions, Variables & Symbols (4 cols) */}
          <div className="grid grid-cols-4 gap-1 flex-1">
            {/* Row 1 */}
            <button
              type="button"
              onClick={() => handleKeypadPress('x')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-[#111111] font-serif italic font-bold active:scale-95 transition-colors text-sm border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              x
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('y')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-[#111111] font-serif italic font-bold active:scale-95 transition-colors text-sm border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              y
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('²')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-[#111111] font-medium active:scale-95 transition-colors text-xs border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              x²
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('^')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-[#111111] font-medium active:scale-95 transition-colors text-xs border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              aᵇ
            </button>

            {/* Row 2 */}
            <button
              type="button"
              onClick={() => handleKeypadPress('√(')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-[#111111] font-medium active:scale-95 transition-colors text-xs border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              √
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('π')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-[#111111] font-serif active:scale-95 transition-colors text-sm border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              π
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('(')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-[#111111] font-medium active:scale-95 transition-colors text-xs border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              (
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress(')')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-[#111111] font-medium active:scale-95 transition-colors text-xs border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              )
            </button>

            {/* Row 3 */}
            <button
              type="button"
              onClick={() => handleKeypadPress('sin(')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-700 text-xs active:scale-95 transition-colors border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              sin
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('cos(')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-700 text-xs active:scale-95 transition-colors border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              cos
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('tan(')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-700 text-xs active:scale-95 transition-colors border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              tan
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('abs(')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-700 text-xs active:scale-95 transition-colors border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              |a|
            </button>

            {/* Row 4 */}
            <button
              type="button"
              onClick={() => handleKeypadPress('<')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-700 text-xs active:scale-95 transition-colors border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              &lt;
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('>')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-700 text-xs active:scale-95 transition-colors border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              &gt;
            </button>
            <button
              type="button"
              onClick={handleClearFormula}
              title="Clear All"
              aria-label="Clear All"
              className="h-8 rounded-md bg-stone-200/70 hover:bg-stone-300 active:bg-stone-400 text-stone-700 active:scale-95 transition-colors text-xs cursor-pointer border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              style={{ outline: 'none' }}
            >
              C
            </button>
            <button
              type="button"
              onClick={handleKeypadBackspace}
              title="Backspace"
              aria-label="Backspace"
              className="h-8 rounded-md bg-stone-200/70 hover:bg-stone-300 active:bg-stone-400 text-stone-700 active:scale-95 transition-colors flex items-center justify-center cursor-pointer border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20"
              style={{ outline: 'none' }}
            >
              <Delete size={14} />
            </button>
          </div>

          {/* Divider */}
          <div className="w-[1px] bg-black/6 my-0.5" />

          {/* Right Block: Standard Numeric Keypad & Arithmetic (4 cols) */}
          <div className="grid grid-cols-4 gap-1 flex-1">
            {/* Row 1 */}
            <button
              type="button"
              onClick={() => handleKeypadPress('7')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              7
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('8')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              8
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('9')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              9
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress(' / ')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-800 font-medium active:scale-95 transition-colors text-sm border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              ÷
            </button>

            {/* Row 2 */}
            <button
              type="button"
              onClick={() => handleKeypadPress('4')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              4
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('5')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              5
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('6')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              6
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress(' * ')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-800 font-medium active:scale-95 transition-colors text-sm border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              ×
            </button>

            {/* Row 3 */}
            <button
              type="button"
              onClick={() => handleKeypadPress('1')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              1
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('2')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              2
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('3')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              3
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress(' - ')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-800 font-medium active:scale-95 transition-colors text-sm border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              −
            </button>

            {/* Row 4 */}
            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              0
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('.')}
              className="h-8 rounded-md bg-white hover:bg-stone-100 active:bg-stone-200 text-[#111111] font-medium active:scale-95 transition-colors text-sm border border-black/6 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              .
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress(' = ')}
              className="h-8 rounded-md bg-stone-100 hover:bg-stone-200/80 active:bg-stone-300 text-stone-800 font-medium active:scale-95 transition-colors text-sm border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              =
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress(' + ')}
              className="h-8 rounded-md bg-[#111111] hover:bg-[#333333] active:bg-black text-white font-medium active:scale-95 transition-colors text-sm border-0 outline-none focus:outline-none focus-visible:ring-1 focus-visible:ring-black/20 cursor-pointer"
              style={{ outline: 'none' }}
            >
              +
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
