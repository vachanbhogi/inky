import { describe, expect, test } from 'bun:test'
import { planStamp, synthesizeHandwrittenStrokes, unsupportedGlyphs } from './math-to-strokes'

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

describe('stamped glyph coverage (final review C1)', () => {
  test('decimal points and exponents are renderable — no silent glyph loss', () => {
    expect(unsupportedGlyphs('x = 2.50')).toEqual([])
    expect(unsupportedGlyphs('(x - 2)^2 = 0')).toEqual([])
    expect(unsupportedGlyphs('x = 2.00, -1.00')).toEqual([])
  })

  test('un-renderable glyphs are reported instead of swallowed', () => {
    const missing = unsupportedGlyphs('No real roots')
    for (const ch of ['N', 'o', 'r', 'e', 'a', 'l', 't', 's']) {
      expect(missing).toContain(ch)
    }
    expect(unsupportedGlyphs('100%')).toEqual(['%'])
  })

  test('the decimal point adds a visible dot stroke', () => {
    const withDot = synthesizeHandwrittenStrokes('2.50', 0, 0)
    const withoutDot = synthesizeHandwrittenStrokes('250', 0, 0)
    expect(withDot.length).toBe(withoutDot.length + 1)
  })

  test('exponents render raised and smaller than baseline digits', () => {
    const baseline = synthesizeHandwrittenStrokes('x2', 0, 0)
    const raised = synthesizeHandwrittenStrokes('x^2', 0, 0)
    const baselineDigit = baseline[baseline.length - 1]
    const raisedDigit = raised[raised.length - 1]
    expect(raisedDigit.boundingBox.maxY).toBeLessThan(baselineDigit.boundingBox.maxY)
    const raisedWidth = raisedDigit.boundingBox.maxX - raisedDigit.boundingBox.minX
    const baselineWidth = baselineDigit.boundingBox.maxX - baselineDigit.boundingBox.minX
    expect(raisedWidth).toBeLessThan(baselineWidth)
  })
})

describe('planStamp (final review I1)', () => {
  test('refuses to stamp un-renderable results and returns a message', () => {
    const plan = planStamp('No real roots', 0, 0)
    expect(plan.kind).toBe('show')
    if (plan.kind === 'show') expect(plan.message).toBe('No real roots')
  })

  test('stamps renderable results as strokes', () => {
    const plan = planStamp('x = 2.50', 0, 0)
    expect(plan.kind).toBe('stamp')
    if (plan.kind === 'stamp') expect(plan.strokes.length).toBeGreaterThan(0)
  })
})
