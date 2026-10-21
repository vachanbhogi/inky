import { describe, expect, test } from 'bun:test'
import { synthesizeHandwrittenStrokes } from './math-to-strokes'

describe('math-to-strokes', () => {
  test('synthesizes vector strokes for "x = 3"', () => {
    const strokes = synthesizeHandwrittenStrokes('x = 3', 100, 100, 40, '#2563eb')
    expect(strokes.length).toBeGreaterThanOrEqual(4) // 2 for 'x', 2 for '=', 1 for '3'
    expect(strokes[0].color).toBe('#2563eb')
    expect(strokes[0].pathData).toBeDefined()
    expect(strokes[0].points.length).toBeGreaterThan(1)
    expect(strokes[0].boundingBox.minX).toBeGreaterThanOrEqual(100)
  })

  test('synthesizes vector strokes for numbers and operators', () => {
    const strokes = synthesizeHandwrittenStrokes('+ 42', 200, 300)
    expect(strokes.length).toBeGreaterThan(2)
  })
})
