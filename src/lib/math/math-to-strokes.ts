import type { Point } from '../canvas/coordinates'
import { getBoundingBox } from '../canvas/spatial-index'
import { generateStrokePath } from '../canvas/svg-utils'
import type { Stroke } from '../canvas/types'

// Pre-defined relative glyph stroke paths for handwritten characters: normalized in [0, 1]
const GLYPH_PATHS: Record<string, [number, number][][]> = {
  '=': [
    [
      [0.1, 0.4],
      [0.9, 0.4],
    ],
    [
      [0.1, 0.6],
      [0.9, 0.6],
    ],
  ],
  '+': [
    [
      [0.5, 0.2],
      [0.5, 0.8],
    ],
    [
      [0.2, 0.5],
      [0.8, 0.5],
    ],
  ],
  '-': [
    [
      [0.15, 0.5],
      [0.85, 0.5],
    ],
  ],
  x: [
    [
      [0.15, 0.25],
      [0.85, 0.75],
    ],
    [
      [0.85, 0.25],
      [0.15, 0.75],
    ],
  ],
  y: [
    [
      [0.15, 0.25],
      [0.5, 0.6],
      [0.85, 0.25],
    ],
    [
      [0.5, 0.6],
      [0.3, 0.95],
    ],
  ],
  '0': [
    [
      [0.5, 0.15],
      [0.8, 0.35],
      [0.8, 0.65],
      [0.5, 0.85],
      [0.2, 0.65],
      [0.2, 0.35],
      [0.5, 0.15],
    ],
  ],
  '1': [
    [
      [0.3, 0.3],
      [0.5, 0.15],
      [0.5, 0.85],
    ],
    [
      [0.3, 0.85],
      [0.7, 0.85],
    ],
  ],
  '2': [
    [
      [0.2, 0.3],
      [0.5, 0.15],
      [0.8, 0.3],
      [0.2, 0.85],
      [0.8, 0.85],
    ],
  ],
  '3': [
    [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.45, 0.5],
      [0.8, 0.65],
      [0.5, 0.85],
      [0.2, 0.8],
    ],
  ],
  '4': [
    [
      [0.7, 0.15],
      [0.2, 0.6],
      [0.85, 0.6],
    ],
    [
      [0.7, 0.15],
      [0.7, 0.85],
    ],
  ],
  '5': [
    [
      [0.75, 0.18],
      [0.25, 0.18],
      [0.22, 0.48],
      [0.75, 0.55],
      [0.7, 0.82],
      [0.25, 0.82],
    ],
  ],
  '6': [
    [
      [0.7, 0.2],
      [0.3, 0.5],
      [0.3, 0.75],
      [0.65, 0.85],
      [0.75, 0.65],
      [0.3, 0.55],
    ],
  ],
  '7': [
    [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.45, 0.85],
    ],
  ],
  '8': [
    [
      [0.5, 0.5],
      [0.3, 0.3],
      [0.5, 0.15],
      [0.7, 0.3],
      [0.3, 0.7],
      [0.5, 0.85],
      [0.7, 0.7],
      [0.5, 0.5],
    ],
  ],
  '9': [
    [
      [0.7, 0.5],
      [0.3, 0.4],
      [0.4, 0.15],
      [0.75, 0.25],
      [0.75, 0.8],
      [0.4, 0.85],
    ],
  ],
  '(': [
    [
      [0.7, 0.1],
      [0.3, 0.5],
      [0.7, 0.9],
    ],
  ],
  ')': [
    [
      [0.3, 0.1],
      [0.7, 0.5],
      [0.3, 0.9],
    ],
  ],
  ',': [
    [
      [0.5, 0.75],
      [0.5, 0.85],
      [0.4, 0.95],
    ],
  ],
  '.': [
    [
      [0.42, 0.78],
      [0.58, 0.85],
    ],
  ],
}

const EXPONENT_SCALE = 0.6
const EXPONENT_RISE = 0.38

/**
 * Glyphs in `text` that have no drawable path. Reported so callers can refuse
 * to stamp silently-lossy output instead of printing wrong math (final C1).
 */
export function unsupportedGlyphs(text: string): string[] {
  const missing = new Set<string>()
  for (const ch of text) {
    if (ch === ' ' || ch === '^') continue
    if (!(GLYPH_PATHS[ch] ?? GLYPH_PATHS[ch.toLowerCase()])) missing.add(ch)
  }
  return [...missing]
}

export type StampPlan = { kind: 'stamp'; strokes: Stroke[] } | { kind: 'show'; message: string }

/**
 * Decide between stamping handwritten strokes and surfacing the result as
 * text: never stamp a string the glyph table cannot draw (final review C1/I1).
 */
export function planStamp(
  text: string,
  startX: number,
  startY: number,
  charHeight = 36,
  color = '#111111',
  strokeWidth = 3.5,
): StampPlan {
  const trimmed = text.trim()
  if (!trimmed || unsupportedGlyphs(trimmed).length > 0) {
    return { kind: 'show', message: trimmed }
  }
  const strokes = synthesizeHandwrittenStrokes(
    trimmed,
    startX,
    startY,
    charHeight,
    color,
    strokeWidth,
  )
  if (strokes.length === 0) return { kind: 'show', message: trimmed }
  return { kind: 'stamp', strokes }
}

export function synthesizeHandwrittenStrokes(
  text: string,
  startX: number,
  startY: number,
  charHeight = 36,
  color = '#111111',
  strokeWidth = 3.5,
): Stroke[] {
  const result: Stroke[] = []
  const charWidth = charHeight * 0.6
  const spacing = charWidth * 0.35
  let curX = startX
  let superscript = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ' ') {
      curX += charWidth * 0.8
      continue
    }
    if (ch === '^') {
      // Exponent marker: the next glyph renders raised and smaller.
      superscript = true
      continue
    }

    const glyph = GLYPH_PATHS[ch] ?? GLYPH_PATHS[ch.toLowerCase()]
    if (!glyph) {
      curX += charWidth + spacing
      continue
    }

    const h = superscript ? charHeight * EXPONENT_SCALE : charHeight
    const w = superscript ? charWidth * EXPONENT_SCALE : charWidth
    const top = superscript ? startY - charHeight * EXPONENT_RISE : startY

    glyph.forEach((part, idx) => {
      // Scale points to world coordinates
      const points: Point[] = part.map(([px, py]) => [curX + px * w, top + py * h])
      const strokeId = `stamped-stroke-${Date.now()}-${i}-${idx}-${Math.random().toString(36).slice(2, 6)}`
      result.push({
        id: strokeId,
        points,
        color,
        size: strokeWidth,
        pathData: generateStrokePath(points, strokeWidth),
        boundingBox: getBoundingBox(points),
      })
    })

    curX += w + spacing
    superscript = false
  }

  return result
}
