'use client'

import { useEffect, useRef } from 'react'
import { checkBoundingBoxOverlap, getViewportBoundingBox } from '../../lib/canvas/spatial-index'
import { inkyStore } from '../../lib/canvas/store'
import type { Stroke } from '../../lib/canvas/types'

export function CanvasLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let marchOffset = 0
    let lastTime = performance.now()

    // Render Loop
    const render = (now: number) => {
      const dt = now - lastTime
      lastTime = now

      // Animate marching ants
      marchOffset -= dt * 0.02
      if (marchOffset < -20) marchOffset += 20

      // Handle resize matching display size
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()

      // Only resize if the display size has changed
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
        // Normalize coordinate system to use css pixels
        ctx.scale(dpr, dpr)
      }

      ctx.clearRect(0, 0, rect.width, rect.height)

      const state = inkyStore
      const { x, y, z } = state.camera
      // Calculate viewport bounds for culling
      const viewportBox = getViewportBoundingBox(rect.width, rect.height, state.camera)

      ctx.save()

      // Apply Camera Transform: Zoom then Pan
      ctx.translate(x, y)
      ctx.scale(z, z)

      // Render finalized strokes
      for (const stroke of state.strokes) {
        // Spatial Culling: skip if stroke is outside viewport (account for x/y translation offsets)
        const cullBox = {
          minX: stroke.boundingBox.minX + stroke.x,
          minY: stroke.boundingBox.minY + stroke.y,
          maxX: stroke.boundingBox.maxX + stroke.x,
          maxY: stroke.boundingBox.maxY + stroke.y,
        }
        if (!checkBoundingBoxOverlap(viewportBox, cullBox)) {
          continue
        }

        if (stroke.shapeType && stroke.shapeData) {
          renderShape(ctx, stroke, state.hoveredElementId, state.activeTool, z)
          continue
        }

        if (stroke.pathData) {
          ctx.save()

          const origCx =
            stroke.boundingBox.minX + (stroke.boundingBox.maxX - stroke.boundingBox.minX) / 2
          const origCy =
            stroke.boundingBox.minY + (stroke.boundingBox.maxY - stroke.boundingBox.minY) / 2

          ctx.translate(origCx + stroke.x, origCy + stroke.y)
          ctx.rotate(stroke.angle)
          ctx.translate(-origCx, -origCy)

          const path = new Path2D(stroke.pathData)
          ctx.fillStyle = stroke.color
          ctx.fill(path)

          // Individual selection outline
          const isSelected = state.selectedStrokeIds.includes(stroke.id)
          const isHovered = state.hoveredElementId === stroke.id && state.activeTool === 'eraser'

          if (isSelected || isHovered) {
            const { minX, minY, maxX, maxY } = stroke.boundingBox
            ctx.strokeStyle = '#6366f1'
            ctx.lineWidth = (isSelected && !isHovered ? 1 : 2) / z
            if (isHovered) ctx.setLineDash([5 / z, 5 / z])
            ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
            ctx.setLineDash([])
          }

          ctx.restore()
        }
      }

      // Draw unified selection box
      if (
        state.activeTool === 'select' &&
        (state.selectedStrokeIds.length > 0 || state.selectedWidgetIds.length > 0)
      ) {
        const selection = state.getSelectionBoundingBox()
        if (selection) {
          const { box, angle } = selection
          const { minX, minY, maxX, maxY } = box

          ctx.save()
          const cx = minX + (maxX - minX) / 2
          const cy = minY + (maxY - minY) / 2
          ctx.translate(cx, cy)
          ctx.rotate(angle)
          ctx.translate(-cx, -cy)

          const pad = 4
          const bx = minX - pad
          const by = minY - pad
          const bw = maxX - minX + pad * 2
          const bh = maxY - minY + pad * 2

          // Draw bounding box with marching ants
          const selColor = '#6366f1'
          ctx.strokeStyle = selColor
          ctx.lineWidth = 1.5 / z
          ctx.setLineDash([6 / z, 4 / z])
          ctx.lineDashOffset = marchOffset / z
          ctx.strokeRect(bx, by, bw, bh)
          ctx.setLineDash([])
          ctx.lineDashOffset = 0

          // Draw corner handles
          const handleSize = 8 / z
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = selColor
          ctx.lineWidth = 1.5 / z

          const drawHandle = (hx: number, hy: number) => {
            ctx.beginPath()
            ctx.roundRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize, 2 / z)
            ctx.fill()
            ctx.stroke()
          }

          drawHandle(bx, by) // nw
          drawHandle(bx + bw, by) // ne
          drawHandle(bx, by + bh) // sw
          drawHandle(bx + bw, by + bh) // se

          // Draw rotation handle
          const rotateStickLen = 24 / z
          ctx.beginPath()
          ctx.strokeStyle = selColor
          ctx.lineWidth = 1.5 / z
          ctx.moveTo(bx + bw / 2, by)
          ctx.lineTo(bx + bw / 2, by - rotateStickLen)
          ctx.stroke()

          // Rotation circle handle
          ctx.beginPath()
          ctx.arc(bx + bw / 2, by - rotateStickLen, 4 / z, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
          ctx.strokeStyle = selColor
          ctx.lineWidth = 1.5 / z
          ctx.stroke()

          ctx.restore()
        }
      }

      if (state.marquee) {
        const { startX, startY, endX, endY } = state.marquee
        const width = endX - startX
        const height = endY - startY

        ctx.fillStyle = 'rgba(99, 102, 241, 0.08)'
        ctx.fillRect(startX, startY, width, height)

        ctx.strokeStyle = '#6366f1'
        ctx.lineWidth = 1 / z
        ctx.setLineDash([5 / z, 5 / z])
        ctx.lineDashOffset = marchOffset / z
        ctx.strokeRect(startX, startY, width, height)
        ctx.setLineDash([])
        ctx.lineDashOffset = 0
      }

      if (state.currentStroke) {
        if (state.currentStroke.shapeType && state.currentStroke.shapeData) {
          renderShape(ctx, state.currentStroke, null, state.activeTool, z)
        } else if (state.currentStroke.pathData) {
          const path = new Path2D(state.currentStroke.pathData)
          ctx.fillStyle = state.currentStroke.color
          ctx.fill(path)
        }
      }

      ctx.restore()

      // Loop
      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => cancelAnimationFrame(animationFrameId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{ touchAction: 'none' }}
    />
  )
}

// Shape rendering helper
function renderShape(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  hoveredId: string | null,
  activeTool: string,
  z: number,
) {
  if (!stroke.shapeData) return
  const { startX, startY, endX, endY } = stroke.shapeData

  ctx.save()

  // Apply OBB transform
  const origCx = stroke.boundingBox.minX + (stroke.boundingBox.maxX - stroke.boundingBox.minX) / 2
  const origCy = stroke.boundingBox.minY + (stroke.boundingBox.maxY - stroke.boundingBox.minY) / 2
  ctx.translate(origCx + stroke.x, origCy + stroke.y)
  ctx.rotate(stroke.angle)
  ctx.translate(-origCx, -origCy)

  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (stroke.shapeType) {
    case 'rectangle': {
      const rx = Math.min(startX, endX)
      const ry = Math.min(startY, endY)
      const rw = Math.abs(endX - startX)
      const rh = Math.abs(endY - startY)
      ctx.beginPath()
      ctx.roundRect(rx, ry, rw, rh, Math.min(4, rw * 0.05, rh * 0.05))
      ctx.stroke()
      break
    }
    case 'ellipse': {
      const ecx = (startX + endX) / 2
      const ecy = (startY + endY) / 2
      const erx = Math.abs(endX - startX) / 2
      const ery = Math.abs(endY - startY) / 2
      ctx.beginPath()
      ctx.ellipse(ecx, ecy, Math.max(1, erx), Math.max(1, ery), 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'line': {
      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(endX, endY)
      ctx.stroke()
      break
    }
    case 'arrow': {
      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(endX, endY)
      ctx.stroke()

      // Arrowhead
      const angle = Math.atan2(endY - startY, endX - startX)
      const headLen = Math.max(12, stroke.size * 3)
      ctx.beginPath()
      ctx.moveTo(endX, endY)
      ctx.lineTo(
        endX - headLen * Math.cos(angle - Math.PI / 6),
        endY - headLen * Math.sin(angle - Math.PI / 6),
      )
      ctx.moveTo(endX, endY)
      ctx.lineTo(
        endX - headLen * Math.cos(angle + Math.PI / 6),
        endY - headLen * Math.sin(angle + Math.PI / 6),
      )
      ctx.stroke()
      break
    }
  }

  const isSelected = inkyStore.selectedStrokeIds.includes(stroke.id) && activeTool === 'select'
  const isHovered = hoveredId === stroke.id && activeTool === 'eraser'

  if (isSelected || isHovered) {
    const { minX, minY, maxX, maxY } = stroke.boundingBox
    ctx.strokeStyle = '#6366f1'
    ctx.lineWidth = (isSelected && !isHovered ? 1 : 2) / z
    if (isHovered) ctx.setLineDash([5 / z, 5 / z])
    ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8)
    ctx.setLineDash([])
  }

  ctx.restore()
}
