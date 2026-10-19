// Stub for Commit 1 TDD scaffolding
import type { Stroke } from '../canvas/types'

export function isPointInPolygon(_point: [number, number], _polygon: [number, number][]): boolean {
  return false
}

export function isStrokeEnclosed(
  _stroke: Stroke,
  _polygon: [number, number][],
  _thresholdRatio = 0.7,
): boolean {
  return false
}

export function findEnclosedStrokes(_polygon: [number, number][], _strokes: Stroke[]): string[] {
  return []
}
