import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('UI touch targets accessibility & unified command bar', () => {
  it('Toolbar primary tool buttons have minimum 40px touch envelopes', () => {
    const toolbarSrc = readFileSync(resolve(__dirname, 'Toolbar.tsx'), 'utf-8')
    expect(toolbarSrc).toMatch(/min-w-\[40px\]|min-w-\[44px\]/)
  })

  it('Unified Toolbar contains integrated color swatches and stroke size buttons with 36px+ targets', () => {
    const toolbarSrc = readFileSync(resolve(__dirname, 'Toolbar.tsx'), 'utf-8')
    expect(toolbarSrc).toMatch(/min-w-\[36px\]/)
    expect(toolbarSrc).toContain('PALETTE_COLORS')
  })
})
