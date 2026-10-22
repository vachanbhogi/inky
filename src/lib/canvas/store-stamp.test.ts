import { beforeEach, describe, expect, it } from 'vitest'
import { inkyStore, type Stamp, stampBoundingBox } from './store'
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

const mkStamp = (id: string): Stamp => ({
  id,
  text: 'x = 3',
  worldX: 0,
  worldY: 0,
  color: '#111111',
  fontSize: 36,
})

describe('store.stampResult (text stamps)', () => {
  beforeEach(() => {
    // Drain undo/redo stacks FIRST — undo()/redo() restore snapshots, so a
    // drain after clearing would resurrect strokes/stamps from earlier files.
    while (inkyStore.canUndo) inkyStore.undo()
    while (inkyStore.canRedo) inkyStore.redo()
    inkyStore.strokes = []
    inkyStore.stamps = []
    inkyStore.selectedStrokeIds = []
    inkyStore.setMathCapsule(null)
    inkyStore.stampedReveal = null
    inkyStore.setActiveTool('select')
  })

  it('appends the stamp, arms the reveal, clears capsule+selection, returns to the pen', () => {
    inkyStore.strokes = [mkStroke('orig')]
    inkyStore.selectStrokes(['orig'])
    inkyStore.setMathCapsule({
      latex: '2x+1=7',
      worldPosition: { x: 0, y: 0 },
      enclosedStrokeIds: ['orig'],
      source: 'rule',
    })

    inkyStore.stampResult({
      text: 'x = 3',
      worldX: 100,
      worldY: 10,
      color: '#111111',
      fontSize: 36,
    })

    expect(inkyStore.stamps).toHaveLength(1)
    const stamp = inkyStore.stamps[0]
    expect(stamp.text).toBe('x = 3')
    expect(inkyStore.stampedReveal?.stampId).toBe(stamp.id)
    expect(inkyStore.mathCapsule).toBeNull()
    expect(inkyStore.selectedStrokeIds).toEqual([])
    expect(inkyStore.activeTool).toBe('draw')
    // Ink is untouched — the answer is a text stamp, not synthesized strokes.
    expect(inkyStore.strokes.map((s) => s.id)).toEqual(['orig'])
  })

  it('pushes exactly one undo entry; one undo removes the stamp', () => {
    inkyStore.strokes = [mkStroke('orig')]
    const depthBefore = inkyStore.undoDepthForTest()

    inkyStore.stampResult({
      text: 'x = 3',
      worldX: 100,
      worldY: 10,
      color: '#111111',
      fontSize: 36,
    })
    expect(inkyStore.undoDepthForTest()).toBe(depthBefore + 1)

    inkyStore.undo()
    expect(inkyStore.stamps).toHaveLength(0)
    expect(inkyStore.stampedReveal).toBeNull()
    expect(inkyStore.strokes.map((s) => s.id)).toEqual(['orig'])

    inkyStore.redo()
    expect(inkyStore.stamps).toHaveLength(1)
  })

  it('ignores empty text (never a phantom stamp or undo entry)', () => {
    const depthBefore = inkyStore.undoDepthForTest()
    inkyStore.stampResult({
      text: '   ',
      worldX: 0,
      worldY: 0,
      color: '#111111',
      fontSize: 36,
    })
    expect(inkyStore.stamps).toHaveLength(0)
    expect(inkyStore.undoDepthForTest()).toBe(depthBefore)
  })

  it('clamps a stamp that would land off-screen (M2)', () => {
    const realWidth = window.innerWidth
    window.innerWidth = 400
    try {
      inkyStore.camera = { x: 0, y: 0, z: 1 }
      inkyStore.stampResult({
        text: 'x = 3',
        worldX: 390,
        worldY: 0,
        color: '#111111',
        fontSize: 36,
      })
      const stamp = inkyStore.stamps[0]
      // Rendered width ≈ 5 chars × 36 × 0.5 = 90px; the right edge must land
      // inside the viewport with 16px of margin.
      const rightEdge = stamp.worldX * 1 + 5 * 36 * 0.5
      expect(rightEdge).toBeLessThanOrEqual(400 - 16 + 0.001)
    } finally {
      window.innerWidth = realWidth
    }
  })
})

describe('store stamp eraser + clear', () => {
  beforeEach(() => {
    inkyStore.stamps = [mkStamp('s1')]
    inkyStore.stampedReveal = null
    inkyStore.strokes = []
  })

  it('deleteStampAt removes the stamp under the world point', () => {
    const box = stampBoundingBox(inkyStore.stamps[0])
    const hit = inkyStore.deleteStampAt((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, 4)
    expect(hit).toBe(true)
    expect(inkyStore.stamps).toHaveLength(0)
  })

  it('deleteStampAt respects the eraser radius (near-edge hit counts)', () => {
    const box = stampBoundingBox(inkyStore.stamps[0])
    // 3px outside the right edge — inside a radius-4 eraser, outside the box.
    expect(inkyStore.deleteStampAt(box.maxX + 3, (box.minY + box.maxY) / 2, 4)).toBe(true)
    expect(inkyStore.stamps).toHaveLength(0)
  })

  it('deleteStampAt is a no-op away from any stamp', () => {
    expect(inkyStore.deleteStampAt(5000, 5000, 4)).toBe(false)
    expect(inkyStore.stamps).toHaveLength(1)
  })

  it('deleteStamp clears the reveal when it was the revealed stamp', () => {
    inkyStore.stampedReveal = { stampId: 's1', startedAt: 0 }
    inkyStore.deleteStamp('s1')
    expect(inkyStore.stampedReveal).toBeNull()
  })

  it('clear removes stamps as well as strokes', () => {
    inkyStore.clear()
    expect(inkyStore.stamps).toHaveLength(0)
  })
})
