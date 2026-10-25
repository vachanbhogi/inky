import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const inkyBoardSrc = readFileSync(resolve(__dirname, 'InkyBoard.tsx'), 'utf-8')
const capsuleSrc = readFileSync(resolve(__dirname, 'MathActionCapsule.tsx'), 'utf-8')
const indexCss = readFileSync(resolve(__dirname, '../../index.css'), 'utf-8')

describe('InkyBoard mlPending lifecycle', () => {
  it('opens the rule capsule with mlPending: true', () => {
    // The instant rule capsule must advertise that ML is still running.
    expect(inkyBoardSrc).toMatch(/source: 'rule',\s*mlPending: true/)
  })

  it('clears mlPending on the ML upgrade path', () => {
    const upgradeIdx = inkyBoardSrc.indexOf("source: 'ml'")
    expect(upgradeIdx).toBeGreaterThan(-1)
    const upgradeCall = inkyBoardSrc.slice(upgradeIdx - 200, upgradeIdx + 30)
    expect(upgradeCall).toMatch(/mlPending:\s*false/)
  })

  it('clears mlPending on the ML failure path (null result)', () => {
    // When recognizeInkML resolves null, the pending flag must still clear —
    // the sparkle may not spin forever on the rule latex.
    const nullBranchIdx = inkyBoardSrc.indexOf('if (!mlLatex)')
    expect(nullBranchIdx).toBeGreaterThan(-1)
    // The settle call clearing pending must exist within the null branch
    // (failure settle), before the branch's early return. With an empty rule
    // fallback the capsule closes instead — both live under this branch.
    const nullBranch = inkyBoardSrc.slice(nullBranchIdx, nullBranchIdx + 600)
    expect(nullBranch).toMatch(/mlPending:\s*false/)
    expect(nullBranch).toMatch(/setMathCapsule\(null\)/)
  })
})

describe('MathActionCapsule sparkle rendering', () => {
  it('renders the sparkle dot gated on mlPending', () => {
    expect(capsuleSrc).toContain('inky-capsule-sparkle')
    expect(capsuleSrc).toMatch(/mlPending/)
    expect(capsuleSrc).toMatch(/\?\s*['"`]/)
  })

  it('applies the one-shot resolve pop when ML settles', () => {
    expect(capsuleSrc).toContain('inky-capsule-sparkle-resolve')
  })
})

describe('sparkle CSS', () => {
  it('defines the sparklePulse keyframes', () => {
    expect(indexCss).toContain('@keyframes sparklePulse')
  })

  it('defines the resolve-pop keyframes', () => {
    expect(indexCss).toContain('@keyframes sparkleResolve')
  })

  it('is covered by the reduced-motion override (no infinite spin under reduce)', () => {
    // The global override disables animations under .inky-ui * — the sparkle
    // lives inside the capsule root, so it is covered. Assert the override
    // exists and targets descendants.
    expect(indexCss).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]{0,200}\.inky-ui \*/)
  })
})
