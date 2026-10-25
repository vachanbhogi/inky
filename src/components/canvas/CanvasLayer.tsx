import { useEffect, useRef } from 'react'
import { lassoDissolve, recognizedPulseAlpha } from '../../lib/canvas/motion'
import { checkBoundingBoxOverlap, getViewportBoundingBox } from '../../lib/canvas/spatial-index'
import { CHAR_ADVANCE_EM, CHAR_HEIGHT_EM, charBoundingBox, inkyStore } from '../../lib/canvas/store'

export function CanvasLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let isLoopRunning = false

    const scheduleFrame = () => {
      if (!isLoopRunning) {
        isLoopRunning = true
        animationFrameId = requestAnimationFrame(render)
      }
    }

    const unsub = inkyStore.subscribe(() => {
      scheduleFrame()
    })

    const render = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()

      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
        ctx.scale(dpr, dpr)
      }

      ctx.clearRect(0, 0, rect.width, rect.height)

      const state = inkyStore
      const { x, y, z } = state.camera
      const viewportBox = getViewportBoundingBox(rect.width, rect.height, state.camera)

      ctx.save()
      ctx.translate(x, y)
      ctx.scale(z, z)

      // Recognition pulse: soft blue wash behind enclosed strokes (decays to 0)
      const pulse = state.recognizedPulse
      if (pulse) {
        const { alpha, done } = recognizedPulseAlpha(performance.now() - pulse.startedAt)
        if (done) {
          inkyStore.setRecognizedPulse(null)
        } else if (alpha > 0) {
          for (const id of pulse.strokeIds) {
            const s = state.strokes.find((st) => st.id === id)
            if (!s) continue
            const { minX, minY, maxX, maxY } = s.boundingBox
            const pad = 3 / z
            ctx.fillStyle = `rgba(37, 99, 235, ${alpha})`
            ctx.beginPath()
            ctx.roundRect(
              minX - pad,
              minY - pad,
              maxX - minX + pad * 2,
              maxY - minY + pad * 2,
              4 / z,
            )
            ctx.fill()
          }
        }
      }

      // Char highlight (hover = soft amber wash, eraser hover = red hairline,
      // selected = blue wash). Chars render under ink so handwriting stays on
      // top; these boxes match the DOM spans' world-space advance boxes.
      const drawCharBox = (
        ch: { worldX: number; worldY: number; fontSize: number; angle: number },
        fill: string | null,
        stroke: string | null,
      ) => {
        const w = ch.fontSize * CHAR_ADVANCE_EM
        const h = ch.fontSize * CHAR_HEIGHT_EM
        const pad = 2 / z
        ctx.save()
        if (ch.angle) {
          ctx.translate(ch.worldX + w / 2, ch.worldY + h / 2)
          ctx.rotate(ch.angle)
          ctx.translate(-(ch.worldX + w / 2), -(ch.worldY + h / 2))
        }
        if (fill) {
          ctx.fillStyle = fill
          ctx.fillRect(ch.worldX - pad, ch.worldY - pad, w + pad * 2, h + pad * 2)
        }
        if (stroke) {
          ctx.strokeStyle = stroke
          ctx.lineWidth = 1.5 / z
          ctx.strokeRect(ch.worldX - pad, ch.worldY - pad, w + pad * 2, h + pad * 2)
        }
        ctx.restore()
      }
      for (const stamp of state.stamps) {
        for (const ch of stamp.chars) {
          if (/\s/.test(ch.char)) continue
          const box = charBoundingBox(ch)
          if (!checkBoundingBoxOverlap(viewportBox, box)) continue
          if (state.selectedCharIds.includes(ch.id)) {
            drawCharBox(ch, 'rgba(37, 99, 235, 0.12)', null)
          } else if (state.activeTool === 'eraser' && state.hoveredCharId === ch.id) {
            drawCharBox(ch, null, '#ef4444')
          } else if (state.hoveredCharId === ch.id) {
            drawCharBox(ch, 'rgba(245, 158, 11, 0.14)', null)
          }
        }
      }
      // Draw all finalized strokes
      for (const stroke of state.strokes) {
        if (!checkBoundingBoxOverlap(viewportBox, stroke.boundingBox)) {
          continue
        }

        if (stroke.pathData) {
          ctx.save()
          if (stroke.angle) {
            const cx =
              stroke.boundingBox.minX + (stroke.boundingBox.maxX - stroke.boundingBox.minX) / 2
            const cy =
              stroke.boundingBox.minY + (stroke.boundingBox.maxY - stroke.boundingBox.minY) / 2
            ctx.translate(cx, cy)
            ctx.rotate(stroke.angle)
            ctx.translate(-cx, -cy)
          }

          // Draw stroke path
          ctx.fillStyle = stroke.color
          ctx.fill(new Path2D(stroke.pathData))

          // Eraser target stroke hover highlight (subtle soft red hairline)
          if (state.activeTool === 'eraser' && state.hoveredStrokeId === stroke.id) {
            const { minX, minY, maxX, maxY } = stroke.boundingBox
            const pad = 4 / z
            ctx.strokeStyle = '#ef4444'
            ctx.lineWidth = 1.5 / z
            ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2)
          }

          ctx.restore()
        }
      }

      // Lasso dissolve: the circle gesture fades + shrinks toward the capsule
      // anchor instead of vanishing. Cleared once complete.
      const dissolve = state.gestureDissolve
      if (dissolve) {
        const result = lassoDissolve(
          performance.now() - dissolve.startedAt,
          dissolve.anchor,
          dissolve.stroke,
        )
        if (result.done) {
          inkyStore.setGestureDissolve(null)
        } else if (dissolve.stroke.pathData) {
          ctx.save()
          ctx.globalAlpha = result.opacity
          const { x: ax, y: ay } = dissolve.anchor
          ctx.translate(ax, ay)
          ctx.scale(result.scale, result.scale)
          ctx.translate(-ax, -ay)
          ctx.fillStyle = dissolve.stroke.color
          ctx.fill(new Path2D(dissolve.stroke.pathData))
          ctx.restore()
        }
      }

      // Draw dynamic circular eraser reticle when active
      if (state.eraserPoint) {
        const { x: ex, y: ey, radius } = state.eraserPoint
        ctx.save()
        ctx.beginPath()
        ctx.arc(ex, ey, radius, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(239, 68, 68, 0.12)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'
        ctx.lineWidth = 1.5 / z
        ctx.stroke()
        ctx.restore()
      }

      // Draw active in-progress stroke
      if (state.currentStroke?.pathData) {
        ctx.fillStyle = state.currentStroke.color
        ctx.fill(new Path2D(state.currentStroke.pathData))
      }

      // Draw active marquee selection box
      if (state.marquee) {
        const { startX, startY, endX, endY } = state.marquee
        const minX = Math.min(startX, endX)
        const minY = Math.min(startY, endY)
        const width = Math.abs(endX - startX)
        const height = Math.abs(endY - startY)

        ctx.fillStyle = 'rgba(37, 99, 235, 0.08)'
        ctx.fillRect(minX, minY, width, height)

        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 1 / z
        ctx.setLineDash([5 / z, 5 / z])
        ctx.strokeRect(minX, minY, width, height)
        ctx.setLineDash([])
      }

      // Draw unified selection bounding box + handles
      if (
        state.activeTool === 'select' &&
        (state.selectedStrokeIds.length > 0 || state.selectedCharIds.length > 0)
      ) {
        const bbox = state.getSelectionBoundingBox()
        if (bbox) {
          const { minX, minY, maxX, maxY } = bbox
          const pad = 6 / z
          const bx = minX - pad
          const by = minY - pad
          const bw = maxX - minX + pad * 2
          const bh = maxY - minY + pad * 2

          // Draw main bounding box frame: clean, crisp, solid Apple-grade hairline
          ctx.strokeStyle = '#2563eb'
          ctx.lineWidth = 1.5 / z
          ctx.strokeRect(bx, by, bw, bh)

          // Draw 4 corner resize handles
          const handleSize = 8 / z
          const drawHandle = (hx: number, hy: number) => {
            ctx.beginPath()
            ctx.rect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize)
            ctx.fillStyle = '#ffffff'
            ctx.fill()
            ctx.strokeStyle = '#2563eb'
            ctx.lineWidth = 1.5 / z
            ctx.stroke()
          }

          drawHandle(bx, by) // nw
          drawHandle(bx + bw, by) // ne
          drawHandle(bx, by + bh) // sw
          drawHandle(bx + bw, by + bh) // se

          // Draw top rotation handle stick and circular head
          const rotateStickLen = 20 / z
          ctx.beginPath()
          ctx.strokeStyle = '#2563eb'
          ctx.lineWidth = 1.5 / z
          ctx.moveTo(bx + bw / 2, by)
          ctx.lineTo(bx + bw / 2, by - rotateStickLen)
          ctx.stroke()

          ctx.beginPath()
          ctx.arc(bx + bw / 2, by - rotateStickLen, 4 / z, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
          ctx.strokeStyle = '#2563eb'
          ctx.lineWidth = 1.5 / z
          ctx.stroke()
        }
      }

      ctx.restore()
      const needsContinuousAnimation =
        (state.activeTool === 'eraser' &&
          (state.hoveredStrokeId !== null ||
            state.hoveredCharId !== null ||
            state.eraserPoint !== null)) ||
        state.currentStroke !== null ||
        state.gestureDissolve !== null ||
        state.recognizedPulse !== null

      if (needsContinuousAnimation) {
        animationFrameId = requestAnimationFrame(render)
      } else {
        isLoopRunning = false
      }
    }

    scheduleFrame()

    return () => {
      unsub()
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
    />
  )
}
