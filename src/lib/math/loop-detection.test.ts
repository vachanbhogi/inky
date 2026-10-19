import { describe, expect, it } from 'vitest'
import { isClosedLoop } from './loop-detection'

describe('Closed Loop & Lasso Detection (V3)', () => {
  it('detects a completed synthetic circular loop', () => {
    const circlePoints: [number, number][] = []
    const r = 60
    for (let theta = 0; theta <= Math.PI * 2; theta += Math.PI / 10) {
      circlePoints.push([150 + r * Math.cos(theta), 150 + r * Math.sin(theta)])
    }
    const res = isClosedLoop(circlePoints)
    expect(res.isLoop).toBe(true)
    expect(res.polygon).toBeDefined()
    expect(res.polygon?.length).toBeGreaterThanOrEqual(10)
  })

  it('detects an unclosed circle with a realistic human gap (pen lifted 30px early)', () => {
    const gapCircle: [number, number][] = []
    const r = 60
    // Stop at 1.85 * PI leaving an unclosed ~35px gap
    for (let theta = 0; theta <= Math.PI * 1.85; theta += Math.PI / 10) {
      gapCircle.push([150 + r * Math.cos(theta), 150 + r * Math.sin(theta)])
    }
    const res = isClosedLoop(gapCircle)
    expect(res.isLoop).toBe(true)
    expect(res.polygon).toBeDefined()
  })

  it('detects a wide elongated oval or bean shape circling a formula', () => {
    const ovalPoints: [number, number][] = []
    for (let theta = 0; theta <= Math.PI * 2; theta += Math.PI / 10) {
      ovalPoints.push([200 + 140 * Math.cos(theta), 200 + 45 * Math.sin(theta)])
    }
    const res = isClosedLoop(ovalPoints)
    expect(res.isLoop).toBe(true)
    expect(res.polygon).toBeDefined()
  })

  it('rejects an open straight line or diagonal stroke', () => {
    const line: [number, number][] = [
      [10, 10],
      [30, 30],
      [60, 60],
      [100, 100],
      [150, 150],
      [200, 200],
    ]
    expect(isClosedLoop(line).isLoop).toBe(false)
  })

  it('rejects an open sinusoidal / wavy curve', () => {
    const wave: [number, number][] = []
    for (let x = 0; x <= 200; x += 10) {
      wave.push([x, 50 * Math.sin(x / 25)])
    }
    expect(isClosedLoop(wave).isLoop).toBe(false)
  })

  it('rejects tiny handwriting dots or minuscule loops under area threshold', () => {
    const tinyLoop: [number, number][] = [
      [5, 5],
      [7, 5],
      [7, 7],
      [5, 7],
      [5, 5],
    ]
    expect(isClosedLoop(tinyLoop).isLoop).toBe(false)
  })
})
