import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const inkyBoardSrc = readFileSync(resolve(__dirname, 'InkyBoard.tsx'), 'utf-8')
const capsuleSrc = readFileSync(resolve(__dirname, 'MathActionCapsule.tsx'), 'utf-8')
const indexCss = readFileSync(resolve(__dirname, '../../index.css'), 'utf-8')

describe('Escape dismisses the capsule', () => {
  it('checks mathCapsule inside the Escape branch, before clearSelection', () => {
    const escapeIdx = inkyBoardSrc.indexOf("e.key === 'Escape'")
    expect(escapeIdx).toBeGreaterThan(-1)
    const branch = inkyBoardSrc.slice(escapeIdx, escapeIdx + 400)
    expect(branch).toMatch(/inkyStore\.mathCapsule/)
    expect(branch).toMatch(/setMathCapsule\(null\)/)
    expect(branch.indexOf('setMathCapsule(null)')).toBeLessThan(branch.indexOf('clearSelection'))
  })
})

describe('Clicking empty canvas dismisses the capsule', () => {
  it('handlePointerDown nulls the capsule after the .inky-ui guard', () => {
    const downIdx = inkyBoardSrc.indexOf('const handlePointerDown')
    expect(downIdx).toBeGreaterThan(-1)
    const body = inkyBoardSrc.slice(downIdx, downIdx + 800)
    const guardIdx = body.indexOf('.inky-ui')
    const dismissIdx = body.indexOf('setMathCapsule(null)')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(dismissIdx).toBeGreaterThan(guardIdx)
  })
})

describe('Capsule exit animation', () => {
  it('defines the capsuleOut keyframes and .inky-capsule-out class in index.css', () => {
    expect(indexCss).toContain('@keyframes capsuleOut')
    expect(indexCss).toContain('.inky-capsule-out')
  })

  it('renders the exiting pill with .inky-capsule-out and a testable state attr', () => {
    expect(capsuleSrc).toContain('inky-capsule-out')
    expect(capsuleSrc).toMatch(/data-capsule-state=/)
    expect(capsuleSrc).toMatch(/exiting/)
  })
})

describe('Stale-capsule guard', () => {
  it('runs validateCapsuleIntegrity in the store subscription', () => {
    expect(capsuleSrc).toMatch(/import \{ validateCapsuleIntegrity \}/)
    expect(capsuleSrc).toMatch(/validateCapsuleIntegrity\(/)
  })
})
