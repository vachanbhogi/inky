import { useEffect, useRef, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { boardCatalog, type PaperStyle, type WorksheetPage } from '../../lib/document/boardCatalog'

const PAGE_W = 816
const PAGE_H = 1056

function drawPaperPattern(
  ctx: CanvasRenderingContext2D,
  style: PaperStyle,
  pageX: number,
  pageY: number,
  pageW: number,
  pageH: number,
) {
  if (style === 'dot-grid') {
    const step = 24
    ctx.fillStyle = 'rgba(15, 23, 42, 0.16)'
    ctx.beginPath()
    for (let x = pageX + step; x < pageX + pageW - 12; x += step) {
      for (let y = pageY + step; y < pageY + pageH - 12; y += step) {
        ctx.moveTo(x + 1.3, y)
        ctx.arc(x, y, 1.3, 0, Math.PI * 2)
      }
    }
    ctx.fill()
  } else if (style === 'graph') {
    const minor = 20
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.065)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let dx = minor; dx < pageW; dx += minor) {
      if (dx % 100 !== 0) {
        ctx.moveTo(pageX + dx, pageY)
        ctx.lineTo(pageX + dx, pageY + pageH)
      }
    }
    for (let dy = minor; dy < pageH; dy += minor) {
      if (dy % 100 !== 0) {
        ctx.moveTo(pageX, pageY + dy)
        ctx.lineTo(pageX + pageW, pageY + dy)
      }
    }
    ctx.stroke()

    ctx.strokeStyle = 'rgba(30, 41, 59, 0.15)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let dx = 100; dx < pageW; dx += 100) {
      ctx.moveTo(pageX + dx, pageY)
      ctx.lineTo(pageX + dx, pageY + pageH)
    }
    for (let dy = 100; dy < pageH; dy += 100) {
      ctx.moveTo(pageX, pageY + dy)
      ctx.lineTo(pageX + pageW, pageY + dy)
    }
    ctx.stroke()
  } else if (style === 'lined') {
    const lineStep = 32
    const headerTop = 76
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let dy = headerTop; dy < pageH - 28; dy += lineStep) {
      ctx.moveTo(pageX, pageY + dy)
      ctx.lineTo(pageX + pageW, pageY + dy)
    }
    ctx.stroke()

    // Left red margin rule
    const marginX = pageX + 96
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.34)'
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(marginX, pageY)
    ctx.lineTo(marginX, pageY + pageH)
    ctx.stroke()
  }
}

export function WorksheetBackgroundLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pages, setPages] = useState<WorksheetPage[]>([])
  const [isPagedDoc, setIsPagedDoc] = useState(false)
  const [paperStyle, setPaperStyle] = useState<PaperStyle>('blank')

  useEffect(() => {
    const syncBoard = () => {
      const b = boardCatalog.getActiveBoard()
      setPages(b?.pdfPages ?? [])
      setIsPagedDoc(b?.type === 'worksheet')
      setPaperStyle(b?.paperStyle ?? 'blank')
    }
    syncBoard()

    const unsubCatalog = boardCatalog.subscribe(syncBoard)
    return unsubCatalog
  }, [])

  useEffect(() => {
    if (!isPagedDoc && pages.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

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

      // Subtle desk surface behind the page sheets
      ctx.fillStyle = '#f3f2ef'
      ctx.fillRect(0, 0, width, height)

      const { x, y, z } = inkyStore.camera

      ctx.save()
      ctx.translate(x, y)
      ctx.scale(z, z)

      const pageGap = 40
      let currentY = 80

      if (pages.length > 0) {
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i]
          const img = imgElements[i]
          const pageW = page.width
          const pageH = page.height
          const pageX = -pageW / 2

          ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
          ctx.shadowBlur = 24 / z
          ctx.shadowOffsetY = 8 / z
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(pageX, currentY, pageW, pageH)

          ctx.shadowColor = 'transparent'

          if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, pageX, currentY, pageW, pageH)
          }

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'
          ctx.lineWidth = 1 / z
          ctx.strokeRect(pageX, currentY, pageW, pageH)

          currentY += pageH + pageGap
        }
      } else {
        // Non-PDF Paged sheet (Blank, Dotted, Graph, or Lined paper)
        const pageX = -PAGE_W / 2
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
        ctx.shadowBlur = 24 / z
        ctx.shadowOffsetY = 8 / z
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(pageX, currentY, PAGE_W, PAGE_H)

        ctx.shadowColor = 'transparent'

        ctx.save()
        ctx.beginPath()
        ctx.rect(pageX, currentY, PAGE_W, PAGE_H)
        ctx.clip()
        drawPaperPattern(ctx, inkyStore.paperStyle || paperStyle, pageX, currentY, PAGE_W, PAGE_H)
        ctx.restore()

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'
        ctx.lineWidth = 1 / z
        ctx.strokeRect(pageX, currentY, PAGE_W, PAGE_H)
      }

      ctx.restore()
      ctx.restore()
    }

    const schedule = () => {
      if (animId === null) animId = requestAnimationFrame(render)
    }

    const unsubStore = inkyStore.subscribe(schedule)
    schedule()

    imgElements.forEach((img) => {
      img.onload = schedule
    })

    return () => {
      unsubStore()
      if (animId !== null) cancelAnimationFrame(animId)
    }
  }, [pages, isPagedDoc, paperStyle])

  if (!isPagedDoc && pages.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none select-none z-0"
    />
  )
}
