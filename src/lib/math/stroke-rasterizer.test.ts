import { describe, expect, test } from 'bun:test'
import type { Stroke } from '../canvas/types'
import { cleanLatexOutput, deskewStrokes, rasterizeStrokesToTensor } from './stroke-rasterizer'

const s: Stroke = {
  id: 's1',
  points: [
    [120, 10],
    [115, 30],
    [110, 50],
    [105, 70],
    [100, 90],
    [95, 110],
  ],
  color: '#000',
  size: 3,
  boundingBox: { minX: 95, minY: 10, maxX: 120, maxY: 110 },
}

describe('stroke-rasterizer', () => {
  test('cleanLatexOutput', () => {
    expect(cleanLatexOutput('$$\\because 3x + 1 = 7$$')).toBe('3x+1 = 7')
    expect(cleanLatexOutput('\\dfrac{x+1}{2}')).toBe('\\frac{x+1}{2}')
    expect(cleanLatexOutput('3x t = 7')).toBe('3x+1 = 7')
  })

  test('deskew & rasterize', () => {
    expect(deskewStrokes([s])[0].points[0][0]).toBeLessThan(120)
    const t = rasterizeStrokesToTensor([s], 64)
    expect(t.length).toBe(4096)
    expect(t.some((v) => v < 0)).toBe(true)
  })
})
