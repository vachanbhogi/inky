import type { Point } from '../canvas/coordinates'
import { getBoundingBox } from '../canvas/spatial-index'
import type { Stroke } from '../canvas/types'

export const RASTER_SIZE = 384
export const UNIMERNET_MEAN = 0.7931
export const UNIMERNET_STD = 0.1738

const FIXES: [RegExp, string][] = [
  [/\\(?:because|therefore|displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/g, ''],
  [/\\[dt]frac/g, '\\frac'],
  [/\\(?:mathrm|mathit|mathbf|mathsf|mathtt|mathcal|operatorname|text)\{([^{}]*)\}/g, '$1'],
  [/\\(?:underline|overline|widehat|widetilde|hat|tilde|vec|bar|dot)\{([^{}]*)\}/g, '$1'],
  [/\\(?:underbrace|overbrace)\\{([^{}]*)\\}(?:_\{[^{}]*\}|\^\{[^{}]*\})?/g, '$1'],
  [/\\(?:left|right)\s*([()[\]|.])?/g, '$1'],
  [/\\(?:quad|qquad|,|;|:|!|\\)|&/g, ' '],
  [/\\begin\{[^}]+\}([\\s\\S]*?)\\end\{[^}]+\}/g, '$1'],
  [/\b3\s*[xX×]\s*(?:\+\s*\b)?[tTlI1]\b/g, '3x+1'],
]

export function cleanLatexOutput(raw: string): string {
  let s = raw.replace(/\$\$/g, '').replace(/\$/g, '').trim()
  for (const [pat, rep] of FIXES) s = s.replace(pat, rep)
  return s
    .replace(/([0-9a-zA-Z])\s*\+\s*[tTlI|]\b/g, '$1+1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function deskewStrokes(strokes: Stroke[]): Stroke[] {
  if (strokes.length === 0) return strokes
  let dxSum = 0
  let dySum = 0
  let count = 0
  for (const s of strokes) {
    for (let i = 1; i < s.points.length; i++) {
      const dx = s.points[i][0] - s.points[i - 1][0]
      const dy = s.points[i][1] - s.points[i - 1][1]
      if (Math.abs(dy) > Math.abs(dx) * 1.2 && Math.hypot(dx, dy) > 2) {
        dxSum += dy > 0 ? dx : -dx
        dySum += Math.abs(dy)
        count++
      }
    }
  }
  const sh = count < 5 || dySum < 10 ? 0 : Math.max(-0.35, Math.min(0.35, (dxSum / dySum) * 0.6))
  if (Math.abs(sh) < 0.05) return strokes
  const cy =
    strokes.reduce((a, s) => a + (s.boundingBox.minY + s.boundingBox.maxY) / 2, 0) / strokes.length
  return strokes.map((s) => {
    const points: Point[] = s.points.map(([x, y]) => [x - (y - cy) * sh, y])
    return { ...s, points, boundingBox: getBoundingBox(points) }
  })
}

export const hasFractionBar = (strokes: Stroke[], minX: number, maxX: number): boolean =>
  maxX - minX > 10 &&
  strokes.length >= 3 &&
  strokes.some((s) => s.boundingBox.maxX - s.boundingBox.minX > (maxX - minX) * 0.4)

export const computeScale = (w: number, h: number, size = RASTER_SIZE, frac = false): number =>
  Math.min(
    (size - Math.round(size * (frac ? 0.14 : 0.18)) * 2) / Math.max(w, 1),
    (size - Math.round(size * (frac ? 0.14 : 0.18)) * 2) / Math.max(h, 1),
  )

export function rasterizeStrokesToTensor(
  strokes: Stroke[],
  size = RASTER_SIZE,
  deskew = false,
): Float32Array {
  const out = new Float32Array(size * size).fill((1 - UNIMERNET_MEAN) / UNIMERNET_STD)
  const inp = deskew ? deskewStrokes(strokes) : strokes
  const all = inp.flatMap((s) => s.points)
  if (!all.length) return out
  const box = getBoundingBox(all)
  const sc = computeScale(box.maxX - box.minX, box.maxY - box.minY, size)
  const ox = (size - (box.maxX - box.minX) * sc) / 2 - box.minX * sc
  const oy = (size - (box.maxY - box.minY) * sc) / 2 - box.minY * sc
  all.forEach(([x, y]) => {
    const px = Math.round(x * sc + ox)
    const py = Math.round(y * sc + oy)
    if (px >= 0 && px < size && py >= 0 && py < size)
      out[py * size + px] = -UNIMERNET_MEAN / UNIMERNET_STD
  })
  return out
}
