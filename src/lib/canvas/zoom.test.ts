import { describe, expect, it } from 'vitest'
import { InkyStore } from './store'

describe('inkyStore zoomAt focal point behavior', () => {
  it('zooms in centered at screen focal coordinate', () => {
    const store = new InkyStore()
    store.camera = { x: 0, y: 0, z: 1 }

    // Screen center at (500, 400)
    store.zoomAt(2, 500, 400)

    // The point at (500, 400) in world coordinates was (500, 400).
    // At zoom 2, new screen point of world (500, 400) should still be 500, 400:
    // screenX = worldX * z + camera.x => 500 = 500 * 2 + camera.x => camera.x = -500
    expect(store.camera.z).toBe(2)
    expect(store.camera.x).toBe(-500)
    expect(store.camera.y).toBe(-400)
  })

  it('zooms out centered at screen focal coordinate', () => {
    const store = new InkyStore()
    store.camera = { x: -500, y: -400, z: 2 }

    store.zoomAt(1, 500, 400)

    expect(store.camera.z).toBe(1)
    expect(store.camera.x).toBe(0)
    expect(store.camera.y).toBe(0)
  })

  it('clamps zoom within bounds [0.1, 5]', () => {
    const store = new InkyStore()
    store.zoomAt(10, 500, 400)
    expect(store.camera.z).toBe(5)

    store.zoomAt(0.01, 500, 400)
    expect(store.camera.z).toBe(0.1)
  })
})
