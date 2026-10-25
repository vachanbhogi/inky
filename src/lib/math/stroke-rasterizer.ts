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

/** Light cleanup for model output: KaTeX understands the raw token stream
 * (including \left, \dfrac), so we only strip math delimiters and collapse
 * whitespace. The aggressive t→1 heuristics above are for rule-based
 * misreads and would corrupt genuine model tokens. */
export function cleanModelLatex(raw: string): string {
  return raw.replace(/\$\$?/g, '').replace(/\s+/g, ' ').trim()
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

/** Stamp a disc of radius 2 exactly like training/rasterizer.py
 * (dx*dx + dy*dy <= r*r + 1 with r = 2) into the normalized buffer. */
function stampDisc(out: Float32Array, size: number, cx: number, cy: number, fg: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy <= 5) {
        const px = cx + dx
        const py = cy + dy
        if (px >= 0 && px < size && py >= 0 && py < size) out[py * size + px] = fg
      }
    }
  }
}

/** Rasterize strokes to a single-channel normalized tensor, matching
 * training/rasterizer.py pixel-for-pixel: usable area = size - 48,
 * segments interpolated at 1.5 samples/px, radius-2 disc stamping,
 * centered placement. */
export function rasterizeStrokesToTensor(
  strokes: Stroke[],
  size = RASTER_SIZE,
  deskew = false,
): Float32Array {
  const bg = (1 - UNIMERNET_MEAN) / UNIMERNET_STD
  const fg = (0 - UNIMERNET_MEAN) / UNIMERNET_STD
  const out = new Float32Array(size * size).fill(bg)
  const inp = deskew ? deskewStrokes(strokes) : strokes
  const all = inp.flatMap((s) => s.points)
  if (!all.length) return out

  const box = getBoundingBox(all)
  const w = Math.max(1, box.maxX - box.minX)
  const h = Math.max(1, box.maxY - box.minY)
  const scale = Math.min((size - 48) / w, (size - 48) / h)
  const ox = (size - w * scale) / 2 - box.minX * scale
  const oy = (size - h * scale) / 2 - box.minY * scale

  for (const s of inp) {
    const pts = s.points
    for (let i = 1; i < pts.length; i++) {
      const x1 = pts[i - 1][0] * scale + ox
      const y1 = pts[i - 1][1] * scale + oy
      const x2 = pts[i][0] * scale + ox
      const y2 = pts[i][1] * scale + oy
      const steps = Math.max(1, Math.floor(Math.hypot(x2 - x1, y2 - y1) * 1.5))
      for (let st = 0; st <= steps; st++) {
        const cx = Math.round(x1 + ((x2 - x1) * st) / steps)
        const cy = Math.round(y1 + ((y2 - y1) * st) / steps)
        stampDisc(out, size, cx, cy, fg)
      }
    }
  }
  return out
}

/** Model input: single-channel raster tiled across RGB — the encoder
 * expects (1, 3, 384, 384). */
export function rasterizeToModelInput(strokes: Stroke[]): Float32Array {
  const one = rasterizeStrokesToTensor(strokes)
  const out = new Float32Array(one.length * 3)
  out.set(one, 0)
  out.set(one, one.length)
  out.set(one, one.length * 2)
  return out
}
