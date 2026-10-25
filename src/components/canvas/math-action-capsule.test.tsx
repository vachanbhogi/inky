import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createRoot, type Root } from 'react-dom/client'
import { inkyStore } from '../../lib/canvas/store'
import { prewarmModel, setWorkerFactoryForTest } from '../../lib/math/ml-recognizer'
import { MathActionCapsule } from './MathActionCapsule'

// The store is a singleton shared across the suite: drain undo/redo BEFORE
// clearing arrays (undo()/redo() restore old snapshots otherwise).
let roots: Root[] = []
let containers: HTMLDivElement[] = []

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function mountCapsule() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  containers.push(el)
  root.render(<MathActionCapsule />)
  await flush()
}

function setCapsule(latex: string, mlPending = false) {
  inkyStore.setMathCapsule({
    latex,
    worldPosition: { x: 200, y: 200 },
    enclosedStrokeIds: [],
    source: 'ml',
    mlPending,
  })
}

function button(label: string): HTMLButtonElement | null {
  return [...document.querySelectorAll('button')].find((b) => b.textContent === label) ?? null
}

describe('MathActionCapsule availability (emitted latex shapes)', () => {
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

  test('Solve and Factor are live for the brace-form quadratic (dead-Solve regression)', async () => {
    setCapsule('x^{ 2 }-1=0')
    await mountCapsule()
    const solve = button('Solve')
    expect(solve).not.toBeNull()
    // The user-visible symptom: these were aria-disabled="true" while the
    // formula rendered perfectly.
    expect(solve?.getAttribute('aria-disabled')).toBe('false')
    expect(button('Factor')?.getAttribute('aria-disabled')).toBe('false')
    expect(button('Simplify')?.getAttribute('aria-disabled')).toBe('true')
  })

  test('clicking live Solve stamps the solved answer, never the question', async () => {
    setCapsule('x^{ 2 }-1=0')
    await mountCapsule()
    button('Solve')?.click()
    await flush()
    expect(inkyStore.stamps.map((s) => s.text)).toEqual(['x = 1, -1'])
    // stampResult dismisses the capsule and returns the user to the pen.
    expect(inkyStore.mathCapsule).toBeNull()
    expect(inkyStore.activeTool).toBe('draw')
  })

  test('unavailable actions are inert: clicking stamps nothing', async () => {
    setCapsule('abc')
    await mountCapsule()
    expect(button('Solve')?.getAttribute('aria-disabled')).toBe('true')
    button('Solve')?.click()
    await flush()
    expect(inkyStore.stamps).toHaveLength(0)
    expect(inkyStore.mathCapsule).not.toBeNull()
  })

  test('pending ML shows Reading… and keeps every action inert', async () => {
    setCapsule('x^{ 2 }-1=0', true)
    await mountCapsule()
    expect(document.body.textContent).toContain('Reading…')
    expect(button('Solve')?.getAttribute('aria-disabled')).toBe('true')
    expect(button('Factor')?.getAttribute('aria-disabled')).toBe('true')
  })

  test('pending ML shows Loading math model… when model is loading, then transitions to Reading…', async () => {
    class MockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: unknown) => void) | null = null
      postMessage() {}
      terminate() {}
    }
    const mw = new MockWorker()
    setWorkerFactoryForTest(() => mw as unknown as Worker)
    prewarmModel()
    mw.onmessage?.(new MessageEvent('message', { data: { status: 'loading' } }))

    setCapsule('x^{ 2 }-1=0', true)
    await mountCapsule()
    expect(document.body.textContent).toContain('Loading math model…')

    mw.onmessage?.(new MessageEvent('message', { data: { status: 'ready' } }))
    await flush()
    expect(document.body.textContent).toContain('Reading…')
    setWorkerFactoryForTest(null)
  })

  test('renders $-wrapped latex through KaTeX, not the raw-text fallback', async () => {
    setCapsule('$x^{2}-5x+6=0$')
    await mountCapsule()
    // KaTeX throws on `$` — without stripping, renderFormula falls back to
    // showing the raw latex string instead of typeset math.
    expect(document.querySelector('.inky-capsule-formula')).not.toBeNull()
    expect(document.body.textContent).not.toContain('$x^{2}')
    expect(button('Solve')?.getAttribute('aria-disabled')).toBe('false')
  })
})
