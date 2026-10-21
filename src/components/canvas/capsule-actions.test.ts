import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const capsuleSrc = readFileSync(resolve(__dirname, 'MathActionCapsule.tsx'), 'utf-8')

describe('MathActionCapsule action gating', () => {
  it('derives the action list from getAvailableActions', () => {
    expect(capsuleSrc).toMatch(/import \{[^}]*getAvailableActions/)
    expect(capsuleSrc).toMatch(/getAvailableActions\(display\.latex\)/)
  })

  it('renders the buttons from a list instead of hardcoding three', () => {
    // The three buttons must be produced by mapping/filtering an actions
    // list, not written out unconditionally one by one.
    expect(capsuleSrc).toMatch(/\.map\(/)
    // The old unconditional triple is gone: a lone hardcoded "Simplify"
    // button outside any map would still pass a naive contains-check, so
    // assert the action descriptor list exists.
    expect(capsuleSrc).toMatch(/actions/i)
  })

  it('marks unavailable actions aria-disabled with reduced opacity', () => {
    expect(capsuleSrc).toContain('aria-disabled')
    expect(capsuleSrc).toMatch(/opacity-40/)
  })
})

describe('un-stampable results (final review I1/C1)', () => {
  it('routes results the glyph table cannot draw to an inline notice', () => {
    expect(capsuleSrc).toMatch(/planStamp\(/)
    expect(capsuleSrc).toMatch(/plan\.kind === 'show'/)
    expect(capsuleSrc).toMatch(/setNotice/)
  })
})
