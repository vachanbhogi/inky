export type Point = [number, number]

export interface Camera {
  x: number
  y: number
  z: number
}

export function toWorld(screenX: number, screenY: number, camera: Camera): Point {
  return [
    (screenX - camera.x) / camera.z,
    (screenY - camera.y) / camera.z,
  ]
}

export function toScreen(worldX: number, worldY: number, camera: Camera): Point {
  return [
    worldX * camera.z + camera.x,
    worldY * camera.z + camera.y,
  ]
}
