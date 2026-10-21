import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inkyStore } from '../../lib/canvas/store'
import type { Stroke } from '../../lib/canvas/types'

const inkyBoardSrc = readFileSync(resolve(__dirname, 'InkyBoard.tsx'), 'utf-8')
const canvasLayerSrc = readFileSync(resolve(__dirname, 'CanvasLayer.tsx'), 'utf-8')

const stroke = (id: string): Stroke => ({
  id,
  points: [
    [0, 0],
    [10, 10],
  ],
  color: '#111111',
  size: 4,
  boundingBox: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
})

describe('store transient animation state', () => {
  it('holds and clears gestureDissolve', () => {
    const s = stroke('d1')
    inkyStore.setGestureDissolve({ stroke: s, anchor: { x: 5, y: 5 }, startedAt: 1 })
    expect(inkyStore.gestureDissolve?.stroke.id).toBe('d1')
    inkyStore.setGestureDissolve(null)
    expect(inkyStore.gestureDissolve).toBeNull()
  })

  it('holds and clears recognizedPulse', () => {
    inkyStore.setRecognizedPulse({ strokeIds: ['a', 'b'], startedAt: 2 })
    expect(inkyStore.recognizedPulse?.strokeIds).toEqual(['a', 'b'])
    inkyStore.setRecognizedPulse(null)
    expect(inkyStore.recognizedPulse).toBeNull()
  })

  it('clearTransientAnimations nulls both', () => {
    inkyStore.setGestureDissolve({ stroke: stroke('d2'), anchor: { x: 0, y: 0 }, startedAt: 0 })
    inkyStore.setRecognizedPulse({ strokeIds: ['x'], startedAt: 0 })
    inkyStore.clearTransientAnimations()
    expect(inkyStore.gestureDissolve).toBeNull()
    expect(inkyStore.recognizedPulse).toBeNull()
  })

  it('setters notify subscribers', () => {
    let calls = 0
    const unsub = inkyStore.subscribe(() => {
      calls++
    })
    inkyStore.setGestureDissolve(null)
    inkyStore.setRecognizedPulse(null)
    unsub()
    expect(calls).toBe(2)
  })
})

describe('InkyBoard gesture handoff wiring', () => {
  it('sets gestureDissolve only inside the enclosed-stroke branch', () => {
    // The dissolve call must appear after the `enclosedIds.length > 0` guard
    // and before the early `return` of that branch — never on a bare loop.
    const guardIdx = inkyBoardSrc.indexOf('if (enclosedIds.length > 0)')
    const dissolveIdx = inkyBoardSrc.indexOf('setGestureDissolve(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(dissolveIdx).toBeGreaterThan(guardIdx)
    expect(dissolveIdx - guardIdx).toBeLessThan(1600)
  })

  it('sets recognizedPulse with the enclosed stroke ids', () => {
    expect(inkyBoardSrc).toMatch(/setRecognizedPulse\(\{[^}]*enclosedIds/s)
  })
})

describe('CanvasLayer dissolve + pulse rendering', () => {
  it('renders the lasso dissolve via lassoDissolve()', () => {
    expect(canvasLayerSrc).toMatch(/import \{[^}]*lassoDissolve/)
    expect(canvasLayerSrc).toContain('lassoDissolve(')
  })

  it('renders the recognition pulse via recognizedPulseAlpha()', () => {
    expect(canvasLayerSrc).toMatch(/import \{[^}]*recognizedPulseAlpha/)
    expect(canvasLayerSrc).toContain('recognizedPulseAlpha(')
  })

  it('keeps the RAF loop alive while transient animations run', () => {
    expect(canvasLayerSrc).toMatch(/needsContinuousAnimation[\s\S]*gestureDissolve/)
    expect(canvasLayerSrc).toMatch(/needsContinuousAnimation[\s\S]*recognizedPulse/)
  })
})
