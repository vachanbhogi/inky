import { afterEach, describe, expect, it } from 'vitest'
import {
  easeOutQuint,
  lassoDissolve,
  prefersReducedMotion,
  recognizedPulseAlpha,
  stampWipe,
} from './motion'
import type { Stroke } from './types'

const realMatchMedia = globalThis.matchMedia

afterEach(() => {
  if (realMatchMedia) {
    globalThis.matchMedia = realMatchMedia
  } else {
    delete (globalThis as { matchMedia?: unknown }).matchMedia
  }
})

function stubReducedMotion(matches: boolean) {
  globalThis.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') && matches,
    media: query,
  })) as unknown as typeof matchMedia
}

const anchor = { x: 150, y: 100 }
const stroke = { points: [[140, 90]] } as Stroke

describe('prefersReducedMotion', () => {
  it('returns true when the OS/user requests reduced motion', () => {
    stubReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('returns false when full motion is allowed', () => {
    stubReducedMotion(false)
    expect(prefersReducedMotion()).toBe(false)
  })

  it('returns false when matchMedia is unavailable (e.g. tests, SSR)', () => {
    delete (globalThis as { matchMedia?: unknown }).matchMedia
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('easeOutQuint', () => {
  it('is 0 at t=0 and 1 at t=1', () => {
    expect(easeOutQuint(0)).toBe(0)
    expect(easeOutQuint(1)).toBe(1)
  })

  it('is ahead of linear progress in the middle (decisive ease-out)', () => {
    expect(easeOutQuint(0.5)).toBeGreaterThan(0.5)
  })
})

describe('lassoDissolve', () => {
  it('starts fully visible at t=0', () => {
    stubReducedMotion(false)
    expect(lassoDissolve(0, anchor, stroke)).toEqual({ opacity: 1, scale: 1, done: false })
  })

  it('is complete at exactly 280ms', () => {
    stubReducedMotion(false)
    expect(lassoDissolve(280, anchor, stroke)).toEqual({ opacity: 0, scale: 0.92, done: true })
  })

  it('stays complete past 280ms', () => {
    stubReducedMotion(false)
    const r = lassoDissolve(1000, anchor, stroke)
    expect(r.done).toBe(true)
    expect(r.opacity).toBe(0)
  })

  it('is partially faded at the midpoint', () => {
    stubReducedMotion(false)
    const r = lassoDissolve(140, anchor, stroke)
    expect(r.done).toBe(false)
    expect(r.opacity).toBeGreaterThan(0)
    expect(r.opacity).toBeLessThan(1)
  })

  it('snaps to the end state under reduced motion', () => {
    stubReducedMotion(true)
    expect(lassoDissolve(0, anchor, stroke)).toEqual({ opacity: 0, scale: 0.92, done: true })
  })
})

describe('recognizedPulseAlpha', () => {
  it('starts at full pulse strength', () => {
    stubReducedMotion(false)
    expect(recognizedPulseAlpha(0)).toEqual({ alpha: 0.16, done: false })
  })

  it('is complete at 420ms', () => {
    stubReducedMotion(false)
    const r = recognizedPulseAlpha(420)
    expect(r.done).toBe(true)
    expect(r.alpha).toBe(0)
  })

  it('decays between start and end', () => {
    stubReducedMotion(false)
    const r = recognizedPulseAlpha(210)
    expect(r.done).toBe(false)
    expect(r.alpha).toBeGreaterThan(0)
    expect(r.alpha).toBeLessThan(0.16)
  })

  it('snaps to done under reduced motion', () => {
    stubReducedMotion(true)
    expect(recognizedPulseAlpha(0)).toEqual({ alpha: 0, done: true })
  })
})

describe('stampWipe', () => {
  const textWidth = 100

  it('starts hidden at the left edge', () => {
    stubReducedMotion(false)
    expect(stampWipe(0, textWidth)).toEqual({ revealX: 0, done: false })
  })

  it('ends 16px past the text right edge at 420ms', () => {
    stubReducedMotion(false)
    expect(stampWipe(420, textWidth)).toEqual({ revealX: 116, done: true })
  })

  it('stays complete past 420ms', () => {
    stubReducedMotion(false)
    expect(stampWipe(9999, textWidth).done).toBe(true)
  })

  it('is strictly inside the text at the midpoint', () => {
    stubReducedMotion(false)
    const r = stampWipe(210, textWidth)
    expect(r.done).toBe(false)
    expect(r.revealX).toBeGreaterThan(0)
    expect(r.revealX).toBeLessThan(116)
  })

  it('snaps to the fully revealed state under reduced motion', () => {
    stubReducedMotion(true)
    expect(stampWipe(0, textWidth)).toEqual({ revealX: 116, done: true })
  })
})
