import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('UI touch targets accessibility (WCAG 2.5.5 / Chromebook ergonomics)', () => {
  it('Toolbar primary tool buttons have minimum 40-44px touch envelopes', () => {
    const toolbarSrc = readFileSync(resolve(__dirname, 'Toolbar.tsx'), 'utf-8')
    // Buttons in primary tool strip should have min-w / min-h touch target or generous p-2.5 / min-44
    expect(toolbarSrc).toMatch(/min-w-\[44px\]|min-h-\[44px\]|p-2\.5|p-3|w-10 h-10|w-11 h-11/)
  })

  it('StylePanel color swatches and size buttons have accessible touch hit targets', () => {
    const stylePanelSrc = readFileSync(resolve(__dirname, 'StylePanel.tsx'), 'utf-8')
    expect(stylePanelSrc).toMatch(
      /min-w-\[36px\]|min-w-\[40px\]|min-w-\[44px\]|w-9 h-9|w-10 h-10|w-11 h-11/,
    )
  })
})
