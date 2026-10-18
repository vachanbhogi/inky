import type { Point } from './coordinates'
import type { BoundingBox } from './spatial-index'

export type ToolType = 'draw' | 'pan' | 'eraser' | 'select'

export interface Stroke {
  id: string
  points: Point[]
  color: string
  size: number
  pathData?: string
  boundingBox: BoundingBox
}

export interface CanvasState {
  strokes: Stroke[]
  currentStroke: Stroke | null
  camera: {
    x: number
    y: number
    z: number
  }
  activeTool: ToolType
  strokeColor: string
  strokeSize: number
}
