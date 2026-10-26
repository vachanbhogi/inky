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
 * Extracts a usable PDF File from a DragEvent's DataTransfer across browsers
 * (handles Safari, Chrome, Firefox, Finder, and DataTransferItemList fallbacks).
 */
export function extractDroppedPdfFile(dataTransfer: DataTransfer | null | undefined): File | null {
  if (!dataTransfer) return null

  const isPdfFile = (f: File | null | undefined): f is File => {
    if (!f) return false
    const type = (f.type || '').toLowerCase()
    const name = (f.name || '').toLowerCase()
    // Accept standard PDF MIME, .pdf extension, or generic octet-stream/empty type if dropped as a file
    if (type === 'application/pdf' || type === 'application/x-pdf' || name.endsWith('.pdf')) {
      return true
    }
    return false
  }

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const f = dataTransfer.files[i]
      if (isPdfFile(f)) return f
    }
    // If only 1 file was dropped and browser omitted its MIME type, still let PDF.js attempt to parse its header
    if (dataTransfer.files[0]) return dataTransfer.files[0]
  }

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i]
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (isPdfFile(f)) return f
      }
    }
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i]
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) return f
      }
    }
  }

  return null
}

/**
 * Checks if a DragEvent carries files across browsers (DOMStringList vs Array).
 */
export function hasDraggedFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false
  if (dataTransfer.files && dataTransfer.files.length > 0) return true
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      if (dataTransfer.items[i].kind === 'file') return true
    }
  }
  const types = Array.from(dataTransfer.types ?? [])
  return (
    types.includes('Files') ||
    types.includes('application/x-moz-file') ||
    types.includes('public.file-url')
  )
}

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
