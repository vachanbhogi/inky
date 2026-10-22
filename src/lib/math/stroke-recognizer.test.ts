import { describe, expect, test } from 'bun:test'
import type { Stroke } from '../canvas/types'
import { recognizeFormulaStrokes } from './stroke-recognizer'

function mkStroke(pts: [number, number][], id: string): Stroke {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return {
    id,
    points: pts,
    color: '#000',
    size: 3,
    boundingBox: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    },
  }
}

describe('stroke-recognizer', () => {
  test('returns fallback if empty', () => {
    expect(recognizeFormulaStrokes([])).toBe('')
  })

  test('recognizes horizontal bar as minus', () => {
    const s = mkStroke(
      [
        [10, 50],
        [35, 50],
      ],
      's1',
    )
    expect(recognizeFormulaStrokes([s])).toBe('-')
  })

  test('recognizes vertical bar as 1', () => {
    const s = mkStroke(
      [
        [20, 10],
        [20, 45],
      ],
      's1',
    )
    expect(recognizeFormulaStrokes([s])).toBe('1')
  })

  test('recognizes cross as plus', () => {
    const s1 = mkStroke(
      [
        [20, 10],
        [20, 40],
      ],
      's1',
    )
    const s2 = mkStroke(
      [
        [5, 25],
        [35, 25],
      ],
      's2',
    )
    expect(recognizeFormulaStrokes([s1, s2])).toBe('+')
  })
})

describe('size invariance (writes big or small)', () => {
  test('tiny strokes recognize the same as normal ones', () => {
    expect(
      recognizeFormulaStrokes([
        mkStroke(
          [
            [10, 50],
            [16, 50],
          ],
          's1',
        ),
      ]),
    ).toBe('-')
    expect(
      recognizeFormulaStrokes([
        mkStroke(
          [
            [20, 10],
            [20, 18],
          ],
          's1',
        ),
      ]),
    ).toBe('1')
  })

  test('huge strokes recognize the same as normal ones', () => {
    expect(
      recognizeFormulaStrokes([
        mkStroke(
          [
            [10, 150],
            [210, 150],
          ],
          's1',
        ),
      ]),
    ).toBe('-')
    expect(
      recognizeFormulaStrokes([
        mkStroke(
          [
            [20, 10],
            [20, 140],
          ],
          's1',
        ),
      ]),
    ).toBe('1')
  })
})
