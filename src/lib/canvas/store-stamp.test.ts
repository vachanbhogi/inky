import { beforeEach, describe, expect, it } from 'vitest'
import { charBoundingBox, inkyStore, type Stamp, stampBoundingBox, stampCharsFor } from './store'
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

const mkStamp = (id: string, worldX = 0, worldY = 0): Stamp => ({
  id,
  text: 'x = 3',
  worldX,
  worldY,
  color: '#111111',
  fontSize: 36,
  chars: stampCharsFor('x = 3', worldX, worldY, 36, id),
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
    if (typeof window === 'undefined') return
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

describe('stamp char model (per-char first-class items)', () => {
  beforeEach(() => {
    while (inkyStore.canUndo) inkyStore.undo()
    while (inkyStore.canRedo) inkyStore.redo()
    inkyStore.strokes = []
    inkyStore.stamps = []
    inkyStore.selectedStrokeIds = []
    inkyStore.setMathCapsule(null)
    inkyStore.stampedReveal = null
    inkyStore.setActiveTool('select')
  })

  it('stampCharsFor lays one char per code point along the baseline at 0.5em advance', () => {
    const chars = stampCharsFor('x = 3', 10, 20, 36, 's1')
    expect(chars.map((c) => c.char)).toEqual(['x', ' ', '=', ' ', '3'])
    expect(chars.map((c) => c.id)).toEqual(['s1-c0', 's1-c1', 's1-c2', 's1-c3', 's1-c4'])
    expect(chars[0].worldX).toBe(10)
    expect(chars[2].worldX).toBeCloseTo(10 + 2 * 36 * 0.5)
    expect(chars[4].worldX).toBeCloseTo(10 + 4 * 36 * 0.5)
    for (const c of chars) {
      expect(c.worldY).toBe(20)
      expect(c.fontSize).toBe(36)
      expect(c.angle).toBe(0)
    }
  })

  it('counts astral-plane glyphs as single chars (surrogate-safe layout)', () => {
    const chars = stampCharsFor('𝑥', 0, 0, 20, 's1')
    expect(chars).toHaveLength(1)
    expect(chars[0].char).toBe('𝑥')
  })

  it('stampResult builds the char items from the stamped text', () => {
    inkyStore.stampResult({
      text: 'x = 3',
      worldX: 100,
      worldY: 10,
      color: '#111111',
      fontSize: 36,
    })
    const stamp = inkyStore.stamps[0]
    expect(stamp.chars).toHaveLength(5)
    expect(stamp.chars[0].id).toBe(`${stamp.id}-c0`)
    expect(stamp.chars.map((c) => c.char).join('')).toBe(stamp.text)
    expect(stamp.chars[0].worldX).toBe(stamp.worldX)
    expect(stamp.chars[4].worldX).toBeCloseTo(stamp.worldX + 4 * 36 * 0.5)
    expect(stamp.chars[4].fontSize).toBe(36)
    expect(stamp.chars[4].angle).toBe(0)
  })

  it('stampBoundingBox derives from the chars (moving a char grows the box)', () => {
    const stamp = mkStamp('s1')
    const base = stampBoundingBox(stamp)
    expect(base.minX).toBe(0)
    expect(base.maxX).toBeCloseTo(5 * 36 * 0.5)
    expect(base.maxY).toBeCloseTo(36 * 1.25)

    stamp.chars[4].worldX = 500
    const moved = stampBoundingBox(stamp)
    expect(moved.minX).toBe(0)
    expect(moved.maxX).toBeCloseTo(500 + 36 * 0.5)
    expect(moved.maxX).toBeGreaterThan(base.maxX)
  })

  it('charBoundingBox of a rotated char is its rotated AABB', () => {
    const [ch] = stampCharsFor('x', 0, 0, 40, 's1') // w = 20, h = 50
    const box = charBoundingBox(ch)
    expect(box).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 50 })

    ch.angle = Math.PI / 2
    const rot = charBoundingBox(ch)
    // 90° about the center (10, 25): the box turns 50 wide × 20 tall in place.
    expect(rot.minX).toBeCloseTo(10 - 25)
    expect(rot.maxX).toBeCloseTo(10 + 25)
    expect(rot.minY).toBeCloseTo(25 - 10)
    expect(rot.maxY).toBeCloseTo(25 + 10)
  })
})

describe('per-char selection & hit testing', () => {
  beforeEach(() => {
    while (inkyStore.canUndo) inkyStore.undo()
    while (inkyStore.canRedo) inkyStore.redo()
    inkyStore.strokes = [mkStroke('k1')]
    inkyStore.stamps = [mkStamp('s1'), mkStamp('s2', 300, 0)]
    inkyStore.selectedStrokeIds = []
    inkyStore.selectedCharIds = []
    inkyStore.stampedReveal = null
    inkyStore.setMathCapsule(null)
    inkyStore.setActiveTool('select')
  })

  it('selectChar (plain click) replaces the selection and clears stroke selection', () => {
    inkyStore.selectStroke('k1')
    inkyStore.selectChar('s1-c0')
    expect(inkyStore.selectedCharIds).toEqual(['s1-c0'])
    expect(inkyStore.selectedStrokeIds).toEqual([])
  })

  it('selectChar with toggle adds and removes chars, keeping other selection kinds', () => {
    inkyStore.selectStroke('k1')
    inkyStore.selectChar('s1-c0', true)
    inkyStore.selectChar('s1-c2', true)
    expect(inkyStore.selectedCharIds).toEqual(['s1-c0', 's1-c2'])
    expect(inkyStore.selectedStrokeIds).toEqual(['k1'])
    inkyStore.selectChar('s1-c0', true)
    expect(inkyStore.selectedCharIds).toEqual(['s1-c2'])
  })

  it('selectStroke (single click) clears char selection; selectStrokes (bulk) does not', () => {
    inkyStore.selectChar('s1-c0')
    inkyStore.selectStrokes(['k1'])
    expect(inkyStore.selectedCharIds).toEqual(['s1-c0']) // marquee/capsule path keeps both
    inkyStore.selectStroke('k1')
    expect(inkyStore.selectedCharIds).toEqual([])
    expect(inkyStore.selectedStrokeIds).toEqual(['k1'])
  })

  it('clearSelection clears chars too; selectAll covers strokes and every visible char', () => {
    inkyStore.selectChar('s1-c0')
    inkyStore.selectStrokes(['k1'])
    inkyStore.clearSelection()
    expect(inkyStore.selectedCharIds).toEqual([])
    expect(inkyStore.selectedStrokeIds).toEqual([])

    inkyStore.selectAll()
    expect(inkyStore.selectedStrokeIds).toEqual(['k1'])
    // 'x = 3' has 3 visible glyphs per stamp; whitespace chars stay unselectable.
    expect(inkyStore.selectedCharIds).toHaveLength(6)
    expect(inkyStore.selectedCharIds).toContain('s1-c0')
    expect(inkyStore.selectedCharIds).toContain('s2-c4')
    expect(inkyStore.selectedCharIds).not.toContain('s1-c1')
    expect(inkyStore.activeTool).toBe('select')
  })

  it('getSelectionBoundingBox unions selected strokes and chars', () => {
    inkyStore.selectStrokes(['k1']) // bbox 0..5, 0..5
    inkyStore.selectChar('s2-c4', true) // '3' of s2 at 372..390, 0..45
    const box = inkyStore.getSelectionBoundingBox()
    expect(box).not.toBeNull()
    expect(box?.minX).toBe(0)
    expect(box?.maxX).toBeCloseTo(300 + 4 * 18 + 18)
    expect(box?.maxY).toBeCloseTo(45)
  })

  it('charAt returns the top-most visible char under the point and skips whitespace', () => {
    expect(inkyStore.charAt(45, 20)?.char.id).toBe('s1-c2') // inside '='
    expect(inkyStore.charAt(27, 20)).toBeNull() // whitespace gap between x and =
    // A later stamp renders above an earlier one sharing the same spot.
    inkyStore.stamps.push(mkStamp('s3', 0, 0))
    expect(inkyStore.charAt(10, 10)?.stampId).toBe('s3')
  })

  it('charAt honors a tolerance so near-edge eraser hits count', () => {
    // '=' box ends at x=54; 2px outside is a hit with tolerance 4, not without.
    expect(inkyStore.charAt(56, 20)).toBeNull()
    expect(inkyStore.charAt(56, 20, 4)?.char.id).toBe('s1-c2')
  })
})

describe('per-char transforms & delete', () => {
  beforeEach(() => {
    while (inkyStore.canUndo) inkyStore.undo()
    while (inkyStore.canRedo) inkyStore.redo()
    inkyStore.strokes = []
    inkyStore.stamps = [mkStamp('s1')]
    inkyStore.selectedStrokeIds = []
    inkyStore.selectedCharIds = []
    inkyStore.transformInitialState = null
    inkyStore.stampedReveal = null
    inkyStore.setActiveTool('select')
  })

  it('translateSelected moves selected chars and leaves the rest in place', () => {
    inkyStore.selectChars(['s1-c0', 's1-c2'])
    inkyStore.beginTransform()
    inkyStore.translateSelected(10, 5)
    const chars = inkyStore.stamps[0].chars
    expect(chars[0].worldX).toBe(10)
    expect(chars[0].worldY).toBe(5)
    expect(chars[2].worldX).toBeCloseTo(36 + 10)
    expect(chars[1].worldX).toBe(18) // unselected space char untouched
    expect(chars[4].worldX).toBeCloseTo(72)
  })

  it('scaleSelected scales char positions around the anchor and the fontSize', () => {
    // 'x' box 0..18×0..45 and '3' box 72..90×0..45 → box 0..90×0..45; se anchor (0,0).
    inkyStore.selectChars(['s1-c0', 's1-c4'])
    inkyStore.beginTransform()
    inkyStore.scaleSelected('se', 180, 90) // scale (2, 2)
    const chars = inkyStore.stamps[0].chars
    expect(chars[0].worldX).toBeCloseTo(0)
    expect(chars[4].worldX).toBeCloseTo(144) // 72 × 2
    expect(chars[0].fontSize).toBeCloseTo(72)
    expect(chars[4].fontSize).toBeCloseTo(72)
    expect(chars[2].fontSize).toBe(36) // unselected char untouched
  })

  it('rotateSelected spins each selected char in place (stroke parity)', () => {
    // '=' box 36..54×0..45 → center (45, 22.5); pointer right of center = +90°.
    inkyStore.selectChars(['s1-c2'])
    inkyStore.beginTransform()
    inkyStore.rotateSelected(145, 22.5)
    const ch = inkyStore.stamps[0].chars[2]
    expect(ch.angle).toBeCloseTo(Math.PI / 2)
    expect(ch.worldX).toBe(36) // spin-in-place, position unchanged (stroke parity)
  })

  it('commitTransform pushes one undo entry restoring pre-transform chars; redo reapplies', () => {
    inkyStore.selectChars(['s1-c0'])
    inkyStore.beginTransform()
    inkyStore.translateSelected(100, 0)
    const depth = inkyStore.undoDepthForTest()
    inkyStore.commitTransform()
    expect(inkyStore.undoDepthForTest()).toBe(depth + 1)
    expect(inkyStore.stamps[0].chars[0].worldX).toBe(100)

    inkyStore.undo()
    expect(inkyStore.stamps[0].chars[0].worldX).toBe(0)
    inkyStore.redo()
    expect(inkyStore.stamps[0].chars[0].worldX).toBe(100)
  })

  it('deleteSelected removes selected chars; stamp survives with visible chars; one undo restores', () => {
    inkyStore.selectChars(['s1-c0'])
    inkyStore.deleteSelected()
    expect(inkyStore.stamps).toHaveLength(1)
    expect(inkyStore.stamps[0].chars.map((c) => c.char).join('')).toBe(' = 3')
    expect(inkyStore.selectedCharIds).toEqual([])

    inkyStore.undo()
    expect(inkyStore.stamps[0].chars.map((c) => c.char).join('')).toBe('x = 3')
  })

  it('deleteSelected drops the whole stamp when its last visible char goes; undo restores it', () => {
    inkyStore.stamps = [
      {
        id: 'tiny',
        text: 'y',
        worldX: 0,
        worldY: 0,
        color: '#111111',
        fontSize: 20,
        chars: stampCharsFor('y', 0, 0, 20, 'tiny'),
      },
    ]
    inkyStore.selectChars(['tiny-c0'])
    inkyStore.deleteSelected()
    expect(inkyStore.stamps).toHaveLength(0)

    inkyStore.undo()
    expect(inkyStore.stamps).toHaveLength(1)
    expect(inkyStore.stamps[0].chars[0].char).toBe('y')
  })
})

describe('store per-char eraser + clear', () => {
  beforeEach(() => {
    // Drain undo/redo FIRST — undo() restores snapshots, so a drain after
    // clearing arrays would resurrect earlier files' stamps.
    while (inkyStore.canUndo) inkyStore.undo()
    while (inkyStore.canRedo) inkyStore.redo()
    inkyStore.stamps = [mkStamp('s1')]
    inkyStore.stampedReveal = null
    inkyStore.strokes = []
    inkyStore.clearSelection()
  })

  // mkStamp('s1') = 'x = 3' @ fontSize 36, origin (0, 0). Advance 18px/char,
  // box height 45px: 'x'=[0,18], ' '=[18,36], '='=[36,54], ' '=[54,72], '3'=[72,90].
  it('deleteCharAt removes only the char under the point, not the stamp', () => {
    const hit = inkyStore.deleteCharAt(45, 22.5, 0) // center of '='
    expect(hit).toBe(true)
    expect(inkyStore.stamps).toHaveLength(1)
    expect(inkyStore.stamps[0].chars.map((c) => c.char)).toEqual(['x', ' ', ' ', '3'])
  })

  it('deleteCharAt respects the eraser radius (near-edge hit counts)', () => {
    // 3px right of the 'x' box edge — inside a radius-4 eraser, outside the box.
    expect(inkyStore.deleteCharAt(21, 22.5, 4)).toBe(true)
    expect(inkyStore.stamps[0].chars.map((c) => c.char)).toEqual([' ', '=', ' ', '3'])
  })

  it('deleteCharAt never erases whitespace chars', () => {
    // Dead center of the space between 'x' and '='; neither neighbor's
    // box (padded by radius 2) reaches x=27.
    expect(inkyStore.deleteCharAt(27, 22.5, 2)).toBe(false)
    expect(inkyStore.stamps[0].chars).toHaveLength(5)
  })

  it('deleteCharAt is a no-op away from any char', () => {
    expect(inkyStore.deleteCharAt(5000, 5000, 4)).toBe(false)
    expect(inkyStore.stamps[0].chars).toHaveLength(5)
  })

  it('deleteCharAt drops the stamp when its last visible char goes; undo resurrects it', () => {
    // Erase the three visible chars; whitespace never blocks the drop.
    expect(inkyStore.deleteCharAt(9, 22.5, 0)).toBe(true) // 'x'
    expect(inkyStore.deleteCharAt(45, 22.5, 0)).toBe(true) // '='
    expect(inkyStore.deleteCharAt(81, 22.5, 0)).toBe(true) // '3'
    expect(inkyStore.stamps).toHaveLength(0)

    // Per-char eraser parity with the stroke eraser: one undo entry per
    // erased item. The first undo reverses the drop (the erase of '3').
    inkyStore.undo()
    expect(inkyStore.stamps).toHaveLength(1)
    expect(inkyStore.stamps[0].id).toBe('s1')
    expect(inkyStore.stamps[0].chars.map((c) => c.char)).toEqual([' ', ' ', '3'])
  })

  it('each char erase pushes one undo entry; undo restores the erased char in place', () => {
    const depth = inkyStore.undoDepthForTest()
    inkyStore.deleteCharAt(45, 22.5, 0)
    expect(inkyStore.undoDepthForTest()).toBe(depth + 1)
    inkyStore.undo()
    expect(inkyStore.stamps[0].chars.map((c) => c.char)).toEqual(['x', ' ', '=', ' ', '3'])
  })

  it('deleteChar removes a char by id and clears the reveal only when the stamp goes', () => {
    const target = inkyStore.stamps[0].chars[2] // '='
    inkyStore.stampedReveal = { stampId: 's1', startedAt: 0 }
    inkyStore.deleteChar(target.id)
    expect(inkyStore.stamps[0].chars.some((c) => c.id === target.id)).toBe(false)
    expect(inkyStore.stampedReveal).not.toBeNull() // stamp still stands

    // Removing every remaining visible char drops the stamp and its reveal.
    for (const ch of [...inkyStore.stamps[0].chars]) {
      if (!/\s/.test(ch.char)) inkyStore.deleteChar(ch.id)
    }
    expect(inkyStore.stamps).toHaveLength(0)
    expect(inkyStore.stampedReveal).toBeNull()
  })

  it('clear removes stamps as well as strokes', () => {
    inkyStore.clear()
    expect(inkyStore.stamps).toHaveLength(0)
  })
})
