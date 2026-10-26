import { describe, expect, test } from 'bun:test'
import { getWorksheetPageBounds } from './pdfExporter'

describe('pdfExporter worksheet coordinate mapping', () => {
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
})
