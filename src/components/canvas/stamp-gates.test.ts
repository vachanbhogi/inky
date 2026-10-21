import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const canvasLayerSrc = readFileSync(resolve(__dirname, 'CanvasLayer.tsx'), 'utf-8')
const capsuleSrc = readFileSync(resolve(__dirname, 'MathActionCapsule.tsx'), 'utf-8')
const storeSrc = readFileSync(resolve(__dirname, '../../lib/canvas/store.ts'), 'utf-8')

describe('CanvasLayer handwriting wipe', () => {
  it('imports and calls stampWipe', () => {
    expect(canvasLayerSrc).toMatch(/import \{[^}]*stampWipe/)
    expect(canvasLayerSrc).toContain('stampWipe(')
  })

  it('clips the stamped strokes with the wipe edge', () => {
    expect(canvasLayerSrc).toMatch(/ctx\.clip\(/)
  })

  it('keeps the RAF loop alive while a reveal is running', () => {
    expect(canvasLayerSrc).toMatch(/needsContinuousAnimation[\s\S]*stampedReveal/)
  })
})

describe('MathActionCapsule stamping', () => {
  it('uses stampResult instead of per-stroke addStroke', () => {
    expect(capsuleSrc).toMatch(/stampResult\(/)
    expect(capsuleSrc).not.toMatch(/inkyStore\.addStroke\(/)
  })
})

describe('dev-only E2E hook', () => {
  it('exposes window.inkyStore guarded by import.meta.env.DEV', () => {
    expect(storeSrc).toMatch(/import\.meta\.env\.DEV[\s\S]{0,120}window[^\n]*inkyStore/)
  })
})
