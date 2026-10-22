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
})
