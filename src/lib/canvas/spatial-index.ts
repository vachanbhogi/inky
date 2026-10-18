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

export function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2
  if (l2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)))
}

export function isPointOnStroke(
  worldX: number,
  worldY: number,
  stroke: { points: Point[]; boundingBox: BoundingBox; size?: number },
  tolerance?: number,
): boolean {
  const threshold = tolerance ?? Math.max(10, (stroke.size || 4) * 1.5)
  const { minX, minY, maxX, maxY } = stroke.boundingBox

  // Quick padded AABB check
  if (
    worldX < minX - threshold ||
    worldX > maxX + threshold ||
    worldY < minY - threshold ||
    worldY > maxY + threshold
  ) {
    return false
  }

  // Check distance to all stroke segments
  const pts = stroke.points
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]
    const p2 = pts[i + 1]
    if (distToSegment(worldX, worldY, p1[0], p1[1], p2[0], p2[1]) <= threshold) {
      return true
    }
  }

  // Single-point stroke check
  if (pts.length === 1) {
    return Math.hypot(worldX - pts[0][0], worldY - pts[0][1]) <= threshold
  }

  return false
}

export function getUnifiedBoundingBox(boxes: BoundingBox[]): BoundingBox | null {
  if (boxes.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const box of boxes) {
    if (box.minX < minX) minX = box.minX
    if (box.minY < minY) minY = box.minY
    if (box.maxX > maxX) maxX = box.maxX
    if (box.maxY > maxY) maxY = box.maxY
  }

  return { minX, minY, maxX, maxY }
}

export type HandleType = 'nw' | 'ne' | 'sw' | 'se' | 'rotate'

export function detectHandle(
  worldX: number,
  worldY: number,
  selection: { box: BoundingBox; angle?: number },
  zoom = 1,
  isTouch = false,
): HandleType | null {
  const { box, angle = 0 } = selection
  const { minX, minY, maxX, maxY } = box
  const cx = minX + (maxX - minX) / 2
  const cy = minY + (maxY - minY) / 2

  // Unrotate point around center to test in axis-aligned space
  const cosA = Math.cos(-angle)
  const sinA = Math.sin(-angle)
  const ux = cx + (worldX - cx) * cosA - (worldY - cy) * sinA
  const uy = cy + (worldX - cx) * sinA + (worldY - cy) * cosA

  const pad = 4
  const bx = minX - pad
  const by = minY - pad
  const bw = maxX - minX + pad * 2
  const bh = maxY - minY + pad * 2

  const baseThreshold = isTouch ? 32 : 16
  const threshold = baseThreshold / zoom
  const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x1 - x2, y1 - y2)

  if (dist(ux, uy, bx, by) < threshold) return 'nw'
  if (dist(ux, uy, bx + bw, by) < threshold) return 'ne'
  if (dist(ux, uy, bx, by + bh) < threshold) return 'sw'
  if (dist(ux, uy, bx + bw, by + bh) < threshold) return 'se'

  const rotateStickLen = 24 / zoom
  if (dist(ux, uy, bx + bw / 2, by - rotateStickLen) < threshold) return 'rotate'

  return null
}
