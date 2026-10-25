import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inkyStore, PAPER_STYLES, type PaperStyle } from '../../lib/canvas/store'
import { BackgroundLayer } from './BackgroundLayer'

const inkyBoardSrc = readFileSync(resolve(__dirname, 'InkyBoard.tsx'), 'utf-8')

let roots: Root[] = []
let containers: HTMLDivElement[] = []

function mountBackgroundLayer() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  containers.push(el)
  root.render(<BackgroundLayer />)
  return new Promise((r) => setTimeout(r, 0))
}

describe('InkyStore paperStyle property & cycling', () => {
  beforeEach(() => {
    inkyStore.setPaperStyle('blank')
    inkyStore.camera = { x: 0, y: 0, z: 1 }
  })

  it('defaults paperStyle to "blank"', () => {
    expect(inkyStore.paperStyle).toBe('blank')
  })

  it('supports all required paper styles: blank, dot-grid, graph, lined', () => {
    const required: PaperStyle[] = ['blank', 'dot-grid', 'graph', 'lined']
    expect(PAPER_STYLES).toEqual(required)
    for (const style of required) {
      inkyStore.setPaperStyle(style)
      expect(inkyStore.paperStyle).toBe(style)
    }
  })

  it('notifies subscribers only when paperStyle changes', () => {
    let callCount = 0
    const unsub = inkyStore.subscribe(() => {
      callCount++
    })

    inkyStore.setPaperStyle('dot-grid')
    expect(callCount).toBe(1)

    // No-op set should not trigger duplicate notifications
    inkyStore.setPaperStyle('dot-grid')
    expect(callCount).toBe(1)

    inkyStore.setPaperStyle('graph')
    expect(callCount).toBe(2)

    unsub()
  })

  it('cyclePaperStyle rotates through styles in order and wraps around', () => {
    inkyStore.setPaperStyle('blank')
    inkyStore.cyclePaperStyle()
    expect(inkyStore.paperStyle).toBe('dot-grid')

    inkyStore.cyclePaperStyle()
    expect(inkyStore.paperStyle).toBe('graph')

    inkyStore.cyclePaperStyle()
    expect(inkyStore.paperStyle).toBe('lined')

    inkyStore.cyclePaperStyle()
    expect(inkyStore.paperStyle).toBe('blank')
  })
})

describe('InkyBoard BackgroundLayer integration & "g" shortcut', () => {
  it('mounts BackgroundLayer underneath CanvasLayer in InkyBoard', () => {
    expect(inkyBoardSrc).toMatch(/import \{ BackgroundLayer \} from '\.\/BackgroundLayer'/)
    const bgIdx = inkyBoardSrc.indexOf('<BackgroundLayer')
    const canvasIdx = inkyBoardSrc.indexOf('<CanvasLayer')
    expect(bgIdx).toBeGreaterThan(-1)
    expect(canvasIdx).toBeGreaterThan(-1)
    expect(bgIdx).toBeLessThan(canvasIdx)
  })

  it('handles "g" shortcut to cycle paper style', () => {
    expect(inkyBoardSrc).toMatch(/case 'g':/)
    expect(inkyBoardSrc).toMatch(/cyclePaperStyle\(\)|setPaperStyle\(/)
  })
})

describe('BackgroundLayer component behavior', () => {
  beforeEach(() => {
    inkyStore.setPaperStyle('blank')
    inkyStore.camera = { x: 0, y: 0, z: 1 }
  })

  afterEach(() => {
    for (const root of roots) root.unmount()
    for (const c of containers) c.remove()
    roots = []
    containers = []
  })

  it('renders a canvas with data-testid="background-layer" and active paper style attribute', async () => {
    await mountBackgroundLayer()
    const canvas = document.querySelector('[data-testid="background-layer"]') as HTMLCanvasElement
    expect(canvas).not.toBeNull()
    expect(canvas.getAttribute('data-paper-style')).toBe('blank')
    expect(canvas.className).toContain('absolute inset-0')
  })

  it('updates data-paper-style attribute when store changes', async () => {
    await mountBackgroundLayer()
    const canvas = document.querySelector('[data-testid="background-layer"]') as HTMLCanvasElement
    expect(canvas.getAttribute('data-paper-style')).toBe('blank')

    inkyStore.setPaperStyle('graph')
    await new Promise((r) => setTimeout(r, 0))

    expect(canvas.getAttribute('data-paper-style')).toBe('graph')

    inkyStore.setPaperStyle('lined')
    await new Promise((r) => setTimeout(r, 0))

    expect(canvas.getAttribute('data-paper-style')).toBe('lined')
  })

  it('invokes canvas rendering methods across all paper styles when context is available', async () => {
    const mockCtx = {
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    }

    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => mockCtx) as unknown as typeof originalGetContext

    try {
      let fillCount = 0
      let strokeCount = 0
      mockCtx.fill = () => {
        fillCount++
      }
      mockCtx.stroke = () => {
        strokeCount++
      }

      // 1. blank: only base fillRect, no patterns
      inkyStore.setPaperStyle('blank')
      await mountBackgroundLayer()
      await new Promise((r) => setTimeout(r, 16))
      expect(fillCount).toBe(0)
      expect(strokeCount).toBe(0)

      // 2. dot-grid: calls fill for circular dots
      inkyStore.setPaperStyle('dot-grid')
      await new Promise((r) => setTimeout(r, 16))
      expect(fillCount).toBeGreaterThan(0)

      // 3. graph: calls stroke for minor & major grids
      strokeCount = 0
      inkyStore.setPaperStyle('graph')
      await new Promise((r) => setTimeout(r, 16))
      expect(strokeCount).toBeGreaterThan(0)

      // 4. lined: calls stroke for ruled lines & red margin
      strokeCount = 0
      inkyStore.setPaperStyle('lined')
      await new Promise((r) => setTimeout(r, 16))
      expect(strokeCount).toBeGreaterThan(0)
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })

  it('camera pan and zoom correctly shift rendered coordinates', async () => {
    const strokes: { x1: number; y1: number; x2: number; y2: number }[] = []
    let lastMove = { x: 0, y: 0 }

    const mockCtx = {
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: (x: number, y: number) => {
        lastMove = { x, y }
      },
      lineTo: (x: number, y: number) => {
        strokes.push({ x1: lastMove.x, y1: lastMove.y, x2: x, y2: y })
      },
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    }

    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => mockCtx) as unknown as typeof originalGetContext

    try {
      inkyStore.setPaperStyle('lined')
      inkyStore.setCamera({ x: 50, y: 100, z: 2 })
      await mountBackgroundLayer()
      await new Promise((r) => setTimeout(r, 16))

      // Margin at worldX=96 with z=2 and x=50 should land at Math.round(96*2 + 50) + 0.5 = 242.5
      const marginLine = strokes.find((s) => s.x1 === s.x2 && Math.abs(s.x1 - 242.5) < 1)
      expect(marginLine).toBeDefined()
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })
})
