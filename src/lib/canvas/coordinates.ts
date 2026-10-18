export type Point = [number, number, number?] // x, y, pressure

export function toWorld(
  screenX: number,
  screenY: number,
  camera: { x: number; y: number; z: number },
): Point {
  return [(screenX - camera.x) / camera.z, (screenY - camera.y) / camera.z]
}

export function toScreen(
  worldX: number,
  worldY: number,
  camera: { x: number; y: number; z: number },
): Point {
  return [worldX * camera.z + camera.x, worldY * camera.z + camera.y]
}
