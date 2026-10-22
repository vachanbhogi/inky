import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const capsuleSrc = readFileSync(resolve(__dirname, 'MathActionCapsule.tsx'), 'utf-8')

describe('MathActionCapsule action gating', () => {
  it('derives the action list from getAvailableActions, gated on ML', () => {
    expect(capsuleSrc).toMatch(/import \{[^}]*getAvailableActions/)
    expect(capsuleSrc).toMatch(/getAvailableActions\(display\.latex\)/)
    // No action may be offered while the formula is still a rule placeholder.
    expect(capsuleSrc).toMatch(/!display\.mlPending/)
  })

  it('renders the buttons from a list instead of hardcoding three', () => {
    // The three buttons must be produced by mapping/filtering an actions
    // list, not written out unconditionally one by one.
    expect(capsuleSrc).toMatch(/\.map\(/)
    expect(capsuleSrc).toMatch(/actions/i)
  })

  it('marks unavailable actions aria-disabled with reduced opacity', () => {
    expect(capsuleSrc).toContain('aria-disabled')
    expect(capsuleSrc).toMatch(/opacity-40/)
    expect(capsuleSrc).toMatch(/Not applicable to this formula/)
  })
})

describe('pending state (user pass: no placeholder formula)', () => {
  it('shows Reading… instead of raw latex while ML is pending', () => {
    expect(capsuleSrc).toMatch(/mlPending \? \(\s*<span[^>]*>Reading…/)
  })
})

describe('accessibility (M7)', () => {
  it('labels the capsule group and announces formula changes', () => {
    expect(capsuleSrc).toMatch(/<fieldset/)
    expect(capsuleSrc).toMatch(/aria-label="Formula actions"/)
    expect(capsuleSrc).toMatch(/aria-live="polite"/)
  })
})

describe('re-render discipline (M3/M6)', () => {
  it('only re-positions for real camera moves', () => {
    expect(capsuleSrc).toMatch(/prev\.x === c\.x && prev\.y === c\.y && prev\.z === c\.z/)
  })

  it('guards the sparkle resolve when the capsule closed mid-pending', () => {
    expect(capsuleSrc).toMatch(/if \(!capsule\) \{\s*prevPendingRef\.current = false/)
  })
})
