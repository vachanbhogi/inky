import { describe, expect, it } from 'vitest'
import { inkyStore } from './store'

describe('inkyStore', () => {
  it('manages camera position and zoom limits', () => {
    inkyStore.setCamera({ x: 100, y: 200, z: 2 })
    expect(inkyStore.camera).toEqual({ x: 100, y: 200, z: 2 })

    // clamp zoom between 0.1 and 5
    inkyStore.setCamera({ z: 10 })
    expect(inkyStore.camera.z).toBe(5)

    inkyStore.setCamera({ z: 0.01 })
    expect(inkyStore.camera.z).toBe(0.1)
  })

  it('adds and undoes strokes', () => {
    inkyStore.strokes = []
    const stroke = {
      id: 'stroke-1',
      points: [
        [0, 0],
        [10, 10],
      ] as [number, number][],
      color: '#111111',
      size: 4,
      boundingBox: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    }

    inkyStore.addStroke(stroke)
    expect(inkyStore.strokes.length).toBe(1)
    expect(inkyStore.canUndo).toBe(true)

    inkyStore.undo()
    expect(inkyStore.strokes.length).toBe(0)
    expect(inkyStore.canRedo).toBe(true)

    inkyStore.redo()
    expect(inkyStore.strokes.length).toBe(1)
  })

  it('notifies listeners on state change', () => {
    let callCount = 0
    const unsub = inkyStore.subscribe(() => {
      callCount++
    })

    inkyStore.setActiveTool('eraser')
    expect(callCount).toBe(1)
    expect(inkyStore.activeTool).toBe('eraser')

    unsub()
    inkyStore.setActiveTool('draw')
    expect(callCount).toBe(1) // no new call after unsubscribe
  })
})
