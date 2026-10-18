import { describe, expect, it } from 'vitest'
import { toScreen, toWorld } from './coordinates'

describe('coordinates', () => {
  it('converts screen to world at identity camera (zoom 1, offset 0)', () => {
    const camera = { x: 0, y: 0, z: 1 }
    const [wx, wy] = toWorld(150, 300, camera)
    expect(wx).toBe(150)
    expect(wy).toBe(300)
  })

  it('converts world to screen with pan and zoom', () => {
    const camera = { x: 40, y: 60, z: 2 }
    const [sx, sy] = toScreen(100, 200, camera)
    // formula: screen = world * zoom + pan
    expect(sx).toBe(240)
    expect(sy).toBe(460)
  })

  it('handles negative world coordinates and extreme zoom', () => {
    const camera = { x: 100, y: 100, z: 0.1 }
    const [wx, wy] = toWorld(100, 100, camera)
    expect(wx).toBe(0)
    expect(wy).toBe(0)

    const [sx, sy] = toScreen(-500, -1000, camera)
    expect(sx).toBe(50)
    expect(sy).toBe(0)
  })
})
