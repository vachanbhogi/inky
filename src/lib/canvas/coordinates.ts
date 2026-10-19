export type Point = [number, number] | [number, number, number]

export interface Camera {
  x: number
  y: number
  z: number
}

export function toWorld(
  screenX: number,
  screenY: number,
  camera: Camera,
  pressure?: number,
): Point {
  const wx = (screenX - camera.x) / camera.z
  const wy = (screenY - camera.y) / camera.z
  return pressure !== undefined ? [wx, wy, pressure] : [wx, wy]
}

export function toScreen(worldX: number, worldY: number, camera: Camera): Point {
  return [worldX * camera.z + camera.x, worldY * camera.z + camera.y]
}
