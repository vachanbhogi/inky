import type { Stroke } from '../canvas/types'

export function isPointInPolygon(point: [number, number], polygon: [number, number][]) {
  if (polygon.length < 3) return false
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]

    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }

  return inside
}

export function isStrokeEnclosed(stroke: Stroke, polygon: [number, number][], ratio = 0.7) {
  if (!stroke.points.length) return false
  let count = 0
  for (let i = 0; i < stroke.points.length; i++) {
    const pt = stroke.points[i]
    if (isPointInPolygon([pt[0], pt[1]], polygon)) {
      count++
    }
  }
  return count / stroke.points.length >= ratio
}

export function findEnclosedStrokes(polygon: [number, number][], strokes: Stroke[]) {
  return strokes.filter((s) => isStrokeEnclosed(s, polygon)).map((s) => s.id)
}
