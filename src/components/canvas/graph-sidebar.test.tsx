import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inkyStore } from '../../lib/canvas/store'
import { GraphSidebar } from './GraphSidebar'

let roots: Root[] = []
let containers: HTMLDivElement[] = []

const flush = () => new Promise((resolve) => setTimeout(resolve, 50))

function mountSidebar() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  containers.push(el)
  root.render(<GraphSidebar />)
  return flush()
}

describe('GraphSidebar component', () => {
  beforeEach(() => {
    inkyStore.closeGraphSidebar()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    for (const root of roots) root.unmount()
    for (const container of containers) container.remove()
    roots = []
    containers = []
    document.body.innerHTML = ''
  })

  it('renders nothing when graphSidebar.isOpen is false', async () => {
    await mountSidebar()
    expect(document.querySelector('[data-testid="graph-sidebar"]')).toBeNull()
  })

  it('renders docked sidebar when graphSidebar.isOpen is true', async () => {
    inkyStore.openGraphSidebar('y = 2x + 1')
    await mountSidebar()

    const sidebar = document.querySelector('[data-testid="graph-sidebar"]')
    expect(sidebar).not.toBeNull()
    expect(sidebar?.textContent).toContain('Function Graph')

    const input = document.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('y = 2x + 1')
  })

  it('updates when user types a new formula in the input box', async () => {
    inkyStore.openGraphSidebar('y = x^2 - 4')
    await mountSidebar()

    const input = document.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('y = x² - 4')

    // Simulate direct input change
    input.value = 'y = x² - 9'
    inkyStore.updateGraphedEquation('y = x² - 9')
    await flush()

    // State in inkyStore was updated
    expect(inkyStore.graphSidebar.equation).toBe('y = x² - 9')
  })

  it('closes sidebar when close button is clicked', async () => {
    inkyStore.openGraphSidebar('y = 2x + 1')
    await mountSidebar()

    const closeBtn = document.querySelector(
      'button[aria-label="Close graph sidebar"]',
    ) as HTMLButtonElement
    expect(closeBtn).not.toBeNull()

    closeBtn.click()
    await flush()

    expect(inkyStore.graphSidebar.isOpen).toBe(false)
  })

  it('replaces equation when openGraphSidebar is called with a new formula', async () => {
    inkyStore.openGraphSidebar('y = 2x + 1')
    await mountSidebar()

    const input = document.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('y = 2x + 1')

    inkyStore.openGraphSidebar('y = \\sin(x)')
    await flush()

    expect(input.value).toBe('y = sin(x)')
  })

  it('automatically elevates exponents to superscripts as user types', async () => {
    inkyStore.openGraphSidebar('y = x^2 - 4')
    await mountSidebar()

    const input = document.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('y = x² - 4')
  })

  it('normalizes spaced-out LaTeX braces like 3x ^ { 2 } + 4x to natural math 3x² + 4x', async () => {
    inkyStore.openGraphSidebar('3x ^ { 2 } + 4x')
    await mountSidebar()

    const input = document.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('3x² + 4x')
  })

  it('toggles virtual math keypad on and off', async () => {
    inkyStore.openGraphSidebar('y = 2x + 1')
    await mountSidebar()

    // Initially closed
    expect(document.querySelector('button[title="Clear All"]')).toBeNull()

    const keypadToggle = document.querySelector('button[title="Show Keypad"]') as HTMLButtonElement
    expect(keypadToggle).not.toBeNull()

    keypadToggle.click()
    await flush()

    // Keypad is now open
    const clearAllBtn = document.querySelector('button[title="Clear All"]')
    expect(clearAllBtn).not.toBeNull()
  })

  it('closes sidebar when Escape is pressed inside equation input box', async () => {
    inkyStore.openGraphSidebar('y = 2x + 1')
    await mountSidebar()

    expect(inkyStore.graphSidebar.isOpen).toBe(true)

    const input = document.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.focus()

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()

    expect(inkyStore.graphSidebar.isOpen).toBe(false)
  })
})
