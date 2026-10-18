import { describe, expect, it } from 'vitest'
import {
  checkBoundingBoxOverlap,
  detectHandle,
  distToSegment,
  getBoundingBox,
  getUnifiedBoundingBox,
  getViewportBoundingBox,
  isPointOnStroke,
} from './spatial-index'

describe('spatial-index', () => {
  it('computes correct bounding box for vector points', () => {
    const points: [number, number][] = [
      [10, 20],
      [50, 80],
      [5, 95],
      [30, 10],
    ]
    const bbox = getBoundingBox(points)
    expect(bbox).toEqual({
      minX: 5,
      minY: 10,
      maxX: 50,
      maxY: 95,
    })
  })

  it('handles single point bounding box', () => {
    const bbox = getBoundingBox([[100, 200]])
    expect(bbox).toEqual({
      minX: 100,
      minY: 200,
      maxX: 100,
      maxY: 200,
    })
  })

  it('handles empty points array gracefully', () => {
    const bbox = getBoundingBox([])
    expect(bbox).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    })
  })

  it('correctly calculates viewport bounding box with pan and zoom', () => {
    const camera = { x: 100, y: 100, z: 2 }
    const bbox = getViewportBoundingBox(800, 600, camera)
    expect(bbox.minX).toBe(-50)
    expect(bbox.minY).toBe(-50)
    expect(bbox.maxX).toBe(350)
    expect(bbox.maxY).toBe(250)
  })

  it('checks bounding box overlap accurately', () => {
    const boxA = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const boxB = { minX: 50, minY: 50, maxX: 150, maxY: 150 }
    const boxC = { minX: 150, minY: 150, maxX: 200, maxY: 200 }

    expect(checkBoundingBoxOverlap(boxA, boxB)).toBe(true)
    expect(checkBoundingBoxOverlap(boxA, boxC)).toBe(false)
  })

  it('calculates point to segment distance correctly', () => {
    // Distance from (5, 5) to segment (0, 0)-(10, 0) is 5
    expect(distToSegment(5, 5, 0, 0, 10, 0)).toBe(5)
    // Distance from (15, 0) to segment (0, 0)-(10, 0) is 5 (past endpoint)
    expect(distToSegment(15, 0, 0, 0, 10, 0)).toBe(5)
    // Distance from (-5, 0) to segment (0, 0)-(10, 0) is 5 (before startpoint)
    expect(distToSegment(-5, 0, 0, 0, 10, 0)).toBe(5)
  })

  it('detects if point is on freehand stroke within threshold', () => {
    const stroke = {
      id: 's1',
      points: [
        [0, 0],
        [100, 0],
      ] as [number, number][],
      color: '#111111',
      size: 4,
      boundingBox: { minX: 0, minY: 0, maxX: 100, maxY: 0 },
    }
    // Point directly on line
    expect(isPointOnStroke(50, 0, stroke, 10)).toBe(true)
    // Point within 8px
    expect(isPointOnStroke(50, 8, stroke, 10)).toBe(true)
    // Point far away
    expect(isPointOnStroke(50, 25, stroke, 10)).toBe(false)
    // Point far outside bounding box
    expect(isPointOnStroke(300, 300, stroke, 10)).toBe(false)
  })

  it('computes unified bounding box for multiple strokes', () => {
    const box1 = { minX: 10, minY: 10, maxX: 50, maxY: 50 }
    const box2 = { minX: 40, minY: 30, maxX: 120, maxY: 90 }

    const unified = getUnifiedBoundingBox([box1, box2])
    expect(unified).toEqual({
      minX: 10,
      minY: 10,
      maxX: 120,
      maxY: 90,
    })
    expect(getUnifiedBoundingBox([])).toBeNull()
  })

  it('detects corner and rotate handles accurately', () => {
    const selection = {
      box: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
      angle: 0,
    }
    const zoom = 1

    // NW handle (top-left) near (96, 96) with pad=4
    expect(detectHandle(96, 96, selection, zoom)).toBe('nw')
    // NE handle (top-right) near (204, 96)
    expect(detectHandle(204, 96, selection, zoom)).toBe('ne')
    // SW handle (bottom-left) near (96, 204)
    expect(detectHandle(96, 204, selection, zoom)).toBe('sw')
    // SE handle (bottom-right) near (204, 204)
    expect(detectHandle(204, 204, selection, zoom)).toBe('se')
    // Rotate handle: center X (150), Y = 96 - 24 = 72
    expect(detectHandle(150, 72, selection, zoom)).toBe('rotate')
    // Center point should not hit any handle
    expect(detectHandle(150, 150, selection, zoom)).toBeNull()
  })
})
