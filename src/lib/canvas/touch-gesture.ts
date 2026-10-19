import type { Camera } from './coordinates'

export interface TouchPoint {
  id: number
  x: number
  y: number
}

export interface TouchGestureResult {
  camera: Camera
}

export function computeTouchGesture(
  prevTouches: TouchPoint[],
  nextTouches: TouchPoint[],
  currentCamera: Camera,
): TouchGestureResult | null {
  if (prevTouches.length < 2 || nextTouches.length < 2) {
    return null
  }

  const p0 = prevTouches[0]
  const p1 = prevTouches[1]
  const n0 = nextTouches.find((t) => t.id === p0.id) ?? nextTouches[0]
  const n1 = nextTouches.find((t) => t.id === p1.id) ?? nextTouches[1]

  const prevDist = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const nextDist = Math.hypot(n1.x - n0.x, n1.y - n0.y)

  if (prevDist === 0) return null

  const prevCenter = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
  const nextCenter = { x: (n0.x + n1.x) / 2, y: (n0.y + n1.y) / 2 }

  const scale = nextDist / prevDist
  const newZ = Math.min(Math.max(currentCamera.z * scale, 0.1), 5)

  // World coordinates of the pinch center prior to scaling
  const worldCenterX = (prevCenter.x - currentCamera.x) / currentCamera.z
  const worldCenterY = (prevCenter.y - currentCamera.y) / currentCamera.z

  // New camera offset keeping the pinch center under the fingers plus translation delta
  const newX = nextCenter.x - worldCenterX * newZ
  const newY = nextCenter.y - worldCenterY * newZ

  return {
    camera: {
      x: newX,
      y: newY,
      z: newZ,
    },
  }
}
