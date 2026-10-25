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
    expect(input.value).toBe('y = x^2 - 4')

    // Simulate direct input change
    input.value = 'y = x^2 - 9'
    inkyStore.updateGraphedEquation('y = x^2 - 9')
    await flush()

    // State in inkyStore was updated
    expect(inkyStore.graphSidebar.equation).toBe('y = x^2 - 9')
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

    expect(input.value).toBe('y = \\sin(x)')
  })

  it('updates equation when a preset button is clicked', async () => {
    inkyStore.openGraphSidebar('y = 2x + 1')
    await mountSidebar()

    const presetBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('y = x² - 4'),
    ) as HTMLButtonElement
    expect(presetBtn).toBeDefined()

    presetBtn.click()
    await flush()

    const input = document.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('y = x^2 - 4')
    expect(inkyStore.graphSidebar.equation).toBe('y = x^2 - 4')
  })

  it('toggles virtual math keypad on and off', async () => {
    inkyStore.openGraphSidebar('y = 2x + 1')
    await mountSidebar()

    // Initially closed
    expect(document.querySelector('button[title="Clear All"]')).toBeNull()

    const keypadToggle = document.querySelector(
      'button[title="Show Math Keypad"]',
    ) as HTMLButtonElement
    expect(keypadToggle).not.toBeNull()

    keypadToggle.click()
    await flush()

    // Keypad is now open
    const clearAllBtn = document.querySelector('button[title="Clear All"]')
    expect(clearAllBtn).not.toBeNull()
  })
})
