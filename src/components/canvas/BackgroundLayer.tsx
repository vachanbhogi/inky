import { useEffect, useRef, useState } from 'react'
import { inkyStore, type PaperStyle } from '../../lib/canvas/store'

export function BackgroundLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [paperStyle, setPaperStyle] = useState<PaperStyle>(inkyStore.paperStyle)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    let animationFrameId: number | null = null

    const render = () => {
      animationFrameId = null
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const width = rect.width || window.innerWidth || 800
      const height = rect.height || window.innerHeight || 600

      const targetWidth = Math.round(width * dpr)
      const targetHeight = Math.round(height * dpr)

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }

      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Base warm off-white surface
      ctx.fillStyle = '#fbfbfa'
      ctx.fillRect(0, 0, width, height)

      const currentStyle = inkyStore.paperStyle
      const { x, y, z } = inkyStore.camera

      if (currentStyle === 'dot-grid') {
        const step = 24 * z
        if (step >= 6) {
          const startX = ((x % step) + step) % step
          const startY = ((y % step) + step) % step
          const radius = Math.max(0.8, Math.min(1.2 * Math.sqrt(z), 2.2))

          ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
          ctx.beginPath()
          for (let sx = startX; sx <= width; sx += step) {
            for (let sy = startY; sy <= height; sy += step) {
              ctx.moveTo(sx + radius, sy)
              ctx.arc(sx, sy, radius, 0, Math.PI * 2)
            }
          }
          ctx.fill()
        }
      } else if (currentStyle === 'graph') {
        const minWorldX = (0 - x) / z
        const maxWorldX = (width - x) / z
        const minWorldY = (0 - y) / z
        const maxWorldY = (height - y) / z

        const minorStep = 20 * z

        // Minor grid lines (every 20px in world space, omitting multiples of 5)
        if (minorStep >= 6) {
          const firstMinorX = Math.floor(minWorldX / 20)
          const lastMinorX = Math.ceil(maxWorldX / 20)
          const firstMinorY = Math.floor(minWorldY / 20)
          const lastMinorY = Math.ceil(maxWorldY / 20)

          ctx.strokeStyle = 'rgba(30, 41, 59, 0.06)'
          ctx.lineWidth = 1
          ctx.beginPath()

          for (let i = firstMinorX; i <= lastMinorX; i++) {
            if (i % 5 !== 0) {
              const sx = Math.round(i * 20 * z + x) + 0.5
              ctx.moveTo(sx, 0)
              ctx.lineTo(sx, height)
            }
          }

          for (let j = firstMinorY; j <= lastMinorY; j++) {
            if (j % 5 !== 0) {
              const sy = Math.round(j * 20 * z + y) + 0.5
              ctx.moveTo(0, sy)
              ctx.lineTo(width, sy)
            }
          }
          ctx.stroke()
        }

        // Major grid lines (every 100px in world space)
        const firstMajorX = Math.floor(minWorldX / 100)
        const lastMajorX = Math.ceil(maxWorldX / 100)
        const firstMajorY = Math.floor(minWorldY / 100)
        const lastMajorY = Math.ceil(maxWorldY / 100)

        ctx.strokeStyle = 'rgba(30, 41, 59, 0.16)'
        ctx.lineWidth = 1.2
        ctx.beginPath()

        for (let i = firstMajorX; i <= lastMajorX; i++) {
          const sx = Math.round(i * 100 * z + x) + 0.5
          ctx.moveTo(sx, 0)
          ctx.lineTo(sx, height)
        }

        for (let j = firstMajorY; j <= lastMajorY; j++) {
          const sy = Math.round(j * 100 * z + y) + 0.5
          ctx.moveTo(0, sy)
          ctx.lineTo(width, sy)
        }
        ctx.stroke()
      } else if (currentStyle === 'lined') {
        const lineStep = 32 * z
        const minWorldY = (0 - y) / z
        const maxWorldY = (height - y) / z

        if (lineStep >= 6) {
          const firstY = Math.floor(minWorldY / 32)
          const lastY = Math.ceil(maxWorldY / 32)

          ctx.strokeStyle = 'rgba(37, 99, 235, 0.12)'
          ctx.lineWidth = 1
          ctx.beginPath()

          for (let j = firstY; j <= lastY; j++) {
            const sy = Math.round(j * 32 * z + y) + 0.5
            ctx.moveTo(0, sy)
            ctx.lineTo(width, sy)
          }
          ctx.stroke()
        }

        // Notebook left margin vertical rule at worldX = 96
        const marginSx = Math.round(96 * z + x) + 0.5
        if (marginSx >= 0 && marginSx <= width) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.28)'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(marginSx, 0)
          ctx.lineTo(marginSx, height)
          ctx.stroke()
        }
      }

      ctx.restore()
    }

    const scheduleFrame = () => {
      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(render)
      }
    }

    const unsub = inkyStore.subscribe(() => {
      canvas.setAttribute('data-paper-style', inkyStore.paperStyle)
      setPaperStyle(inkyStore.paperStyle)
      scheduleFrame()
    })

    const handleResize = () => {
      scheduleFrame()
    }

    window.addEventListener('resize', handleResize)
    scheduleFrame()

    return () => {
      unsub()
      window.removeEventListener('resize', handleResize)
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      data-testid="background-layer"
      data-paper-style={paperStyle}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
    />
  )
}
