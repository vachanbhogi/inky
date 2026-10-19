import { describe, expect, it } from 'vitest'
import { computeTouchGesture, type TouchPoint } from './touch-gesture'

describe('touch-gesture', () => {
  it('returns null when less than two pointers are present', () => {
    const singleTouch: TouchPoint[] = [{ id: 1, x: 100, y: 100 }]
    expect(computeTouchGesture(singleTouch, singleTouch, { x: 0, y: 0, z: 1 })).toBeNull()
  })

  it('computes pure two-finger pan when distance remains unchanged', () => {
    const prevTouches: TouchPoint[] = [
      { id: 1, x: 100, y: 100 },
      { id: 2, x: 200, y: 100 },
    ]
    // Both fingers shifted 20px right, 10px down
    const nextTouches: TouchPoint[] = [
      { id: 1, x: 120, y: 110 },
      { id: 2, x: 220, y: 110 },
    ]
    const initialCamera = { x: 0, y: 0, z: 1 }

    const result = computeTouchGesture(prevTouches, nextTouches, initialCamera)
    expect(result).not.toBeNull()
    expect(result?.camera.z).toBeCloseTo(1, 2)
    expect(result?.camera.x).toBe(20)
    expect(result?.camera.y).toBe(10)
  })

  it('computes pinch-to-zoom centered around finger midpoint', () => {
    // Initial fingers at (100, 100) and (200, 100) -> distance = 100, center = (150, 100)
    const prevTouches: TouchPoint[] = [
      { id: 1, x: 100, y: 100 },
      { id: 2, x: 200, y: 100 },
    ]
    // Fingers spread apart to (50, 100) and (250, 100) -> distance = 200, 2x zoom
    const nextTouches: TouchPoint[] = [
      { id: 1, x: 50, y: 100 },
      { id: 2, x: 250, y: 100 },
    ]
    const initialCamera = { x: 0, y: 0, z: 1 }

    const result = computeTouchGesture(prevTouches, nextTouches, initialCamera)
    expect(result).not.toBeNull()
    expect(result?.camera.z).toBeCloseTo(2, 2)
  })
})
