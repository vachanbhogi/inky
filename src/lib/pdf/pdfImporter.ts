import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

export interface RenderedPdfPage {
  pageNumber: number
  width: number
  height: number
  dataUrl: string
}

export const LETTER_WIDTH = 816
export const LETTER_HEIGHT = 1056

/**
 * Extracts all pages of a PDF into high-res images at standard letter width.
 */
export async function renderPdfToPages(data: ArrayBuffer | Uint8Array): Promise<RenderedPdfPage[]> {
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data.slice(0))
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useSystemFonts: true,
  })

  const pdf = await loadingTask.promise
  const numPages = pdf.numPages
  const pages: RenderedPdfPage[] = []

  // Adaptive scale & JPEG quality so multi-page PDFs remain crisp while staying
  // well within localStorage / IndexedDB storage budgets.
  const dpiMultiplier = numPages > 8 ? 1.35 : numPages > 4 ? 1.6 : 2
  const jpegQuality = numPages > 8 ? 0.76 : numPages > 4 ? 0.84 : 0.9

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.0 })

    const targetWidth = LETTER_WIDTH
    const targetHeight =
      Math.round(targetWidth * (viewport.height / viewport.width)) || LETTER_HEIGHT

    const renderScale = (targetWidth / viewport.width) * dpiMultiplier
    const renderViewport = page.getViewport({ scale: renderScale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(renderViewport.width)
    canvas.height = Math.round(renderViewport.height)
    const ctx = canvas.getContext('2d')

    if (!ctx) continue

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page.render({ canvas: canvas as any, canvasContext: ctx, viewport: renderViewport } as any).promise)

    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality)
    pages.push({
      pageNumber: i,
      width: targetWidth,
      height: targetHeight,
      dataUrl,
    })
  }

  return pages
}
