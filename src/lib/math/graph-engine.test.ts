import { describe, expect, it } from 'bun:test'
import { isGraphableExpression, type PlotOptions, plotFunction } from './graph-engine'

describe('isGraphableExpression', () => {
  it('detects explicit linear functions', () => {
    expect(isGraphableExpression('y = 2x + 1')).toBe(true)
    expect(isGraphableExpression('2x + 1')).toBe(true)
    expect(isGraphableExpression('y = -3x')).toBe(true)
  })

  it('detects quadratic functions and function notation', () => {
    expect(isGraphableExpression('y = x^2 - 4')).toBe(true)
    expect(isGraphableExpression('f(x) = x^2 - 4')).toBe(true)
    expect(isGraphableExpression('x^2 - 4')).toBe(true)
  })

  it('detects cubic functions', () => {
    expect(isGraphableExpression('x^3 - 3x')).toBe(true)
    expect(isGraphableExpression('y = x^3 - 3*x')).toBe(true)
  })

  it('detects rational and trigonometric functions', () => {
    expect(isGraphableExpression('1/x')).toBe(true)
    expect(isGraphableExpression('y = 1/x')).toBe(true)
    expect(isGraphableExpression('sin(x)')).toBe(true)
    expect(isGraphableExpression('f(x) = cos(x)')).toBe(true)
  })

  it('detects LaTeX formatted expressions', () => {
    expect(isGraphableExpression('y = x^{2} - 4')).toBe(true)
    expect(isGraphableExpression('\\frac{1}{x}')).toBe(true)
    expect(isGraphableExpression('\\sin(x)')).toBe(true)
    expect(isGraphableExpression('$y = 2x + 1$')).toBe(true)
  })

  it('rejects empty or whitespace inputs', () => {
    expect(isGraphableExpression('')).toBe(false)
    expect(isGraphableExpression('   ')).toBe(false)
  })

  it('rejects garbage text and malformed syntax', () => {
    expect(isGraphableExpression('hello')).toBe(false)
    expect(isGraphableExpression('????')).toBe(false)
    expect(isGraphableExpression('2x + = 1')).toBe(false)
    expect(isGraphableExpression('x^^2')).toBe(false)
    expect(isGraphableExpression('1 / ')).toBe(false)
  })

  it('rejects multivariable equations and non-function equalities', () => {
    expect(isGraphableExpression('x + y = 3')).toBe(false)
    expect(isGraphableExpression('x + y + z')).toBe(false)
    expect(isGraphableExpression('2x + 1 = 5')).toBe(false)
  })
})

describe('plotFunction', () => {
  it('plots a linear function y = 2x + 1', () => {
    const plot = plotFunction('y = 2x + 1')
    expect(plot).not.toBeNull()
    if (!plot) return

    expect(plot.bounds.xMin).toBe(-10)
    expect(plot.bounds.xMax).toBe(10)
    expect(plot.bounds.yMin).toBeCloseTo(-19, 1)
    expect(plot.bounds.yMax).toBeCloseTo(21, 1)

    // y-intercept at (0, 1)
    expect(plot.yIntercept).not.toBeNull()
    expect(plot.yIntercept?.x).toBe(0)
    expect(plot.yIntercept?.y).toBe(1)

    // x-intercept at (-0.5, 0)
    expect(plot.xIntercepts.length).toBe(1)
    expect(plot.xIntercepts[0].x).toBeCloseTo(-0.5, 2)
    expect(plot.xIntercepts[0].y).toBe(0)

    // No vertex for linear
    expect(plot.vertex).toBeNull()

    // 1 continuous segment
    expect(plot.segments.length).toBe(1)
    expect(plot.pathData).toMatch(/^M\s+\S+\s+\S+/)
    expect(plot.pathData).toContain('L')
  })

  it('plots a quadratic parabola y = x^2 - 4 with vertex and intercepts', () => {
    const plot = plotFunction('y = x^2 - 4')
    expect(plot).not.toBeNull()
    if (!plot) return

    expect(plot.bounds.xMin).toBe(-10)
    expect(plot.bounds.xMax).toBe(10)
    expect(plot.bounds.yMin).toBeCloseTo(-4, 1)
    expect(plot.bounds.yMax).toBeCloseTo(96, 1)

    // y-intercept at (0, -4)
    expect(plot.yIntercept).toEqual({ x: 0, y: -4 })

    // x-intercepts at -2 and 2
    expect(plot.xIntercepts.length).toBe(2)
    const rootXValues = plot.xIntercepts.map((p) => Math.round(p.x * 10) / 10).sort()
    expect(rootXValues).toEqual([-2, 2])
    expect(plot.xIntercepts.every((p) => p.y === 0)).toBe(true)

    // Vertex at (0, -4)
    expect(plot.vertex).toEqual({ x: 0, y: -4 })

    // 1 continuous segment
    expect(plot.segments.length).toBe(1)
    expect(plot.pathData).toMatch(/^M\s+\S+\s+\S+/)
    expect(plot.pathData).toContain('L')
  })

  it('plots a cubic function x^3 - 3x', () => {
    const plot = plotFunction('x^3 - 3x')
    expect(plot).not.toBeNull()
    if (!plot) return

    // y-intercept at (0, 0)
    expect(plot.yIntercept).toEqual({ x: 0, y: 0 })

    // 3 x-intercepts: -sqrt(3) (~ -1.732), 0, +sqrt(3) (~ 1.732)
    expect(plot.xIntercepts.length).toBe(3)
    const roots = plot.xIntercepts.map((p) => Math.round(p.x * 100) / 100).sort()
    expect(roots[0]).toBeCloseTo(-1.73, 1)
    expect(roots[1]).toBeCloseTo(0, 1)
    expect(roots[2]).toBeCloseTo(1.73, 1)

    // Cubic is not a parabola, vertex is null
    expect(plot.vertex).toBeNull()

    // 1 continuous segment
    expect(plot.segments.length).toBe(1)
    expect(plot.pathData).toContain('L')
  })

  it('plots rational function 1/x with split segments around vertical asymptote', () => {
    const plot = plotFunction('1/x')
    expect(plot).not.toBeNull()
    if (!plot) return

    // Discontinuity at 0: segments split cleanly
    expect(plot.segments.length).toBeGreaterThanOrEqual(2)
    // Left segment is strictly negative x, right segment is strictly positive x
    const seg1 = plot.segments[0]
    const seg2 = plot.segments[plot.segments.length - 1]
    expect(seg1.every((p) => p.x < 0)).toBe(true)
    expect(seg2.every((p) => p.x > 0)).toBe(true)

    // 1/x has no real roots and undefined y-intercept at 0
    expect(plot.xIntercepts).toEqual([])
    expect(plot.yIntercept).toBeNull()
    expect(plot.vertex).toBeNull()

    // SVG path contains multiple 'M' commands for disconnected subpaths
    const mCount = (plot.pathData.match(/M\b/g) || []).length
    expect(mCount).toBeGreaterThanOrEqual(2)
  })

  it('rejects non-graphable formulas by returning null', () => {
    expect(plotFunction('')).toBeNull()
    expect(plotFunction('   ')).toBeNull()
    expect(plotFunction('hello')).toBeNull()
    expect(plotFunction('????')).toBeNull()
    expect(plotFunction('2x + = 1')).toBeNull()
    expect(plotFunction('x^^2')).toBeNull()
    expect(plotFunction('x + y = 3')).toBeNull()
  })

  it('respects custom PlotOptions', () => {
    const options: PlotOptions = {
      xMin: -2,
      xMax: 4,
      width: 800,
      height: 600,
      samples: 100,
    }
    const plot = plotFunction('y = 2x + 1', options)
    expect(plot).not.toBeNull()
    if (!plot) return

    expect(plot.bounds.xMin).toBe(-2)
    expect(plot.bounds.xMax).toBe(4)
    expect(plot.bounds.yMin).toBeCloseTo(-3, 1)
    expect(plot.bounds.yMax).toBeCloseTo(9, 1)

    // Canvas coordinate range check: first point at cx=0, cy=600 (min y=-3 mapped to height=600)
    // last point at cx=800, cy=0 (max y=9 mapped to 0)
    expect(plot.pathData).toMatch(/^M\s+0(?:\.0+)?\s+600(?:\.0+)?/)
    expect(plot.pathData).toMatch(/L\s+800(?:\.0+)?\s+0(?:\.0+)?$/)
  })
})
