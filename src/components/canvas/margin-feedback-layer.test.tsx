import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createRoot, type Root } from 'react-dom/client'
import { inkyStore } from '../../lib/canvas/store'
import {
  evaluateDerivationSteps,
  getErrorBadgeLabel,
  type MarginChipItem,
  MarginFeedbackLayer,
} from './MarginFeedbackLayer'

let roots: Root[] = []
let containers: HTMLDivElement[] = []

const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

async function mountLayer(props?: { items?: MarginChipItem[] }) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  containers.push(el)
  root.render(<MarginFeedbackLayer {...props} />)
  await flush()
  return el
}

describe('MarginFeedbackLayer (Prototype B: Tactile Margin Indicator)', () => {
  beforeEach(() => {
    while (inkyStore.canUndo) inkyStore.undo()
    while (inkyStore.canRedo) inkyStore.redo()
    inkyStore.strokes = []
    inkyStore.stamps = []
    inkyStore.stampedReveal = null
    inkyStore.setMathCapsule(null)
    inkyStore.camera = { x: 0, y: 0, z: 1 }
    inkyStore.setActiveTool('select')
  })

  afterEach(() => {
    for (const root of roots) root.unmount()
    for (const container of containers) container.remove()
    roots = []
    containers = []
    document.body.innerHTML = ''
  })

  describe('Error categorization', () => {
    test('maps error types accurately to tactile chip labels', () => {
      expect(getErrorBadgeLabel('sign_error')).toBe('Sign Error')
      expect(getErrorBadgeLabel('arithmetic_error')).toBe('Arithmetic Error')
      expect(getErrorBadgeLabel('division_error')).toBe('Division Error')
      expect(getErrorBadgeLabel('factor_error')).toBe('Factor Error')
      expect(getErrorBadgeLabel('syntax_error')).toBe('Check Syntax')
      expect(getErrorBadgeLabel('unknown')).toBe('Check Step')
      expect(getErrorBadgeLabel(undefined)).toBe('Check Step')
    })
  })

  describe('Render & Visual Presentation', () => {
    test('renders a neutral, crisp check dot for a valid derivation step', async () => {
      const validItem: MarginChipItem = {
        id: 'step-1',
        worldX: 300,
        worldY: 150,
        type: 'valid',
        latex: '2x = 10',
      }

      await mountLayer({ items: [validItem] })

      const chip = document.querySelector('[data-testid="margin-chip-step-1"]')
      expect(chip).not.toBeNull()
      expect(chip?.textContent).toContain('✓')
      expect(chip?.getAttribute('aria-label')).toContain('Step verified')
    })

    test('renders a gentle amber pill for a discrepancy step', async () => {
      const errorItem: MarginChipItem = {
        id: 'step-err',
        worldX: 300,
        worldY: 180,
        type: 'discrepancy',
        errorType: 'sign_error',
        hint: 'Did you forget to change signs when moving terms across the equals sign?',
      }

      await mountLayer({ items: [errorItem] })

      const chip = document.querySelector('[data-testid="margin-chip-step-err"]')
      expect(chip).not.toBeNull()
      expect(chip?.textContent).toContain('Sign Error')
      expect(chip?.className).toContain('text-amber-800')
    })
  })

  describe('Expansion micro-interaction & Socratic guidance card', () => {
    test('tapping chip expands the Socratic guidance card with pedagogical advice', async () => {
      const errorItem: MarginChipItem = {
        id: 'step-amber',
        worldX: 200,
        worldY: 100,
        type: 'discrepancy',
        errorType: 'sign_error',
        hint: 'Check terms when balancing across =',
        socraticHint: {
          operation: 'Subtract 5 from both sides',
          socraticPrompt: 'How can you isolate the variable term by balancing the constant?',
          expectedNextForm: '2x = 10',
        },
      }

      await mountLayer({ items: [errorItem] })

      // Initially card is closed
      expect(document.querySelector('[data-testid="socratic-guidance-card"]')).toBeNull()

      // Tap chip
      const chipBtn = document.querySelector(
        '[data-testid="margin-chip-step-amber"]',
      ) as HTMLButtonElement
      chipBtn.click()
      await flush()

      // Card is now expanded
      const card = document.querySelector('[data-testid="socratic-guidance-card"]')
      expect(card).not.toBeNull()
      expect(card?.textContent).toContain('Sign Error')
      expect(card?.textContent).toContain('Check terms when balancing across =')
      expect(card?.textContent).toContain(
        'How can you isolate the variable term by balancing the constant?',
      )
      expect(card?.textContent).toContain('2x = 10')

      // Close via close button
      const closeBtn = document.querySelector('[aria-label="Close guidance"]') as HTMLButtonElement
      expect(closeBtn).not.toBeNull()
      closeBtn.click()
      await flush()

      expect(document.querySelector('[data-testid="socratic-guidance-card"]')).toBeNull()
    })
  })

  describe('Camera coordinate transformation (Zero layout shift)', () => {
    test('positions chip in screen space based on camera pan and zoom', async () => {
      inkyStore.camera = { x: 50, y: 100, z: 2 }

      const item: MarginChipItem = {
        id: 'step-cam',
        worldX: 100,
        worldY: 200,
        type: 'valid',
      }

      await mountLayer({ items: [item] })

      const chip = document.querySelector('[data-testid="margin-chip-step-cam"]') as HTMLElement
      expect(chip).not.toBeNull()
      // screenX = worldX * z + x = 100 * 2 + 50 = 250
      // screenY = worldY * z + y = 200 * 2 + 100 = 500
      expect(chip.style.left).toBe('250px')
      expect(chip.style.top).toBe('500px')
    })

    test('updates position synchronously when inkyStore camera moves', async () => {
      const item: MarginChipItem = {
        id: 'step-move',
        worldX: 100,
        worldY: 100,
        type: 'valid',
      }

      await mountLayer({ items: [item] })

      const chip = document.querySelector('[data-testid="margin-chip-step-move"]') as HTMLElement
      expect(chip.style.left).toBe('100px')
      expect(chip.style.top).toBe('100px')

      // Pan camera
      inkyStore.setCamera({ x: 40, y: -20 })
      await flush()

      expect(chip.style.left).toBe('140px')
      expect(chip.style.top).toBe('80px')
    })
  })

  describe('Whiteboard craftsmanship: drawing tool inertness', () => {
    test('chips do not capture pointer events while draw tool is active', async () => {
      inkyStore.setActiveTool('draw')

      const item: MarginChipItem = {
        id: 'step-draw',
        worldX: 100,
        worldY: 100,
        type: 'valid',
      }

      await mountLayer({ items: [item] })

      const chip = document.querySelector('[data-testid="margin-chip-step-draw"]') as HTMLElement
      expect(chip.className).toContain('pointer-events-none')
    })

    test('chips become interactive when select tool is active', async () => {
      inkyStore.setActiveTool('select')

      const item: MarginChipItem = {
        id: 'step-select',
        worldX: 100,
        worldY: 100,
        type: 'valid',
      }

      await mountLayer({ items: [item] })

      const chip = document.querySelector('[data-testid="margin-chip-step-select"]') as HTMLElement
      expect(chip.className).toContain('pointer-events-auto')
    })
  })

  describe('Derivation chain evaluation helper', () => {
    test('evaluates valid steps and error steps in derivation sequence', () => {
      const steps = ['2x + 5 = 15', '2x = 10', 'x = 5']
      const items = evaluateDerivationSteps(steps)
      expect(items.length).toBe(3)
      expect(items[0].type).toBe('valid')
      expect(items[1].type).toBe('valid')
      expect(items[2].type).toBe('valid')

      const badSteps = ['2x + 5 = 15', '2x = 20']
      const badItems = evaluateDerivationSteps(badSteps)
      expect(badItems.length).toBe(2)
      expect(badItems[1].type).toBe('discrepancy')
      expect(badItems[1].errorType).toBe('sign_error')
      expect(badItems[1].hint).toContain('added instead of subtracted')
    })
  })

  describe('Dismissal on Escape', () => {
    test('pressing Escape dismisses expanded guidance card', async () => {
      const item: MarginChipItem = {
        id: 'esc-test',
        worldX: 150,
        worldY: 150,
        type: 'discrepancy',
        errorType: 'arithmetic_error',
      }

      await mountLayer({ items: [item] })

      const chip = document.querySelector(
        '[data-testid="margin-chip-esc-test"]',
      ) as HTMLButtonElement
      chip.click()
      await flush()

      expect(document.querySelector('[data-testid="socratic-guidance-card"]')).not.toBeNull()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flush()

      expect(document.querySelector('[data-testid="socratic-guidance-card"]')).toBeNull()
    })
  })
})
