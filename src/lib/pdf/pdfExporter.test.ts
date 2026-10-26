import { describe, expect, test } from 'bun:test'
import { drawPaperPattern } from '../../components/canvas/WorksheetBackgroundLayer'
import { exportToPdf, getWorksheetPageBounds } from './pdfExporter'

describe('pdfExporter worksheet coordinate mapping & background rendering', () => {
  test('maps single-page worksheet world bounds centered at x=0 and top y=80', () => {
    const bounds = getWorksheetPageBounds(0)
    expect(bounds).toEqual({
      pageX: -408,
      pageY: 80,
      pageW: 816,
      pageH: 1056,
    })
  })

  test('maps multi-page worksheet world bounds with 40px page gap', () => {
    const bgPages = [
      { width: 816, height: 1056 },
      { width: 816, height: 1056 },
    ]
    const page1 = getWorksheetPageBounds(0, bgPages)
    const page2 = getWorksheetPageBounds(1, bgPages)

    expect(page1.pageY).toBe(80)
    expect(page2.pageY).toBe(80 + 1056 + 40)
    expect(page2.pageX).toBe(-408)
  })

  test('drawPaperPattern draws dots, grid lines, and binder rules onto canvas context', () => {
    let fillCalls = 0
    let strokeCalls = 0
    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {
        fillCalls++
      },
      stroke: () => {
        strokeCalls++
      },
    } as unknown as CanvasRenderingContext2D

    drawPaperPattern(mockCtx, 'dot-grid', 0, 0, 816, 1056)
    expect(fillCalls).toBe(1)

    drawPaperPattern(mockCtx, 'graph', 0, 0, 816, 1056)
    expect(strokeCalls).toBe(2)

    strokeCalls = 0
    drawPaperPattern(mockCtx, 'lined', 0, 0, 816, 1056)
    expect(strokeCalls).toBe(2)
  })

  test('exportToPdf renders paper background even when there are zero strokes', async () => {
    let fillRectCalled = false
    let strokeCalled = false
    const origGetContext = HTMLCanvasElement.prototype.getContext
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL

    // Minimal 1x1 transparent PNG data URL for jsPDF addImage in happy-dom
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

    HTMLCanvasElement.prototype.getContext = (() => ({
      scale: () => {},
      translate: () => {},
      rotate: () => {},
      save: () => {},
      restore: () => {},
      fillRect: () => {
        fillRectCalled = true
      },
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {
        strokeCalled = true
      },
      fillText: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
    })) as unknown as typeof origGetContext
    HTMLCanvasElement.prototype.toDataURL = () => tinyPng

    try {
      const blob = await exportToPdf({ paperStyle: 'graph', pageCount: 1 })
      expect(blob).toBeInstanceOf(Blob)
      expect(fillRectCalled).toBe(true)
      expect(strokeCalled).toBe(true)
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext
      HTMLCanvasElement.prototype.toDataURL = origToDataURL
    }
  })
})
