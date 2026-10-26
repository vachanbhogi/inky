import { describe, expect, it } from 'bun:test'
import type { StampChar } from '../canvas/store'
import type { Stroke } from '../canvas/types'
import { checkMultiLineWork, groupIntoHorizontalLines } from './line-grouper'

function makeStroke(id: string, minX: number, minY: number, maxX: number, maxY: number): Stroke {
  return {
    id,
    points: [
      [minX, minY, 0.5],
      [maxX, maxY, 0.5],
    ],
    color: '#111111',
    size: 4,
    boundingBox: { minX, minY, maxX, maxY },
  }
}

function makeChar(
  id: string,
  char: string,
  worldX: number,
  worldY: number,
  fontSize = 32,
): StampChar {
  return {
    id,
    char,
    worldX,
    worldY,
    fontSize,
    angle: 0,
  }
}

describe('Multi-Line Step Diagnostics & Line Grouper', () => {
  describe('groupIntoHorizontalLines', () => {
    it('returns empty array for empty input', () => {
      expect(groupIntoHorizontalLines([])).toEqual([])
      expect(groupIntoHorizontalLines([], [])).toEqual([])
    })

    it('groups single-line strokes including minus bars and superscripts into 1 group', () => {
      // Main equation strokes around y = 100..140 (height = 40, centerY = 120)
      const sX = makeStroke('s-x', 100, 100, 125, 140)
      // Superscript '2' slightly higher at y = 92..112 (centerY = 102, overlaps y=100..112 which is 12px / 20px = 60% >= 35%)
      const sSup2 = makeStroke('s-sup2', 128, 92, 142, 112)
      // Minus bar thin stroke at y = 118..122 (height = 4, centerY = 120, 100% overlap with 100..140)
      const sMinus = makeStroke('s-minus', 155, 118, 180, 122)
      // Digit '4' at y = 102..138
      const sFour = makeStroke('s-4', 195, 102, 220, 138)
      // Equals sign two horizontal bars at y = 114..117 and y = 123..126
      const sEq1 = makeStroke('s-eq1', 235, 114, 260, 117)
      const sEq2 = makeStroke('s-eq2', 235, 123, 260, 126)
      // Digit '0' at y = 100..140
      const sZero = makeStroke('s-0', 275, 100, 300, 140)

      const groups = groupIntoHorizontalLines([sZero, sMinus, sX, sSup2, sEq2, sFour, sEq1])
      expect(groups).toHaveLength(1)
      expect(groups[0].strokeIds).toHaveLength(7)
      expect(groups[0].strokeIds).toEqual(
        expect.arrayContaining(['s-x', 's-sup2', 's-minus', 's-4', 's-eq1', 's-eq2', 's-0']),
      )
      expect(groups[0].minY).toBe(92)
      expect(groups[0].maxY).toBe(140)
    })

    it('groups 2 vertically stacked equations into 2 ordered MathLineGroups from top to bottom', () => {
      // Line 1 around y = 100..140
      const l1s1 = makeStroke('l1-1', 100, 100, 130, 140)
      const l1s2 = makeStroke('l1-2', 140, 118, 165, 122) // minus sign on line 1
      const l1s3 = makeStroke('l1-3', 180, 102, 210, 138)

      // Line 2 around y = 190..230
      const l2s1 = makeStroke('l2-1', 105, 190, 135, 230)
      const l2s2 = makeStroke('l2-2', 150, 208, 175, 212) // minus sign on line 2
      const l2s3 = makeStroke('l2-3', 190, 192, 220, 228)

      // Pass in scrambled order to verify top-to-bottom sorting
      const groups = groupIntoHorizontalLines([l2s2, l1s3, l2s1, l1s1, l2s3, l1s2])
      expect(groups).toHaveLength(2)

      expect(groups[0].strokeIds).toHaveLength(3)
      expect(groups[0].strokeIds).toEqual(expect.arrayContaining(['l1-1', 'l1-2', 'l1-3']))
      expect(groups[0].centerY).toBeLessThan(groups[1].centerY)

      expect(groups[1].strokeIds).toHaveLength(3)
      expect(groups[1].strokeIds).toEqual(expect.arrayContaining(['l2-1', 'l2-2', 'l2-3']))
    })

    it('groups 3 vertically stacked equations with mixed StampChars and Strokes into 3 ordered MathLineGroups', () => {
      // Line 1 (Stamped equation at y = 80, fontSize = 32 -> height = 40, y = 80..120)
      const c1 = makeChar('c-1', '2', 100, 80, 32)
      const c2 = makeChar('c-2', 'x', 116, 80, 32)
      const c3 = makeChar('c-3', '=', 148, 80, 32)
      const c4 = makeChar('c-4', '1', 180, 80, 32)
      const c5 = makeChar('c-5', '0', 196, 80, 32)

      // Line 2 (Handwritten step at y = 160..200)
      const l2s1 = makeStroke('l2-x', 100, 160, 125, 200)
      const l2s2 = makeStroke('l2-eq', 140, 176, 165, 184)
      const l2s3 = makeStroke('l2-5', 180, 162, 205, 198)

      // Line 3 (Handwritten verification at y = 240..280)
      const l3s1 = makeStroke('l3-1', 100, 240, 130, 280)
      const l3s2 = makeStroke('l3-2', 145, 242, 175, 278)

      const groups = groupIntoHorizontalLines([l3s2, l2s1, l3s1, l2s3, l2s2], [c3, c1, c5, c2, c4])

      expect(groups).toHaveLength(3)
      expect(groups[0].charIds).toHaveLength(5)
      expect(groups[0].strokeIds).toHaveLength(0)

      expect(groups[1].strokeIds).toHaveLength(3)
      expect(groups[1].charIds).toHaveLength(0)

      expect(groups[2].strokeIds).toHaveLength(2)
      expect(groups[2].charIds).toHaveLength(0)

      expect(groups[0].centerY).toBeLessThan(groups[1].centerY)
      expect(groups[1].centerY).toBeLessThan(groups[2].centerY)
    })
  })

  describe('checkMultiLineWork', () => {
    it('returns allValid: true for a valid 3-line linear derivation', () => {
      const result = checkMultiLineWork(['2x + 5 = 15', '2x = 10', 'x = 5'])
      expect(result.isMultiLine).toBe(true)
      expect(result.allValid).toBe(true)
      expect(result.errorLineIndex).toBeUndefined()
      expect(result.nextHint).toBeNull()
    })

    it('detects sign_error on line index 1 for invalid subtraction step', () => {
      const result = checkMultiLineWork(['2x + 5 = 15', '2x = 20'])
      expect(result.isMultiLine).toBe(true)
      expect(result.allValid).toBe(false)
      expect(result.errorLineIndex).toBe(1)
      expect(result.reason).toBe('sign_error')
      expect(result.diagnosticMessage).toBeDefined()
      expect(result.diagnosticMessage).toContain('subtracted')
      expect(result.nextHint).not.toBeNull()
      expect(result.nextHint?.expectedNextForm).toBe('2x = 10')
    })

    it('detects division_error on line index 2 in a 3-line derivation', () => {
      const result = checkMultiLineWork(['2x + 5 = 15', '2x = 10', 'x = 4'])
      expect(result.isMultiLine).toBe(true)
      expect(result.allValid).toBe(false)
      expect(result.errorLineIndex).toBe(2)
      expect(result.reason).toBe('division_error')
      expect(result.diagnosticMessage).toContain('division')
    })

    it('provides nextHint when multi-line work is valid so far but incomplete', () => {
      const result = checkMultiLineWork(['2x + 5 = 15', '2x = 10'])
      expect(result.isMultiLine).toBe(true)
      expect(result.allValid).toBe(true)
      expect(result.nextHint).not.toBeNull()
      expect(result.nextHint?.expectedNextForm).toBe('x = 5')
    })

    it('handles single-line input gracefully with isMultiLine: false', () => {
      const result = checkMultiLineWork(['2x + 5 = 15'])
      expect(result.isMultiLine).toBe(false)
      expect(result.allValid).toBe(true)
      expect(result.nextHint?.expectedNextForm).toBe('2x = 10')
    })
  })
})
