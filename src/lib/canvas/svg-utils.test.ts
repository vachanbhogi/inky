import { describe, expect, it } from 'vitest'
import { generateStrokePath, getSvgPathFromStroke } from './svg-utils'

describe('svg-utils', () => {
  it('generates an SVG path data string from polygon stroke points', () => {
    const strokePoints = [
      [10, 10],
      [20, 10],
      [20, 20],
      [10, 20],
    ]
    const path = getSvgPathFromStroke(strokePoints)
    expect(path).toMatch(/^M\s*10\.00\s*10\.00/)
    expect(path).toMatch(/Z$/)
  })

  it('handles empty stroke points without crashing', () => {
    expect(getSvgPathFromStroke([])).toBe('')
    expect(generateStrokePath([])).toBe('')
  })

  it('generates smooth stroke path immediately from raw input points', () => {
    const rawPoints: [number, number][] = [
      [10, 10],
      [20, 20],
      [30, 30],
    ]
    const path = generateStrokePath(rawPoints, 4)
    expect(path.length).toBeGreaterThan(0)
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
  })
})
