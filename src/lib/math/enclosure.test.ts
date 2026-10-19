import { describe, expect, it } from 'vitest'
import type { Stroke } from '../canvas/types'
import { findEnclosedStrokes, isPointInPolygon, isStrokeEnclosed } from './enclosure'

describe('Ray-Casting Point-in-Polygon & Enclosure (V4)', () => {
  // Test polygon: 100x100 square from (0,0) to (100,100)
  const square: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]

  it('detects point strictly inside polygon using Jordan Curve Theorem', () => {
    expect(isPointInPolygon([50, 50], square)).toBe(true)
    expect(isPointInPolygon([10, 10], square)).toBe(true)
    expect(isPointInPolygon([90, 90], square)).toBe(true)
  })

  it('detects point strictly outside polygon', () => {
    expect(isPointInPolygon([150, 50], square)).toBe(false)
    expect(isPointInPolygon([50, -10], square)).toBe(false)
    expect(isPointInPolygon([-20, -20], square)).toBe(false)
  })

  it('handles concave U-shaped polygon interior prongs vs exterior opening', () => {
    const uShape: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [70, 100],
      [70, 30],
      [30, 30],
      [30, 100],
      [0, 100],
    ]
    // In left prong
    expect(isPointInPolygon([15, 50], uShape)).toBe(true)
    // In right prong
    expect(isPointInPolygon([85, 50], uShape)).toBe(true)
    // In hollow outer opening between prongs
    expect(isPointInPolygon([50, 50], uShape)).toBe(false)
  })

  it('correctly determines whether a stroke is enclosed', () => {
    const strokeInside: Stroke = {
      id: 'stroke-in',
      points: [
        [30, 30],
        [40, 40],
        [50, 50],
      ],
      color: '#111111',
      size: 4,
      boundingBox: { minX: 30, minY: 30, maxX: 50, maxY: 50 },
    }

    const strokeOutside: Stroke = {
      id: 'stroke-out',
      points: [
        [150, 150],
        [160, 160],
      ],
      color: '#111111',
      size: 4,
      boundingBox: { minX: 150, minY: 150, maxX: 160, maxY: 160 },
    }

    expect(isStrokeEnclosed(strokeInside, square)).toBe(true)
    expect(isStrokeEnclosed(strokeOutside, square)).toBe(false)
  })

  it('finds all enclosed strokes from a canvas list', () => {
    const s1: Stroke = {
      id: 'math-1',
      points: [
        [40, 40],
        [50, 40],
      ],
      color: '#111111',
      size: 4,
      boundingBox: { minX: 40, minY: 40, maxX: 50, maxY: 40 },
    }
    const s2: Stroke = {
      id: 'math-2',
      points: [[200, 200]],
      color: '#111111',
      size: 4,
      boundingBox: { minX: 200, minY: 200, maxX: 200, maxY: 200 },
    }

    const enclosed = findEnclosedStrokes(square, [s1, s2])
    expect(enclosed).toEqual(['math-1'])
  })
})
