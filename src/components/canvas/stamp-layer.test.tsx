import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inkyStore, stampCharsFor } from '../../lib/canvas/store'
import { StampLayer } from './StampLayer'

// Controllable rAF: the wipe drives itself from animation frames, so the test
// owns the clock and flushes ticks deterministically.
let rafQueue: FrameRequestCallback[] = []
const realRaf = globalThis.requestAnimationFrame
const realCaf = globalThis.cancelAnimationFrame

let roots: Root[] = []
let containers: HTMLDivElement[] = []

async function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  containers.push(el)
  root.render(<StampLayer />)
  // Wait until StampLayer's useEffect subscribes to inkyStore
  while (inkyStore.listeners.size === 0) {
    await new Promise((r) => setTimeout(r, 1))
  }
}

function setReducedMotion(matches: boolean) {
  globalThis.matchMedia = ((query: string) => ({
    matches: matches && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia
}

describe('StampLayer behavior', () => {
  beforeEach(() => {
    rafQueue = []
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafQueue.push(cb)
      return rafQueue.length
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
    setReducedMotion(false)
    inkyStore.stamps = []
    inkyStore.stampedReveal = null
    inkyStore.camera = { x: 0, y: 0, z: 1 }
  })

  afterEach(() => {
    for (const root of roots) root.unmount()
    for (const c of containers) c.remove()
    roots = []
    containers = []
    globalThis.requestAnimationFrame = realRaf
    globalThis.cancelAnimationFrame = realCaf
  })

  it('renders each stamp as Caveat text at its world→screen position, scaled by zoom', async () => {
    inkyStore.stamps = [
      {
        id: 's1',
        text: 'x = 3',
        worldX: 100,
        worldY: 50,
        color: '#123456',
        fontSize: 40,
        chars: stampCharsFor('x = 3', 100, 50, 40, 's1'),
      },
    ]
    inkyStore.camera = { x: 7, y: 9, z: 2 }
    await mount()

    const el = document.querySelector('[data-stamp-id="s1"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.textContent).toBe('x = 3')
    expect(el.style.fontFamily).toContain('Caveat')
    expect(el.style.color).toMatch(/123456|18,\s*52,\s*86/)
    expect(el.style.fontSize).toBe('80px') // 40 × zoom 2
    expect(el.style.left).toBe('207px') // 100×2 + camera.x7
    expect(el.style.top).toBe('109px') // 50×2 + camera.y9
  })

  it('renders every char as its own span offset from the anchor, rotated about its own center', async () => {
    const chars = stampCharsFor('x = 3', 100, 50, 40, 's1')
    chars[2].angle = Math.PI / 2 // the '=' glyph
    inkyStore.stamps = [
      { id: 's1', text: 'x = 3', worldX: 100, worldY: 50, color: '#123456', fontSize: 40, chars },
    ]
    inkyStore.camera = { x: 7, y: 9, z: 2 }
    await mount()

    const spans = document.querySelectorAll('[data-char-id]')
    expect(spans.length).toBe(5)
    const eq = document.querySelector('[data-char-id="s1-c2"]') as HTMLElement
    expect(eq).not.toBeNull()
    expect(eq.textContent).toBe('=')
    // Char 2 sits at worldX 100 + 2×(40×0.5) = 140 → 40 world units right of
    // the anchor → 80 screen px at zoom 2. fontSize per char: 40 × 2 = 80px.
    expect(eq.style.left).toBe('80px')
    expect(eq.style.top).toBe('0px')
    expect(eq.style.fontSize).toBe('80px')
    expect(eq.style.transform).toContain('rotate(90deg)')

    const x = document.querySelector('[data-char-id="s1-c0"]') as HTMLElement
    expect(x.style.left).toBe('0px')
    expect(x.style.transform).toBe('')
  })

  it('re-renders char positions live when the store mutates them', async () => {
    inkyStore.stamps = [
      {
        id: 's1',
        text: 'x = 3',
        worldX: 0,
        worldY: 0,
        color: '#111111',
        fontSize: 36,
        chars: stampCharsFor('x = 3', 0, 0, 36, 's1'),
      },
    ]
    await mount()
    const span = document.querySelector('[data-char-id="s1-c4"]') as HTMLElement
    expect(span.style.left).toBe('72px') // 4 × 36 × 0.5

    inkyStore.stamps[0].chars[4].worldX = 200
    inkyStore.stamps[0].chars[4].fontSize = 72
    inkyStore.notify()
    while (span.style.left !== '200px') {
      await new Promise((r) => setTimeout(r, 1))
    }
    expect(span.style.left).toBe('200px')
    expect(span.style.fontSize).toBe('72px')
  })

  it('wipes a fresh stamp in with a mask, then clears the reveal', async () => {
    inkyStore.stamps = [
      {
        id: 's1',
        text: 'x = 3',
        worldX: 0,
        worldY: 0,
        color: '#111111',
        fontSize: 36,
        chars: stampCharsFor('x = 3', 0, 0, 36, 's1'),
      },
    ]
    inkyStore.stampedReveal = { stampId: 's1', startedAt: performance.now() }
    await mount()

    const el = document.querySelector('[data-stamp-id="s1"]') as HTMLElement
    // The wipe schedules its first frame…
    expect(rafQueue.length).toBe(1)
    // …which masks the text at the start…
    const firstTick = rafQueue.shift() as FrameRequestCallback
    firstTick(performance.now())
    expect(el.style.maskImage).toContain('linear-gradient')
    // …and a tick past STAMP_WIPE_MS fully reveals, unmasks, and disarms.
    const nextTick = rafQueue.shift() as FrameRequestCallback
    nextTick(performance.now() + 500)
    expect(el.style.maskImage).toBe('none')
    expect(inkyStore.stampedReveal).toBeNull()
  })

  it('snaps to fully revealed under reduced motion (no wipe at all)', async () => {
    setReducedMotion(true)
    inkyStore.stamps = [
      {
        id: 's1',
        text: 'y',
        worldX: 0,
        worldY: 0,
        color: '#111111',
        fontSize: 20,
        chars: stampCharsFor('y', 0, 0, 20, 's1'),
      },
    ]
    inkyStore.stampedReveal = { stampId: 's1', startedAt: performance.now() }
    await mount()

    const el = document.querySelector('[data-stamp-id="s1"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.style.maskImage).not.toContain('gradient')
    expect(rafQueue.length).toBe(0)
    expect(inkyStore.stampedReveal).toBeNull()
  })

  it('re-renders when the store gains a stamp after mount', async () => {
    await mount()
    expect(document.querySelector('[data-stamp-id]')).toBeNull()

    inkyStore.stampResult({
      text: 'x = 3',
      worldX: 10,
      worldY: 10,
      color: '#111111',
      fontSize: 30,
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(document.querySelectorAll('[data-stamp-id]').length).toBe(1)
    expect(document.querySelector('[data-stamp-id]')?.textContent).toBe('x = 3')
  })
})
