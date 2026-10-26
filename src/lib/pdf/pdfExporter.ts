import { jsPDF } from 'jspdf'
import { inkyStore } from '../canvas/store'
import { generateStrokePath } from '../canvas/svg-utils'
import type { Stroke } from '../canvas/types'

export interface ExportPdfOptions {
  backgroundPages?: { pageNumber: number; width: number; height: number; dataUrl: string }[]
  title?: string
}

const DEFAULT_PAGE_W = 816
const DEFAULT_PAGE_H = 1056
const PAGE_START_Y = 80
const PAGE_GAP = 40

/**
 * Computes the world-space coordinate offset for page `pageIndex` so that
 * world coordinates on the worksheet sheet (`x in [-pageW/2, pageW/2]`,
 * `y in [pageTopY, pageTopY + pageH]`) map cleanly onto `[0, pageW] x [0, pageH]`.
 */
export function getWorksheetPageBounds(
  pageIndex: number,
  bgPages: { width: number; height: number }[] = [],
): { pageX: number; pageY: number; pageW: number; pageH: number } {
  let currentY = PAGE_START_Y
  for (let i = 0; i < pageIndex; i++) {
    const h = bgPages[i]?.height || DEFAULT_PAGE_H
    currentY += h + PAGE_GAP
  }
  const pageW = bgPages[pageIndex]?.width || DEFAULT_PAGE_W
  const pageH = bgPages[pageIndex]?.height || DEFAULT_PAGE_H
  return {
    pageX: -pageW / 2,
    pageY: currentY,
    pageW,
    pageH,
  }
}

/**
 * Exports current strokes and math stamps onto a PDF document.
 */
export async function exportToPdf(options?: ExportPdfOptions): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  })

  const pageWidthPt = 612
  const pageHeightPt = 792

  const bgPages = options?.backgroundPages ?? []
  const strokes: Stroke[] = inkyStore.strokes
  const stamps = inkyStore.stamps
  const hasInk = strokes.length > 0 || stamps.length > 0

  const totalPages = Math.max(1, bgPages.length)

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      pdf.addPage('letter', 'portrait')
    }

    const bg = bgPages[pageIdx]
    if (bg?.dataUrl) {
      pdf.addImage(bg.dataUrl, 'JPEG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'FAST')
    }

    if (hasInk) {
      const { pageX, pageY, pageW, pageH } = getWorksheetPageBounds(pageIdx, bgPages)
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = pageW * scale
      canvas.height = pageH * scale
      const ctx = canvas.getContext('2d')

      if (ctx) {
        ctx.scale(scale, scale)
        // Translate world space so (pageX, pageY) is at canvas (0, 0)
        ctx.translate(-pageX, -pageY)

        for (const stroke of strokes) {
          if (!stroke.points || stroke.points.length === 0) continue
          const pathData = stroke.pathData ?? generateStrokePath(stroke.points, stroke.size)
          if (!pathData) continue
          const p2d = new Path2D(pathData)
          ctx.save()
          if (stroke.angle && stroke.boundingBox) {
            const cx = (stroke.boundingBox.minX + stroke.boundingBox.maxX) / 2
            const cy = (stroke.boundingBox.minY + stroke.boundingBox.maxY) / 2
            ctx.translate(cx, cy)
            ctx.rotate(stroke.angle)
            ctx.translate(-cx, -cy)
          }
          ctx.fillStyle = stroke.color
          ctx.fill(p2d)
          ctx.restore()
        }

        for (const stamp of stamps) {
          if (!stamp.chars || stamp.chars.length === 0) continue
          ctx.fillStyle = stamp.color
          for (const ch of stamp.chars) {
            ctx.save()
            ctx.font = `${ch.fontSize}px 'Caveat', cursive, sans-serif`
            ctx.translate(ch.worldX, ch.worldY)
            if (ch.angle) ctx.rotate(ch.angle)
            ctx.fillText(ch.char, 0, ch.fontSize)
            ctx.restore()
          }
        }

        const inkDataUrl = canvas.toDataURL('image/png')
        pdf.addImage(inkDataUrl, 'PNG', 0, 0, pageWidthPt, pageHeightPt)
      }
    }
  }

  return pdf.output('blob')
}

export function downloadBlob(blob: Blob, filename = 'homework.pdf') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
