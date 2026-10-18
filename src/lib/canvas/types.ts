import type { Point } from './coordinates'

export type BoundingBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type ShapeType = 'rectangle' | 'ellipse' | 'arrow' | 'line'

export type Stroke = {
  id: string
  points: Point[]
  pathData?: string
  color: string
  size: number
  boundingBox: BoundingBox
  x: number
  y: number
  angle: number
  // Shape-specific data
  shapeType?: ShapeType
  shapeData?: {
    startX: number
    startY: number
    endX: number
    endY: number
  }
}

export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'orange'

export const STICKY_COLORS: Record<StickyColor, { bg: string; border: string; text: string }> = {
  yellow: { bg: '#fef9c3', border: '#fde047', text: '#854d0e' },
  pink: { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' },
  blue: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  green: { bg: '#dcfce7', border: '#86efac', text: '#166534' },
  purple: { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' },
  orange: { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' },
}

export type Widget = {
  id: string
  x: number
  y: number
  width: number
  height: number
  type: 'text' | 'desmos' | 'image' | 'custom' | 'sticky'
  content?: string
  data?: any
  scale?: number
  angle?: number
  stickyColor?: StickyColor
}

export type Camera = {
  x: number
  y: number
  z: number // zoom level
}

export type ToolType =
  | 'draw'
  | 'pan'
  | 'select'
  | 'eraser'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'line'
