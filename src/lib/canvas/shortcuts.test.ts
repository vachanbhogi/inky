import { describe, expect, it } from 'vitest'
import { inkyStore } from './store'

describe('Keyboard shortcuts logic', () => {
  it('Cmd/Ctrl+A selects all strokes on canvas', () => {
    inkyStore.strokes = [
      {
        id: 'stroke-1',
        points: [[0, 0]],
        color: '#000',
        size: 4,
        boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      },
    ]
    inkyStore.clearSelection()
    inkyStore.setActiveTool('draw')

    inkyStore.selectAll()
    expect(inkyStore.selectedStrokeIds).toEqual(['stroke-1'])
    expect(inkyStore.activeTool).toBe('select')
  })

  it('Escape key clears active selection and marquee', () => {
    inkyStore.selectedStrokeIds = ['stroke-1']
    inkyStore.setMarquee({ startX: 0, startY: 0, endX: 50, endY: 50 })

    inkyStore.clearSelection()
    expect(inkyStore.selectedStrokeIds).toEqual([])
    expect(inkyStore.marquee).toBeNull()
  })
})
