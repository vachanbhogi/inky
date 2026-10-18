import { useEffect, useRef } from 'react'
import { checkBoundingBoxOverlap, getViewportBoundingBox } from '../../lib/canvas/spatial-index'
import { inkyStore } from '../../lib/canvas/store'

export function CanvasLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number

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

          ctx.fillStyle = stroke.color
          ctx.fill(new Path2D(stroke.pathData))

          // Subtle selection halo if individually selected and tool is select
          if (state.activeTool === 'select' && state.selectedStrokeIds.includes(stroke.id)) {
            const { minX, minY, maxX, maxY } = stroke.boundingBox
            ctx.strokeStyle = '#2563eb'
            ctx.lineWidth = 1 / z
            ctx.strokeRect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4)
          }

          ctx.restore()
        }
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

      ctx.restore()
      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
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
