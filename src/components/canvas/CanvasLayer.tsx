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
          ctx.fillStyle = stroke.color
          ctx.fill(new Path2D(stroke.pathData))
        }
      }

      // Draw active in-progress stroke
      if (state.currentStroke?.pathData) {
        ctx.fillStyle = state.currentStroke.color
        ctx.fill(new Path2D(state.currentStroke.pathData))
      }

      ctx.restore()
      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
}
