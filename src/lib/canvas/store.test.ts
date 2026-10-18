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

  it('updates stroke color and tool switching correctly', () => {
    inkyStore.setStrokeColor('#2563eb')
    expect(inkyStore.strokeColor).toBe('#2563eb')

    inkyStore.setStrokeSize(6)
    expect(inkyStore.strokeSize).toBe(6)
  })

  it('manages stroke selection and marquee state', () => {
    inkyStore.strokes = [
      {
        id: 's1',
        points: [[0, 0]],
        color: '#111',
        size: 4,
        boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      },
      {
        id: 's2',
        points: [[50, 50]],
        color: '#111',
        size: 4,
        boundingBox: { minX: 50, minY: 50, maxX: 50, maxY: 50 },
      },
    ]

    inkyStore.selectStroke('s1')
    expect(inkyStore.selectedStrokeIds).toEqual(['s1'])

    // Multi-select toggle
    inkyStore.selectStroke('s2', true)
    expect(inkyStore.selectedStrokeIds).toEqual(['s1', 's2'])

    // Clear selection
    inkyStore.clearSelection()
    expect(inkyStore.selectedStrokeIds).toEqual([])

    // Set Marquee
    inkyStore.setMarquee({ startX: 0, startY: 0, endX: 100, endY: 100 })
    expect(inkyStore.marquee).toEqual({ startX: 0, startY: 0, endX: 100, endY: 100 })
  })
})
