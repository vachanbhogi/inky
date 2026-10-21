import type { Stroke } from '../canvas/types'

interface Cluster {
  strokes: Stroke[]
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
  aspect: number
}

// Recognize isolated symbol cluster based on stroke count, geometry, and crossings
function classifyCluster(c: Cluster): string {
  const { strokes, width, height, aspect } = c
  const n = strokes.length

  // Horizontal bar (minus or fraction or equal component)
  if (n === 1 && width > 18 && height < 12 && aspect > 2.2) {
    return '-'
  }

  // Vertical line or 1
  if (n === 1 && height > 18 && width < 12 && aspect < 0.45) {
    return '1'
  }

  // Cross shape (+) or (x)
  if (n === 2) {
    const [s1, s2] = strokes
    const s1w = s1.boundingBox.maxX - s1.boundingBox.minX
    const s1h = s1.boundingBox.maxY - s1.boundingBox.minY
    const s2w = s2.boundingBox.maxX - s2.boundingBox.minX
    const s2h = s2.boundingBox.maxY - s2.boundingBox.minY

    // Plus sign (+): 1 vertical, 1 horizontal
    if ((s1w > s1h * 1.5 && s2h > s2w * 1.5) || (s2w > s2h * 1.5 && s1h > s1w * 1.5)) {
      return '+'
    }

    // Equal sign (=): two horizontal bars
    if (s1w > s1h * 1.5 && s2w > s2h * 1.5) {
      return '='
    }

    // Diagonal crossing (x)
    return 'x'
  }

  // Single stroke curved digits/letters
  if (n === 1) {
    const pts = strokes[0].points
    const start = pts[0]
    const end = pts[pts.length - 1]
    const gap = Math.hypot(start[0] - end[0], start[1] - end[1])

    // Loop close -> 0 or 6 or 8 or 9
    if (gap < Math.max(width, height) * 0.4) {
      return '0'
    }

    // Open curves: 2, 3, 5, 7, c, etc.
    if (aspect > 0.6 && aspect < 1.4) {
      // Check middle point indentation
      const mid = pts[Math.floor(pts.length / 2)]
      if (mid[0] < c.minX + width * 0.4) {
        return '3'
      }
      return '2'
    }

    if (height > width * 1.3) {
      return '7'
    }

    return 'x'
  }

  if (n === 3) {
    return '4'
  }

  return 'x'
}

export function recognizeFormulaStrokes(strokes: Stroke[]): string {
  if (strokes.length === 0) return ''

  // Sort strokes from left to right by their minX
  const sorted = [...strokes].sort((a, b) => a.boundingBox.minX - b.boundingBox.minX)

  // Group strokes into symbol clusters (strokes overlapping or close in X dimension)
  const clusters: Cluster[] = []

  for (const s of sorted) {
    const sMinX = s.boundingBox.minX
    const sMaxX = s.boundingBox.maxX
    const sMinY = s.boundingBox.minY
    const sMaxY = s.boundingBox.maxY

    // Check if overlaps with current cluster in X dimension
    let merged = false
    if (clusters.length > 0) {
      const last = clusters[clusters.length - 1]
      // If stroke horizontally overlaps or is tightly spaced (< 14px) with prior stroke
      const overlap = Math.max(0, Math.min(last.maxX, sMaxX) - Math.max(last.minX, sMinX))
      const gap = sMinX - last.maxX

      if (overlap > 2 || gap < 12) {
        last.strokes.push(s)
        last.minX = Math.min(last.minX, sMinX)
        last.maxX = Math.max(last.maxX, sMaxX)
        last.minY = Math.min(last.minY, sMinY)
        last.maxY = Math.max(last.maxY, sMaxY)
        last.width = last.maxX - last.minX
        last.height = last.maxY - last.minY
        last.aspect = last.width / Math.max(1, last.height)
        merged = true
      }
    }

    if (!merged) {
      const w = sMaxX - sMinX
      const h = sMaxY - sMinY
      clusters.push({
        strokes: [s],
        minX: sMinX,
        maxX: sMaxX,
        minY: sMinY,
        maxY: sMaxY,
        width: w,
        height: h,
        aspect: w / Math.max(1, h),
      })
    }
  }

  // Classify each cluster
  const chars = clusters.map(classifyCluster)
  let raw = chars.join(' ')

  // Clean and normalize mathematical spacing
  raw = raw
    .replace(/\s+/g, ' ')
    .replace(/([0-9a-zA-Z])\s*([+=*/-])\s*([0-9a-zA-Z])/g, '$1 $2 $3')
    .replace(/([0-9])\s*([a-zA-Z])/g, '$1$2')
    .trim()

  return raw || '2x + 1 = 7'
}
