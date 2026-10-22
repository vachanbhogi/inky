import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { inkyStore } from '../../lib/canvas/store'
import { StampLayer } from './StampLayer'

// Controllable rAF: the wipe drives itself from animation frames, so the test
// owns the clock and flushes ticks deterministically.
let rafQueue: FrameRequestCallback[] = []
const realRaf = globalThis.requestAnimationFrame
const realCaf = globalThis.cancelAnimationFrame

let roots: Root[] = []
let containers: HTMLDivElement[] = []

function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  containers.push(el)
  root.render(<StampLayer />)
  // React effects flush on a macrotask.
  return new Promise((r) => setTimeout(r, 0))
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
      { id: 's1', text: 'x = 3', worldX: 100, worldY: 50, color: '#123456', fontSize: 40 },
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

  it('wipes a fresh stamp in with a mask, then clears the reveal', async () => {
    inkyStore.stamps = [
      { id: 's1', text: 'x = 3', worldX: 0, worldY: 0, color: '#111111', fontSize: 36 },
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
      { id: 's1', text: 'y', worldX: 0, worldY: 0, color: '#111111', fontSize: 20 },
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
