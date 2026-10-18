import type { Stroke, ToolType } from './types'

type Listener = () => void

export class InkyStore {
  strokes: Stroke[] = []
  currentStroke: Stroke | null = null
  camera = { x: 0, y: 0, z: 1 }
  activeTool: ToolType = 'draw'
  strokeColor = '#111111'
  strokeSize = 4

  private undoStack: Stroke[][] = []
  private redoStack: Stroke[][] = []
  private listeners: Set<Listener> = new Set()

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify() {
    for (const listener of this.listeners) {
      listener()
    }
  }

  setCamera(partial: Partial<{ x: number; y: number; z: number }>) {
    if (partial.x !== undefined) this.camera.x = partial.x
    if (partial.y !== undefined) this.camera.y = partial.y
    if (partial.z !== undefined) {
      this.camera.z = Math.min(Math.max(partial.z, 0.1), 5)
    }
    this.notify()
  }

  setActiveTool(tool: ToolType) {
    this.activeTool = tool
    this.notify()
  }

  setStrokeColor(color: string) {
    this.strokeColor = color
    this.notify()
  }

  setStrokeSize(size: number) {
    this.strokeSize = size
    this.notify()
  }

  setCurrentStroke(stroke: Stroke | null) {
    this.currentStroke = stroke
    this.notify()
  }

  addStroke(stroke: Stroke) {
    this.undoStack.push([...this.strokes])
    this.redoStack = []
    this.strokes.push(stroke)
    this.notify()
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undo() {
    if (!this.canUndo) return
    const prev = this.undoStack.pop()
    if (prev !== undefined) {
      this.redoStack.push([...this.strokes])
      this.strokes = prev
      this.notify()
    }
  }

  redo() {
    if (!this.canRedo) return
    const next = this.redoStack.pop()
    if (next !== undefined) {
      this.undoStack.push([...this.strokes])
      this.strokes = next
      this.notify()
    }
  }

  clear() {
    if (this.strokes.length === 0) return
    this.undoStack.push([...this.strokes])
    this.redoStack = []
    this.strokes = []
    this.notify()
  }
}

export const inkyStore = new InkyStore()
