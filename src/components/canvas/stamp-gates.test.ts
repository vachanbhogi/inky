import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const canvasLayerSrc = readFileSync(resolve(__dirname, 'CanvasLayer.tsx'), 'utf-8')
const capsuleSrc = readFileSync(resolve(__dirname, 'MathActionCapsule.tsx'), 'utf-8')
const stampLayerSrc = readFileSync(resolve(__dirname, 'StampLayer.tsx'), 'utf-8')
const boardSrc = readFileSync(resolve(__dirname, 'InkyBoard.tsx'), 'utf-8')
const storeSrc = readFileSync(resolve(__dirname, '../../lib/canvas/store.ts'), 'utf-8')

describe('StampLayer (stamps are real text)', () => {
  it('renders stamps in the Caveat handwriting face with a stable DOM id', () => {
    expect(stampLayerSrc).toMatch(/@fontsource\/caveat/)
    expect(stampLayerSrc).toContain('Caveat')
    expect(stampLayerSrc).toMatch(/data-stamp-id/)
  })

  it('runs the feathered wipe with the locked motion constants', () => {
    expect(stampLayerSrc).toMatch(/import \{[^}]*stampWipe/)
    expect(stampLayerSrc).toMatch(/STAMP_WIPE_EDGE_PX/)
    expect(stampLayerSrc).toContain('requestAnimationFrame')
    expect(stampLayerSrc).toMatch(/maskImage/)
    expect(stampLayerSrc).toMatch(/prefersReducedMotion/)
  })

  it('positions stamps from world coordinates so they pan/zoom with ink', () => {
    expect(stampLayerSrc).toMatch(/toScreen\(stamp\.worldX, stamp\.worldY, camera\)/)
    expect(stampLayerSrc).toMatch(/fontSize: `\$\{stamp\.fontSize \* camera\.z\}px`/)
  })
})

describe('CanvasLayer no longer owns the wipe', () => {
  it('has no stamped-reveal or stampWipe code left', () => {
    expect(canvasLayerSrc).not.toMatch(/stampedReveal/)
    expect(canvasLayerSrc).not.toMatch(/stampWipe/)
  })
})

describe('capsule stamping', () => {
  it('uses stampResult instead of per-stroke addStroke or a placeholder plan', () => {
    expect(capsuleSrc).toMatch(/stampResult\(/)
    expect(capsuleSrc).not.toMatch(/inkyStore\.addStroke\(/)
    expect(capsuleSrc).not.toMatch(/planStamp/)
  })

  it('sizes the stamp from the enclosed strokes (matches the user hand)', () => {
    expect(capsuleSrc).toMatch(/maxY - minY\) \* 1\.6/)
    expect(capsuleSrc).toMatch(/Math\.min\(96, Math\.max\(16,/)
  })
})

describe('eraser removes chars', () => {
  it('hit-tests chars in world space before strokes', () => {
    expect(boardSrc).toMatch(/deleteCharAt\(worldPoint\[0\], worldPoint\[1\], eraserRadius\)/)
    expect(storeSrc).toMatch(/deleteCharAt\(/)
  })
})

describe('chars render as first-class DOM items', () => {
  it('StampLayer renders one addressable span per char', () => {
    expect(stampLayerSrc).toMatch(/data-char-id=/)
  })
})

describe('pending ML never shows a placeholder formula (user pass)', () => {
  it('shows Reading… and gates actions while mlPending', () => {
    expect(capsuleSrc).toContain('Reading…')
    expect(capsuleSrc).toMatch(/!display\.mlPending \? getAvailableActions/)
  })

  it('closes the capsule when ML fails and the rule fallback is empty (M9)', () => {
    expect(boardSrc).toMatch(/if \(capsule\.latex\)/)
  })
})

describe('dev-only E2E hook', () => {
  it('exposes window.inkyStore guarded by import.meta.env.DEV', () => {
    expect(storeSrc).toMatch(/import\.meta\.env\.DEV[\s\S]{0,120}window[^\n]*inkyStore/)
  })
})
