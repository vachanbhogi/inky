import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { toScreen } from '../../lib/canvas/coordinates'
import { inkyStore } from '../../lib/canvas/store'
import { boardCatalog, type PaperStyle, type WorksheetPage } from '../../lib/document/boardCatalog'

const PAGE_W = 816
const PAGE_H = 1056
const PAGE_START_Y = 80
const PAGE_GAP = 40

export function drawPaperPattern(
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
  const [pageCount, setPageCount] = useState(1)
  const [camera, setCamera] = useState(inkyStore.camera)

  useEffect(() => {
    const syncBoard = () => {
      const b = boardCatalog.getActiveBoard()
      const pdfs = b?.pdfPages ?? []
      setPages(pdfs)
      setIsPagedDoc(b?.type === 'worksheet')
      setPaperStyle(b?.paperStyle ?? 'blank')
      setPageCount(Math.max(1, b?.pageCount ?? 1, pdfs.length))
    }
    syncBoard()

    const unsubCatalog = boardCatalog.subscribe(syncBoard)
    const unsubStore = inkyStore.subscribe(() => {
      setCamera((prev) => {
        const c = inkyStore.camera
        return prev.x === c.x && prev.y === c.y && prev.z === c.z ? prev : { ...c }
      })
    })
    return () => {
      unsubCatalog()
      unsubStore()
    }
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

      let currentY = PAGE_START_Y
      const totalSheets = Math.max(pageCount, pages.length, 1)

      for (let i = 0; i < totalSheets; i++) {
        const page = pages[i]
        const img = imgElements[i]
        const pageW = page?.width || PAGE_W
        const pageH = page?.height || PAGE_H
        const pageX = -pageW / 2

        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
        ctx.shadowBlur = 24 / z
        ctx.shadowOffsetY = 8 / z
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(pageX, currentY, pageW, pageH)

        ctx.shadowColor = 'transparent'

        if (page && img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, pageX, currentY, pageW, pageH)
        } else if (!page) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(pageX, currentY, pageW, pageH)
          ctx.clip()
          drawPaperPattern(ctx, inkyStore.paperStyle || paperStyle, pageX, currentY, pageW, pageH)
          ctx.restore()
        }

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'
        ctx.lineWidth = 1 / z
        ctx.strokeRect(pageX, currentY, pageW, pageH)

        // Subtle page number watermark in bottom-right corner when multi-page
        if (totalSheets > 1) {
          ctx.save()
          ctx.font = `500 ${11}px -apple-system, BlinkMacSystemFont, sans-serif`
          ctx.fillStyle = 'rgba(120, 119, 116, 0.55)'
          ctx.textAlign = 'right'
          ctx.fillText(`${i + 1} / ${totalSheets}`, pageX + pageW - 20, currentY + pageH - 16)
          ctx.restore()
        }

        currentY += pageH + PAGE_GAP
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
  }, [pages, isPagedDoc, paperStyle, pageCount])

  if (!isPagedDoc && pages.length === 0) return null

  const totalSheets = Math.max(pageCount, pages.length, 1)
  let bottomWorldY = PAGE_START_Y
  for (let i = 0; i < totalSheets; i++) {
    const h = pages[i]?.height || PAGE_H
    bottomWorldY += h + (i < totalSheets - 1 ? PAGE_GAP : 0)
  }
  const [btnScreenX, btnScreenY] = toScreen(0, bottomWorldY + 28, camera)

  const handleAddPage = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newTotal = boardCatalog.addPageToActiveBoard()
    setPageCount(newTotal)
    // Pan camera smoothly to bring the top of the newly added page into comfortable view
    const newPageTopY = bottomWorldY + PAGE_GAP
    inkyStore.setCamera({
      y: Math.round(100 - newPageTopY * inkyStore.camera.z),
    })
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none select-none z-0"
      />
      <div
        className="inky-ui absolute z-20 pointer-events-auto"
        style={{
          left: `${btnScreenX}px`,
          top: `${btnScreenY}px`,
          transform: 'translate(-50%, -50%)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleAddPage}
          aria-label="Add page"
          title="Add a new page below"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/95 hover:bg-white text-[#111111] border border-black/10 hover:border-black/20 shadow-[0_4px_14px_rgba(0,0,0,0.06)] text-xs font-medium transition-all active:scale-95 cursor-pointer"
        >
          <Plus size={14} strokeWidth={2.2} />
          <span>Add page</span>
        </button>
      </div>
    </>
  )
}
