import { useEffect, useRef, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { boardCatalog, type WorksheetPage } from '../../lib/document/boardCatalog'

export function WorksheetBackgroundLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pages, setPages] = useState<WorksheetPage[]>([])

  useEffect(() => {
    const active = boardCatalog.getActiveBoard()
    if (active?.pdfPages) {
      setPages(active.pdfPages)
    }

    const unsubCatalog = boardCatalog.subscribe(() => {
      const b = boardCatalog.getActiveBoard()
      setPages(b?.pdfPages ?? [])
    })

    return unsubCatalog
  }, [])

  useEffect(() => {
    if (pages.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Preload image elements for clean rendering
    const imgElements = pages.map((p) => {
      const img = new Image()
      img.src = p.dataUrl
      return img
    })

    let animId: number | null = null

    const render = () => {
      animId = null
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const width = rect.width || window.innerWidth
      const height = rect.height || window.innerHeight

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
      }

      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const { x, y, z } = inkyStore.camera

      ctx.save()
      ctx.translate(x, y)
      ctx.scale(z, z)

      const pageGap = 40
      let currentY = 80 // start with comfortable top breathing room

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const img = imgElements[i]
        const pageW = page.width
        const pageH = page.height
        const pageX = -pageW / 2 // centered horizontally at x = 0

        // Subtle sheet shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
        ctx.shadowBlur = 24 / z
        ctx.shadowOffsetY = 8 / z
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(pageX, currentY, pageW, pageH)

        // Reset shadow for content
        ctx.shadowColor = 'transparent'

        // Draw PDF page content
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, pageX, currentY, pageW, pageH)
        }

        // Sheet border hairline
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'
        ctx.lineWidth = 1 / z
        ctx.strokeRect(pageX, currentY, pageW, pageH)

        currentY += pageH + pageGap
      }

      ctx.restore()
      ctx.restore()
    }

    const schedule = () => {
      if (animId === null) animId = requestAnimationFrame(render)
    }

    const unsubStore = inkyStore.subscribe(schedule)
    schedule()

    // Trigger frame when images load
    imgElements.forEach((img) => {
      img.onload = schedule
    })

    return () => {
      unsubStore()
      if (animId !== null) cancelAnimationFrame(animId)
    }
  }, [pages])

  if (pages.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none select-none z-0"
    />
  )
}
