import { jsPDF } from 'jspdf'
import { inkyStore } from '../canvas/store'
import { generateStrokePath } from '../canvas/svg-utils'
import type { Stroke } from '../canvas/types'

export interface ExportPdfOptions {
  backgroundPages?: { pageNumber: number; width: number; height: number; dataUrl: string }[]
  title?: string
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

  if (bgPages.length > 0) {
    for (let i = 0; i < bgPages.length; i++) {
      if (i > 0) pdf.addPage('letter', 'portrait')
      const bg = bgPages[i]
      if (bg?.dataUrl) {
        pdf.addImage(bg.dataUrl, 'JPEG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'FAST')
      }
    }
  }

  // Draw ink strokes
  const strokes: Stroke[] = inkyStore.strokes
  if (strokes.length > 0) {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = 816 * scale
    canvas.height = 1056 * scale
    const ctx = canvas.getContext('2d')

    if (ctx) {
      ctx.scale(scale, scale)
      for (const stroke of strokes) {
        if (!stroke.points || stroke.points.length === 0) continue
        const pathData = stroke.pathData ?? generateStrokePath(stroke.points, stroke.size)
        if (!pathData) continue
        const p2d = new Path2D(pathData)
        ctx.fillStyle = stroke.color
        ctx.fill(p2d)
      }

      for (const stamp of inkyStore.stamps) {
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
