import type { Stroke } from './types'

// Shared motion math for canvas animations. DOM animations are covered by the
// global prefers-reduced-motion override in index.css; canvas rendering is JS,
// so every function here checks prefersReducedMotion() itself and snaps to the
// end state when motion is reduced.

export const LASSO_DISSOLVE_MS = 280
export const RECOGNIZED_PULSE_MS = 420
export const STAMP_WIPE_MS = 420
export const STAMP_WIPE_EDGE_PX = 16

export function prefersReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== 'function') return false
  return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function easeOutQuint(t: number): number {
  const x = Math.min(Math.max(t, 0), 1)
  return 1 - (1 - x) ** 5
}

export interface DissolveResult {
  opacity: number
  scale: number
  done: boolean
}

/** Lasso fade: opacity 1→0 and uniform scale 1→0.92 about the capsule anchor. */
export function lassoDissolve(
  elapsedMs: number,
  _anchor: { x: number; y: number },
  _stroke: Stroke,
): DissolveResult {
  if (prefersReducedMotion() || elapsedMs >= LASSO_DISSOLVE_MS) {
    return { opacity: 0, scale: 0.92, done: true }
  }
  const p = easeOutQuint(elapsedMs / LASSO_DISSOLVE_MS)
  return { opacity: 1 - p, scale: 1 - 0.08 * p, done: false }
}

/** Recognition pulse: translucent highlight that decays 0.16→0. */
export function recognizedPulseAlpha(elapsedMs: number): { alpha: number; done: boolean } {
  if (prefersReducedMotion() || elapsedMs >= RECOGNIZED_PULSE_MS) {
    return { alpha: 0, done: true }
  }
  const p = easeOutQuint(elapsedMs / RECOGNIZED_PULSE_MS)
  return { alpha: 0.16 * (1 - p), done: false }
}

export interface WipeResult {
  /** Leading edge of the revealed region, in px from the text's left edge. */
  revealX: number
  done: boolean
}

/** Stamp reveal wipe: a feathered mask edge sweeps left→right across the
 * stamped text (screen px; the DOM text layer scales with the camera), fully
 * past the trailing edge at STAMP_WIPE_MS so the answer appears written. */
export function stampWipe(elapsedMs: number, textWidth: number): WipeResult {
  const to = textWidth + STAMP_WIPE_EDGE_PX
  if (prefersReducedMotion() || elapsedMs >= STAMP_WIPE_MS) {
    return { revealX: to, done: true }
  }
  const p = easeOutQuint(elapsedMs / STAMP_WIPE_MS)
  return { revealX: p * to, done: false }
}
