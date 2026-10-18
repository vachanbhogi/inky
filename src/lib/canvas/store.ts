import type { HandleType } from './spatial-index'
import { getUnifiedBoundingBox } from './spatial-index'
import type { Marquee, Stroke, ToolType } from './types'

type Listener = () => void

export class InkyStore {
  strokes: Stroke[] = []
  currentStroke: Stroke | null = null
  camera = { x: 0, y: 0, z: 1 }
  activeTool: ToolType = 'draw'
  strokeColor = '#111111'
  strokeSize = 4

  // Selection & Transform state
  selectedStrokeIds: string[] = []
  marquee: Marquee | null = null
  activeHandle: HandleType | null = null
  transformInitialState: {
    strokes: { id: string; points: Stroke['points']; boundingBox: Stroke['boundingBox'] }[]
    selectionBox: { minX: number; minY: number; maxX: number; maxY: number }
  } | null = null

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
    this.selectedStrokeIds = []
    this.notify()
  }

  // Selection actions
  selectStroke(id: string, toggle = false) {
    if (toggle) {
      if (this.selectedStrokeIds.includes(id)) {
        this.selectedStrokeIds = this.selectedStrokeIds.filter((sId) => sId !== id)
      } else {
        this.selectedStrokeIds.push(id)
      }
    } else {
      this.selectedStrokeIds = [id]
    }
    this.notify()
  }

  selectStrokes(ids: string[]) {
    this.selectedStrokeIds = [...ids]
    this.notify()
  }

  clearSelection() {
    if (this.selectedStrokeIds.length === 0 && !this.marquee) return
    this.selectedStrokeIds = []
    this.marquee = null
    this.activeHandle = null
    this.notify()
  }

  setMarquee(marquee: Marquee | null) {
    this.marquee = marquee
    this.notify()
  }

  setActiveHandle(handle: HandleType | null) {
    this.activeHandle = handle
    this.notify()
  }

  getSelectionBoundingBox() {
    const selected = this.strokes.filter((s) => this.selectedStrokeIds.includes(s.id))
    if (selected.length === 0) return null
    return getUnifiedBoundingBox(selected.map((s) => s.boundingBox))
  }

  deleteSelected() {
    if (this.selectedStrokeIds.length === 0) return
    this.undoStack.push([...this.strokes])
    this.redoStack = []
    this.strokes = this.strokes.filter((s) => !this.selectedStrokeIds.includes(s.id))
    this.selectedStrokeIds = []
    this.notify()
  }
}

export const inkyStore = new InkyStore()
