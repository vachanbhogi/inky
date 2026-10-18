import type { Camera, Point } from './coordinates'

export interface BoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function getBoundingBox(points: Point[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

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

  return { minX, minY, maxX, maxY }
}

export function getViewportBoundingBox(width: number, height: number, camera: Camera): BoundingBox {
  const minX = (0 - camera.x) / camera.z
  const minY = (0 - camera.y) / camera.z
  const maxX = (width - camera.x) / camera.z
  const maxY = (height - camera.y) / camera.z

  return { minX, minY, maxX, maxY }
}

export function checkBoundingBoxOverlap(boxA: BoundingBox, boxB: BoundingBox): boolean {
  return !(
    boxA.maxX < boxB.minX ||
    boxA.minX > boxB.maxX ||
    boxA.maxY < boxB.minY ||
    boxA.minY > boxB.maxY
  )
}
