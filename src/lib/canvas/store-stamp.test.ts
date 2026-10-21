import { beforeEach, describe, expect, it } from 'vitest'
import { inkyStore } from './store'
import type { Stroke } from './types'

const mkStroke = (id: string): Stroke => ({
  id,
  points: [
    [0, 0],
    [5, 5],
  ],
  color: '#111111',
  size: 4,
  boundingBox: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
})

describe('store.stampResult', () => {
  beforeEach(() => {
    inkyStore.strokes = []
    inkyStore.selectedStrokeIds = []
    inkyStore.setMathCapsule(null)
    inkyStore.stampedReveal = null
    // Drain undo/redo stacks left by earlier tests.
    while (inkyStore.canUndo) inkyStore.undo()
    while (inkyStore.canRedo) inkyStore.redo()
  })

  it('appends the batch, selects it, clears the capsule, and sets stampedReveal', () => {
    inkyStore.strokes = [mkStroke('orig')]
    inkyStore.setMathCapsule({
      latex: '2x+1=7',
      worldPosition: { x: 0, y: 0 },
      enclosedStrokeIds: ['orig'],
      source: 'ml',
    })

    const batch = [mkStroke('s1'), mkStroke('s2'), mkStroke('s3')]
    inkyStore.stampResult(batch)

    expect(inkyStore.strokes.map((s) => s.id)).toEqual(['orig', 's1', 's2', 's3'])
    expect(inkyStore.selectedStrokeIds).toEqual(['s1', 's2', 's3'])
    expect(inkyStore.mathCapsule).toBeNull()
    expect(inkyStore.stampedReveal?.strokeIds).toEqual(['s1', 's2', 's3'])
    expect(inkyStore.stampedReveal?.startedAt).toBeGreaterThan(0)
  })

  it('pushes exactly one undo entry for the whole batch', () => {
    inkyStore.strokes = [mkStroke('orig')]
    const before = inkyStore.undoDepthForTest()
    inkyStore.stampResult([
      mkStroke('a'),
      mkStroke('b'),
      mkStroke('c'),
      mkStroke('d'),
      mkStroke('e'),
    ])
    expect(inkyStore.undoDepthForTest() - before).toBe(1)
  })

  it('setStampedReveal arms and clears the wipe reveal', () => {
    inkyStore.setStampedReveal({ strokeIds: ['x'], startedAt: 1 })
    expect(inkyStore.stampedReveal?.strokeIds).toEqual(['x'])
    inkyStore.setStampedReveal(null)
    expect(inkyStore.stampedReveal).toBeNull()
  })

  it('one undo restores the pre-stamp strokes and clears the selection', () => {
    inkyStore.strokes = [mkStroke('orig')]
    inkyStore.stampResult([mkStroke('a'), mkStroke('b')])
    inkyStore.undo()
    expect(inkyStore.strokes.map((s) => s.id)).toEqual(['orig'])
    expect(inkyStore.selectedStrokeIds).toEqual([])
  })
})
