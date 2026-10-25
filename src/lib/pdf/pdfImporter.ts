import * as pdfjsLib from 'pdfjs-dist'

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
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
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
  })

  const pdf = await loadingTask.promise
  const numPages = pdf.numPages
  const pages: RenderedPdfPage[] = []

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.0 })

    const targetWidth = LETTER_WIDTH
    const targetHeight = Math.round(targetWidth * (viewport.height / viewport.width)) || LETTER_HEIGHT

    // 2x resolution for crisp high-DPI displays
    const renderScale = (targetWidth / viewport.width) * 2
    const renderViewport = page.getViewport({ scale: renderScale })

    const canvas = document.createElement('canvas')
    canvas.width = renderViewport.width
    canvas.height = renderViewport.height
    const ctx = canvas.getContext('2d')

    if (!ctx) continue

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page.render({ canvasContext: ctx, viewport: renderViewport } as any).promise)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    pages.push({
      pageNumber: i,
      width: targetWidth,
      height: targetHeight,
      dataUrl,
    })
  }

  return pages
}
