import { describe, expect, it } from 'vitest'
import { toScreen, toWorld } from './coordinates'

describe('coordinates', () => {
  it('converts screen to world with identity camera', () => {
    const camera = { x: 0, y: 0, z: 1 }
    const [wx, wy] = toWorld(100, 200, camera)
    expect(wx).toBe(100)
    expect(wy).toBe(200)
  })

  it('converts world to screen with pan and zoom', () => {
    const camera = { x: 50, y: 50, z: 2 }
    const [sx, sy] = toScreen(100, 100, camera)
    expect(sx).toBe(250) // 100 * 2 + 50
    expect(sy).toBe(250)
  })
})
