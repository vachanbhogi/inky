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

  test('Hint button appears when Socratic hint is available and stamps the next balanced step', async () => {
    setCapsule('2x + 5 = 15')
    await mountCapsule()
    const hintBtn = button('Hint')
    expect(hintBtn).not.toBeNull()
    expect(hintBtn?.getAttribute('aria-disabled')).toBe('false')

    hintBtn?.click()
    await flush()

    expect(inkyStore.stamps).toHaveLength(1)
    expect(inkyStore.stamps[0].text).toBe('2x = 10')
    expect(inkyStore.stamps[0].color).toBe('#2563eb')
    expect(inkyStore.stamps[0].worldX).toBe(200)
    expect(inkyStore.stamps[0].worldY).toBe(222)
    expect(inkyStore.mathCapsule).toBeNull()
    expect(inkyStore.activeTool).toBe('draw')
  })

  test('Hint button does not appear when no Socratic hint is available (e.g. solved x = 5)', async () => {
    setCapsule('x = 5')
    await mountCapsule()
    expect(button('Hint')).toBeNull()
  })

  test('Hint button does not appear when ML inference is pending', async () => {
    setCapsule('2x + 5 = 15', true)
    await mountCapsule()
    expect(button('Hint')).toBeNull()
  })

  test('Hint stamps below enclosed strokes with size & line gap proportional to writing', async () => {
    const strokeId = 'stroke-test-1'
    inkyStore.strokes = [
      {
        id: strokeId,
        color: '#000000',
        size: 2,
        points: [
          [100, 50, 0.5],
          [180, 90, 0.5],
        ],
        pathData: 'M 100 50 L 180 90',
        boundingBox: { minX: 100, maxX: 180, minY: 50, maxY: 90 },
      },
    ]
    inkyStore.setMathCapsule({
      latex: '2x + 5 = 15',
      worldPosition: { x: 140, y: 70 },
      enclosedStrokeIds: [strokeId],
      source: 'ml',
      mlPending: false,
    })
    await mountCapsule()
    const hintBtn = button('Hint')
    expect(hintBtn).not.toBeNull()
    hintBtn?.click()
    await flush()

    expect(inkyStore.stamps).toHaveLength(1)
    expect(inkyStore.stamps[0].text).toBe('2x = 10')
    expect(inkyStore.stamps[0].worldX).toBe(100)
    expect(inkyStore.stamps[0].fontSize).toBe(46)
    expect(inkyStore.stamps[0].worldY).toBe(100)
    expect(inkyStore.stamps[0].color).toBe('#2563eb')
  })

  test('Hint stamps below enclosed stamp chars preserving their exact fontSize when source is stamp', async () => {
    inkyStore.strokes = []
    const stamp = {
      id: 'stamp-prev-hint',
      text: '2x^2 = 2',
      worldX: 100,
      worldY: 100,
      color: '#2563eb',
      fontSize: 24,
      chars: [
        { id: 'c0', char: '2', worldX: 100, worldY: 100, fontSize: 24, angle: 0 },
        { id: 'c1', char: 'x', worldX: 112, worldY: 100, fontSize: 24, angle: 0 },
        { id: 'c2', char: '^', worldX: 124, worldY: 100, fontSize: 24, angle: 0 },
        { id: 'c3', char: '2', worldX: 136, worldY: 100, fontSize: 24, angle: 0 },
        { id: 'c4', char: '=', worldX: 148, worldY: 100, fontSize: 24, angle: 0 },
        { id: 'c5', char: '2', worldX: 160, worldY: 100, fontSize: 24, angle: 0 },
      ],
    }
    inkyStore.stamps = [stamp]
    inkyStore.setMathCapsule({
      latex: '2x^2 = 2',
      worldPosition: { x: 130, y: 100 },
      enclosedStrokeIds: [],
      enclosedCharIds: stamp.chars.map((c) => c.id),
      source: 'stamp',
      mlPending: false,
    })
    await mountCapsule()

    const hintBtn = button('Hint')
    expect(hintBtn).not.toBeNull()
    hintBtn?.click()
    await flush()

    // A second stamp was added with the next atomic step x^2 = 1 preserving fontSize 24
    expect(inkyStore.stamps).toHaveLength(2)
    const nextStamp = inkyStore.stamps[1]
    expect(nextStamp.text).toBe('x^2 = 1')
    expect(nextStamp.color).toBe('#2563eb')
    expect(nextStamp.fontSize).toBe(24)
    expect(nextStamp.worldX).toBe(100)
    // maxY is 100 + 24 * 1.25 = 130; compact lineGap = max(6, round(24 * 0.22)) = 6 -> 136
    expect(nextStamp.worldY).toBe(136)
  })

  test('Graph button appears when expression is graphable and opens graphSidebar', async () => {
    setCapsule('y = x^2 - 4')
    await mountCapsule()

    const graphBtn = button('Graph')
    expect(graphBtn).not.toBeNull()
    expect(graphBtn?.getAttribute('aria-disabled')).toBe('false')

    graphBtn?.click()
    await flush()

    expect(inkyStore.graphSidebar.isOpen).toBe(true)
    expect(inkyStore.graphSidebar.equation).toBe('y = x^2 - 4')
    expect(inkyStore.mathCapsule).toBeNull()
  })

  test('Graph button does not appear for non-graphable formulas or equations', async () => {
    setCapsule('2x + 1 = 5')
    await mountCapsule()

    expect(button('Graph')).toBeNull()
  })
})
