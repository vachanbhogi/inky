import type { BoundingBox } from './types'

/**
 * Check if two bounding boxes overlap
 */
export function checkBoundingBoxOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

/**
 * Calculate the bounding box of a set of points
 */
export function getBoundingBox(points: [number, number, number?][]): BoundingBox {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  // Add a little padding to the bounding box to account for stroke width
  const padding = 20
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  }
}

/**
 * Convert a screen viewport (width, height) + camera into a world-space bounding box
 */
export function getViewportBoundingBox(
  viewportWidth: number,
  viewportHeight: number,
  camera: { x: number; y: number; z: number },
): BoundingBox {
  return {
    minX: -camera.x / camera.z,
    minY: -camera.y / camera.z,
    maxX: (viewportWidth - camera.x) / camera.z,
    maxY: (viewportHeight - camera.y) / camera.z,
  }
}
