import { describe, expect, it } from 'vitest'
import { validateCapsuleIntegrity } from './capsule-integrity'

describe('validateCapsuleIntegrity', () => {
  it('treats a null capsule as valid (nothing to validate)', () => {
    expect(validateCapsuleIntegrity(null, [{ id: 'a' }])).toBe(true)
  })

  it('is valid while every enclosed stroke still exists', () => {
    expect(
      validateCapsuleIntegrity({ enclosedStrokeIds: ['a', 'b'] }, [{ id: 'a' }, { id: 'b' }]),
    ).toBe(true)
  })

  it('is invalid when an enclosed stroke was erased or deleted', () => {
    expect(validateCapsuleIntegrity({ enclosedStrokeIds: ['a', 'b'] }, [{ id: 'a' }])).toBe(false)
  })

  it('is valid for a capsule that encloses nothing', () => {
    expect(validateCapsuleIntegrity({ enclosedStrokeIds: [] }, [])).toBe(true)
  })

  it('is invalid when the canvas is empty but strokes were enclosed', () => {
    expect(validateCapsuleIntegrity({ enclosedStrokeIds: ['a'] }, [])).toBe(false)
  })

  it('validates enclosed stamp characters when present', () => {
    const stamp = {
      id: 'stamp-1',
      text: '2x=2',
      worldX: 0,
      worldY: 0,
      color: '#111111',
      fontSize: 24,
      chars: [
        { id: 'c0', char: '2', worldX: 0, worldY: 0, fontSize: 24, angle: 0 },
        { id: 'c1', char: 'x', worldX: 12, worldY: 0, fontSize: 24, angle: 0 },
      ],
    }

    expect(
      validateCapsuleIntegrity(
        { enclosedStrokeIds: [], enclosedCharIds: ['c0', 'c1'] },
        [],
        [stamp],
      ),
    ).toBe(true)

    // Invalid when a char is missing (erased)
    expect(
      validateCapsuleIntegrity(
        { enclosedStrokeIds: [], enclosedCharIds: ['c0', 'c1', 'c2'] },
        [],
        [stamp],
      ),
    ).toBe(false)
  })
})
