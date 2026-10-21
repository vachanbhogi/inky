import type { HandleType } from './spatial-index'
import { getUnifiedBoundingBox } from './spatial-index'
import { generateStrokePath } from './svg-utils'
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
  hoveredStrokeId: string | null = null
  marquee: Marquee | null = null
  activeHandle: HandleType | null = null
  eraserPoint: { x: number; y: number; radius: number } | null = null
  showShortcuts = false
  // Transient gesture-handoff animations (circle → capsule). Cleared by
  // CanvasLayer when their progress reports done.
  gestureDissolve: { stroke: Stroke; anchor: { x: number; y: number }; startedAt: number } | null =
    null
  recognizedPulse: { strokeIds: string[]; startedAt: number } | null = null
  // Recently stamped answer strokes, revealed by the handwriting wipe.
  stampedReveal: { strokeIds: string[]; startedAt: number } | null = null
  mathCapsule: {
    latex: string
    worldPosition: { x: number; y: number }
    enclosedStrokeIds: string[]
    source: 'rule' | 'ml'
    /** True while ML inference is still upgrading the instant rule latex. */
    mlPending?: boolean
  } | null = null
  transformInitialState: {
    strokes: {
      id: string
      points: Stroke['points']
      boundingBox: Stroke['boundingBox']
      pathData?: string
      angle?: number
    }[]
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

  setShowShortcuts(show: boolean) {
    if (this.showShortcuts !== show) {
      this.showShortcuts = show
      this.notify()
    }
  }

  setGestureDissolve(value: InkyStore['gestureDissolve']) {
    this.gestureDissolve = value
    this.notify()
  }

  setRecognizedPulse(value: InkyStore['recognizedPulse']) {
    this.recognizedPulse = value
    this.notify()
  }

  setStampedReveal(value: InkyStore['stampedReveal']) {
    this.stampedReveal = value
    this.notify()
  }

  clearTransientAnimations() {
    this.gestureDissolve = null
    this.recognizedPulse = null
    this.stampedReveal = null
    this.notify()
  }

  setMathCapsule(
    capsule: {
      latex: string
      worldPosition: { x: number; y: number }
      enclosedStrokeIds: string[]
      source: 'rule' | 'ml'
      mlPending?: boolean
    } | null,
  ) {
    this.mathCapsule = capsule
    this.notify()
  }

  setCamera(partial: Partial<{ x: number; y: number; z: number }>) {
    if (partial.x !== undefined) this.camera.x = partial.x
    if (partial.y !== undefined) this.camera.y = partial.y
    if (partial.z !== undefined) {
      this.camera.z = Math.min(Math.max(partial.z, 0.1), 5)
    }
    this.notify()
  }

  zoomAt(newZoom: number, screenCenterX?: number, screenCenterY?: number) {
    const clampedZ = Math.min(Math.max(newZoom, 0.1), 5)
    if (clampedZ === this.camera.z) return

    // If screen center not provided, default to window viewport center
    const cx = screenCenterX ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0)
    const cy = screenCenterY ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0)

    // Current world point under the focal center
    const worldX = (cx - this.camera.x) / this.camera.z
    const worldY = (cy - this.camera.y) / this.camera.z

    this.camera.x = cx - worldX * clampedZ
    this.camera.y = cy - worldY * clampedZ
    this.camera.z = clampedZ
    this.notify()
  }

  setActiveTool(tool: ToolType) {
    this.activeTool = tool
    this.hoveredStrokeId = null
    this.eraserPoint = null
    this.notify()
  }

  setHoveredStrokeId(id: string | null) {
    if (this.hoveredStrokeId !== id) {
      this.hoveredStrokeId = id
      this.notify()
    }
  }

  setEraserPoint(point: { x: number; y: number; radius: number } | null) {
    this.eraserPoint = point
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

  /** Add a batch of strokes (e.g. a stamped answer) as ONE undo step,
   * select them, arm the handwriting wipe, and dismiss the capsule. */
  stampResult(strokes: Stroke[]) {
    if (strokes.length === 0) return
    this.undoStack.push([...this.strokes])
    this.redoStack = []
    this.strokes.push(...strokes)
    this.selectedStrokeIds = strokes.map((s) => s.id)
    this.stampedReveal = { strokeIds: strokes.map((s) => s.id), startedAt: performance.now() }
    this.mathCapsule = null
    this.notify()
  }

  /** Test-only: expose undo stack depth so tests can assert batch semantics. */
  undoDepthForTest(): number {
    return this.undoStack.length
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
      // Drop selection entries for strokes this undo removed.
      const existing = new Set(prev.map((s) => s.id))
      this.selectedStrokeIds = this.selectedStrokeIds.filter((id) => existing.has(id))
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

  selectAll() {
    if (this.strokes.length === 0) return
    this.selectedStrokeIds = this.strokes.map((s) => s.id)
    this.activeTool = 'select'
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

  deleteStroke(id: string) {
    const exists = this.strokes.some((s) => s.id === id)
    if (!exists) return
    this.undoStack.push([...this.strokes])
    this.redoStack = []
    this.strokes = this.strokes.filter((s) => s.id !== id)
    this.selectedStrokeIds = this.selectedStrokeIds.filter((sId) => sId !== id)
    if (this.hoveredStrokeId === id) this.hoveredStrokeId = null
    this.notify()
  }

  deleteSelected() {
    if (this.selectedStrokeIds.length === 0) return
    this.undoStack.push([...this.strokes])
    this.redoStack = []
    this.strokes = this.strokes.filter((s) => !this.selectedStrokeIds.includes(s.id))
    this.selectedStrokeIds = []
    this.notify()
  }

  scaleSelected(handle: HandleType, currentWorldX: number, currentWorldY: number) {
    if (this.selectedStrokeIds.length === 0 || !this.transformInitialState) return

    const { selectionBox } = this.transformInitialState
    const { minX, minY, maxX, maxY } = selectionBox
    const originalWidth = maxX - minX
    const originalHeight = maxY - minY
    if (originalWidth <= 0 || originalHeight <= 0) return

    let anchorX = minX
    let anchorY = minY

    if (handle === 'nw') {
      anchorX = maxX
      anchorY = maxY
    } else if (handle === 'ne') {
      anchorX = minX
      anchorY = maxY
    } else if (handle === 'sw') {
      anchorX = maxX
      anchorY = minY
    } else if (handle === 'se') {
      anchorX = minX
      anchorY = minY
    }

    const scaleX =
      handle === 'nw' || handle === 'sw'
        ? (anchorX - currentWorldX) / originalWidth
        : (currentWorldX - anchorX) / originalWidth

    const scaleY =
      handle === 'nw' || handle === 'ne'
        ? (anchorY - currentWorldY) / originalHeight
        : (currentWorldY - anchorY) / originalHeight

    // Minimum scale safeguard to prevent inversion
    const safeScaleX = Math.max(0.05, Math.abs(scaleX)) * (scaleX < 0 ? -1 : 1)
    const safeScaleY = Math.max(0.05, Math.abs(scaleY)) * (scaleY < 0 ? -1 : 1)

    for (const initStroke of this.transformInitialState.strokes) {
      const stroke = this.strokes.find((s) => s.id === initStroke.id)
      if (!stroke) continue

      stroke.points = initStroke.points.map(([px, py]) => [
        anchorX + (px - anchorX) * safeScaleX,
        anchorY + (py - anchorY) * safeScaleY,
      ])
      stroke.pathData = generateStrokePath(stroke.points, stroke.size)
      let minPtX = Number.POSITIVE_INFINITY
      let minPtY = Number.POSITIVE_INFINITY
      let maxPtX = Number.NEGATIVE_INFINITY
      let maxPtY = Number.NEGATIVE_INFINITY
      for (const [px, py] of stroke.points) {
        if (px < minPtX) minPtX = px
        if (py < minPtY) minPtY = py
        if (px > maxPtX) maxPtX = px
        if (py > maxPtY) maxPtY = py
      }
      stroke.boundingBox = { minX: minPtX, minY: minPtY, maxX: maxPtX, maxY: maxPtY }
    }
    this.notify()
  }

  translateSelected(dx: number, dy: number) {
    if (this.selectedStrokeIds.length === 0 || !this.transformInitialState) return

    for (const initStroke of this.transformInitialState.strokes) {
      const stroke = this.strokes.find((s) => s.id === initStroke.id)
      if (!stroke) continue

      stroke.points = initStroke.points.map(([px, py]) => [px + dx, py + dy])
      stroke.pathData = generateStrokePath(stroke.points, stroke.size)
      stroke.boundingBox = {
        minX: initStroke.boundingBox.minX + dx,
        minY: initStroke.boundingBox.minY + dy,
        maxX: initStroke.boundingBox.maxX + dx,
        maxY: initStroke.boundingBox.maxY + dy,
      }
    }
    this.notify()
  }

  rotateSelected(currentWorldX: number, currentWorldY: number) {
    if (this.selectedStrokeIds.length === 0 || !this.transformInitialState) return

    const { selectionBox } = this.transformInitialState
    const cx = selectionBox.minX + (selectionBox.maxX - selectionBox.minX) / 2
    const cy = selectionBox.minY + (selectionBox.maxY - selectionBox.minY) / 2

    // Angle of current pointer relative to box center
    // Rotation handle is straight up (negative Y), so angle 0 corresponds to (-pi/2)
    const pointerAngle = Math.atan2(currentWorldY - cy, currentWorldX - cx)
    const deltaAngle = pointerAngle - -Math.PI / 2

    for (const initStroke of this.transformInitialState.strokes) {
      const stroke = this.strokes.find((s) => s.id === initStroke.id)
      if (!stroke) continue

      const baseAngle = initStroke.angle || 0
      stroke.angle = baseAngle + deltaAngle
    }
    this.notify()
  }

  commitTransform() {
    if (!this.transformInitialState) return
    this.undoStack.push(
      this.strokes.map((s) => {
        const init = this.transformInitialState?.strokes.find((is) => is.id === s.id)
        if (init) {
          return {
            ...s,
            points: init.points,
            boundingBox: { ...init.boundingBox },
            pathData: init.pathData,
            angle: init.angle,
          }
        }
        return { ...s }
      }),
    )
    this.redoStack = []
    this.transformInitialState = null
    this.notify()
  }
}

export const inkyStore = new InkyStore()

// Dev-only E2E hook: lets agent-browser tests inspect/drive the store without
// a React testing library. Never exposed in production builds.
if (import.meta.env.DEV) {
  ;(window as unknown as { inkyStore?: InkyStore }).inkyStore = inkyStore
}
