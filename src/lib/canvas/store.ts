import type { Point } from './coordinates'
import {
  AddStrokeCommand,
  AddWidgetCommand,
  BatchDeleteCommand,
  DeleteStrokeCommand,
  DeleteWidgetCommand,
  HistoryManager,
} from './history'
import type { BoundingBox, Camera, StickyColor, Stroke, ToolType, Widget } from './types'

// A simple Vanilla JS store for high-performance state management
// We want to avoid triggering React re-renders for every single pointer move (60fps),
// so we'll hold state in a class and use a subscription model for things that DO need to trigger re-renders.

type Listener = () => void

// Curated color palette for drawing
export const STROKE_COLORS = [
  { id: 'ink', value: '#173a40', label: 'Dark Ink' },
  { id: 'ocean', value: '#2563eb', label: 'Ocean' },
  { id: 'coral', value: '#ef4444', label: 'Coral' },
  { id: 'amber', value: '#f59e0b', label: 'Amber' },
  { id: 'violet', value: '#8b5cf6', label: 'Violet' },
  { id: 'emerald', value: '#10b981', label: 'Emerald' },
  { id: 'graphite', value: '#6b7280', label: 'Graphite' },
  { id: 'white', value: '#ffffff', label: 'White' },
] as const

export const STROKE_SIZES = [
  { id: 'thin', value: 2, label: 'Thin' },
  { id: 'medium', value: 4, label: 'Medium' },
  { id: 'thick', value: 8, label: 'Thick' },
  { id: 'bold', value: 14, label: 'Bold' },
] as const

class InkyStore {
  camera: Camera = { x: 0, y: 0, z: 1 }
  strokes: Stroke[] = []
  widgets: Widget[] = []

  // The stroke currently being drawn
  currentStroke: Stroke | null = null

  activeTool: ToolType = 'draw'
  selectedWidgetIds: string[] = []
  selectedStrokeIds: string[] = []
  hoveredElementId: string | null = null
  editingWidgetId: string | null = null

  activeHandle: 'nw' | 'ne' | 'sw' | 'se' | 'rotate' | null = null
  transformInitialState: {
    strokes: {
      id: string
      points: Point[]
      boundingBox: BoundingBox
      x: number
      y: number
      angle: number
    }[]
    widgets: {
      id: string
      x: number
      y: number
      width: number
      height: number
      scale?: number
      angle?: number
    }[]
    selectionBox: { box: BoundingBox; angle: number }
  } | null = null

  marquee: { startX: number; startY: number; endX: number; endY: number } | null = null

  // Drawing style
  strokeColor = '#173a40'
  strokeSize = 4

  // Shape tool

  // Shortcuts modal
  showShortcuts = false

  // Sticky note default color
  stickyColor: StickyColor = 'yellow'

  // History
  history: HistoryManager = new HistoryManager()

  private listeners: Set<Listener> = new Set()

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify() {
    this.listeners.forEach((l) => l())
  }

  // --- Actions ---

  setCamera(camera: Partial<Camera>) {
    this.camera = { ...this.camera, ...camera }
    this.notify()
  }

  addStroke(stroke: Stroke) {
    this.history.push(
      new AddStrokeCommand(
        () => this.strokes,
        (s) => {
          this.strokes = s
        },
        stroke,
      ),
    )
    this.notify()
  }

  setCurrentStroke(stroke: Stroke | null) {
    this.currentStroke = stroke
    // Don't necessarily notify all subscribers for every point during a draw,
    // the canvas render loop will read currentStroke directly.
    // We can manually notify if needed, or rely on the game loop.
  }

  addDefaultSticky(wx: number, wy: number) {
    const id = Date.now().toString()
    this.addWidget({
      id,
      x: wx,
      y: wy,
      width: 200,
      height: 150,
      type: 'sticky',
      content: '',
      stickyColor: 'yellow',
      scale: 1,
    })
    this.setEditingWidget(id)
    this.setActiveTool('select')
  }

  addDesmos(wx: number, wy: number) {
    const id = Date.now().toString()
    this.addWidget({ id, x: wx, y: wy, width: 600, height: 400, type: 'desmos' })
    this.setActiveTool('select')
  }

  addWidget(widget: Widget) {
    this.history.push(
      new AddWidgetCommand(
        () => this.widgets,
        (w) => {
          this.widgets = w
        },
        widget,
      ),
    )
    this.notify()
  }

  updateWidget(id: string, updates: Partial<Widget>) {
    const index = this.widgets.findIndex((w) => w.id === id)
    if (index !== -1) {
      this.widgets[index] = { ...this.widgets[index], ...updates }
      this.notify()
    }
  }

  setActiveTool(tool: ToolType) {
    this.activeTool = tool
    this.hoveredElementId = null
    if (tool !== 'select') {
      this.selectedWidgetIds = []
      this.selectedStrokeIds = []
    }
    this.notify()
  }

  setHoveredElementId(id: string | null) {
    if (this.hoveredElementId !== id) {
      this.hoveredElementId = id
      this.notify()
    }
  }

  setActiveHandle(handle: 'nw' | 'ne' | 'sw' | 'se' | 'rotate' | null) {
    this.activeHandle = handle
    this.notify()
  }

  setTransformInitialState(state: any) {
    this.transformInitialState = state
    this.notify()
  }

  setEditingWidget(id: string | null) {
    this.editingWidgetId = id
    if (id && !this.selectedWidgetIds.includes(id)) {
      this.setSelection([], [id])
    }
    this.notify()
  }

  setSelection(strokeIds: string[], widgetIds: string[]) {
    this.selectedStrokeIds = strokeIds
    this.selectedWidgetIds = widgetIds
    this.notify()
  }

  getSelectionBoundingBox(): { box: BoundingBox; angle: number } | null {
    if (this.selectedStrokeIds.length === 0 && this.selectedWidgetIds.length === 0) return null

    // Helper to get rotated corners of an AABB
    const getCorners = (
      minX: number,
      minY: number,
      maxX: number,
      maxY: number,
      angle: number,
      xOff: number,
      yOff: number,
    ) => {
      if (angle === 0) {
        return [
          { x: minX + xOff, y: minY + yOff },
          { x: maxX + xOff, y: minY + yOff },
          { x: minX + xOff, y: maxY + yOff },
          { x: maxX + xOff, y: maxY + yOff },
        ]
      }
      const cx = minX + (maxX - minX) / 2
      const cy = minY + (maxY - minY) / 2
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)
      return [
        { px: minX, py: minY },
        { px: maxX, py: minY },
        { px: minX, py: maxY },
        { px: maxX, py: maxY },
      ].map((p) => ({
        x: cx + (p.px - cx) * cosA - (p.py - cy) * sinA + xOff,
        y: cy + (p.px - cx) * sinA + (p.py - cy) * cosA + yOff,
      }))
    }

    if (this.selectedStrokeIds.length + this.selectedWidgetIds.length === 1) {
      // Single selection: Return OBB
      if (this.selectedStrokeIds.length === 1) {
        const s = this.strokes.find((x) => x.id === this.selectedStrokeIds[0])!
        return {
          box: {
            minX: s.boundingBox.minX + s.x,
            minY: s.boundingBox.minY + s.y,
            maxX: s.boundingBox.maxX + s.x,
            maxY: s.boundingBox.maxY + s.y,
          },
          angle: s.angle,
        }
      } else {
        const w = this.widgets.find((x) => x.id === this.selectedWidgetIds[0])!
        return {
          box: { minX: w.x, minY: w.y, maxX: w.x + w.width, maxY: w.y + w.height },
          angle: w.angle || 0,
        }
      }
    }

    // Multiple selection: Return AABB containing all rotated items
    let minX = Number.POSITIVE_INFINITY,
      minY = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      maxY = Number.NEGATIVE_INFINITY

    for (const strokeId of this.selectedStrokeIds) {
      const stroke = this.strokes.find((s) => s.id === strokeId)
      if (stroke) {
        const corners = getCorners(
          stroke.boundingBox.minX,
          stroke.boundingBox.minY,
          stroke.boundingBox.maxX,
          stroke.boundingBox.maxY,
          stroke.angle,
          stroke.x,
          stroke.y,
        )
        for (const c of corners) {
          if (c.x < minX) minX = c.x
          if (c.y < minY) minY = c.y
          if (c.x > maxX) maxX = c.x
          if (c.y > maxY) maxY = c.y
        }
      }
    }

    for (const widgetId of this.selectedWidgetIds) {
      const widget = this.widgets.find((w) => w.id === widgetId)
      if (widget) {
        const corners = getCorners(
          widget.x,
          widget.y,
          widget.x + widget.width,
          widget.y + widget.height,
          widget.angle || 0,
          0,
          0,
        )
        for (const c of corners) {
          if (c.x < minX) minX = c.x
          if (c.y < minY) minY = c.y
          if (c.x > maxX) maxX = c.x
          if (c.y > maxY) maxY = c.y
        }
      }
    }

    return { box: { minX, minY, maxX, maxY }, angle: 0 }
  }

  setMarquee(marquee: { startX: number; startY: number; endX: number; endY: number } | null) {
    this.marquee = marquee
    this.notify()
  }

  translateSelection(totalDx: number, totalDy: number) {
    if (!this.transformInitialState) return
    let hasChanges = false

    if (this.selectedStrokeIds.length > 0) {
      this.strokes = this.strokes.map((s) => {
        if (!this.selectedStrokeIds.includes(s.id)) return s
        const orig = this.transformInitialState!.strokes.find((x) => x.id === s.id)
        if (orig) {
          return { ...s, x: orig.x + totalDx, y: orig.y + totalDy }
        }
        return s
      })
      hasChanges = true
    }

    if (this.selectedWidgetIds.length > 0) {
      this.widgets = this.widgets.map((w) => {
        if (!this.selectedWidgetIds.includes(w.id)) return w
        const orig = this.transformInitialState!.widgets.find((x) => x.id === w.id)
        if (orig) {
          return { ...w, x: orig.x + totalDx, y: orig.y + totalDy }
        }
        return w
      })
      hasChanges = true
    }

    if (hasChanges) this.notify()
  }

  rotateSelection(angleDelta: number, cx: number, cy: number) {
    if (!this.transformInitialState) return
    let hasChanges = false
    const cosA = Math.cos(angleDelta)
    const sinA = Math.sin(angleDelta)

    if (this.selectedStrokeIds.length > 0) {
      this.strokes = this.strokes.map((s) => {
        if (!this.selectedStrokeIds.includes(s.id)) return s
        const orig = this.transformInitialState!.strokes.find((x) => x.id === s.id)
        if (orig) {
          const scx =
            orig.boundingBox.minX + (orig.boundingBox.maxX - orig.boundingBox.minX) / 2 + orig.x
          const scy =
            orig.boundingBox.minY + (orig.boundingBox.maxY - orig.boundingBox.minY) / 2 + orig.y
          const rx = cx + (scx - cx) * cosA - (scy - cy) * sinA
          const ry = cy + (scx - cx) * sinA + (scy - cy) * cosA
          const newX = rx - (scx - orig.x)
          const newY = ry - (scy - orig.y)
          return { ...s, angle: orig.angle + angleDelta, x: newX, y: newY }
        }
        return s
      })
      hasChanges = true
    }

    if (this.selectedWidgetIds.length > 0) {
      this.widgets = this.widgets.map((w) => {
        if (!this.selectedWidgetIds.includes(w.id)) return w
        const orig = this.transformInitialState!.widgets.find((x) => x.id === w.id)
        if (orig) {
          const scx = orig.x + orig.width / 2
          const scy = orig.y + orig.height / 2
          const rx = cx + (scx - cx) * cosA - (scy - cy) * sinA
          const ry = cy + (scx - cx) * sinA + (scy - cy) * cosA
          const newX = rx - orig.width / 2
          const newY = ry - orig.height / 2
          return { ...w, angle: (orig.angle || 0) + angleDelta, x: newX, y: newY }
        }
        return w
      })
      hasChanges = true
    }

    if (hasChanges) this.notify()
  }

  deleteStroke(id: string) {
    this.history.push(
      new DeleteStrokeCommand(
        () => this.strokes,
        (s) => {
          this.strokes = s
        },
        id,
      ),
    )
    this.selectedStrokeIds = this.selectedStrokeIds.filter((sid) => sid !== id)
    this.notify()
  }

  deleteWidget(id: string) {
    this.history.push(
      new DeleteWidgetCommand(
        () => this.widgets,
        (w) => {
          this.widgets = w
        },
        id,
      ),
    )
    this.selectedWidgetIds = this.selectedWidgetIds.filter((wid) => wid !== id)
    this.notify()
  }

  deleteSelected() {
    const strokeIds = [...this.selectedStrokeIds]
    const widgetIds = [...this.selectedWidgetIds]
    if (strokeIds.length === 0 && widgetIds.length === 0) return

    this.history.push(
      new BatchDeleteCommand(
        () => this.strokes,
        (s) => {
          this.strokes = s
        },
        () => this.widgets,
        (w) => {
          this.widgets = w
        },
        strokeIds,
        widgetIds,
      ),
    )
    this.selectedStrokeIds = []
    this.selectedWidgetIds = []
    this.notify()
  }

  // Undo / Redo
  undo() {
    if (this.history.undo()) {
      this.selectedStrokeIds = []
      this.selectedWidgetIds = []
      this.notify()
    }
  }

  redo() {
    if (this.history.redo()) {
      this.selectedStrokeIds = []
      this.selectedWidgetIds = []
      this.notify()
    }
  }

  get canUndo() {
    return this.history.canUndo
  }
  get canRedo() {
    return this.history.canRedo
  }

  // Drawing style
  setStrokeColor(color: string) {
    this.strokeColor = color
    this.updateSelectedStrokes({ color })
    this.notify()
  }

  setStrokeSize(size: number) {
    this.strokeSize = size
    this.updateSelectedStrokes({ size })
    this.notify()
  }

  // Shape tool

  // Shortcuts modal
  setShowShortcuts(show: boolean) {
    this.showShortcuts = show
    this.notify()
  }

  // Sticky color
  setStickyColor(color: StickyColor) {
    this.stickyColor = color
    this.updateSelectedWidgets({ stickyColor: color })
    this.notify()
  }

  // --- Multi-element Property Updates ---

  updateSelectedStrokes(updates: Partial<Stroke>) {
    if (this.selectedStrokeIds.length === 0) return
    this.strokes = this.strokes.map((s) => {
      if (this.selectedStrokeIds.includes(s.id)) {
        return { ...s, ...updates }
      }
      return s
    })
    this.notify()
  }

  updateSelectedWidgets(updates: Partial<Widget>) {
    if (this.selectedWidgetIds.length === 0) return
    this.widgets = this.widgets.map((w) => {
      if (this.selectedWidgetIds.includes(w.id)) {
        return { ...w, ...updates }
      }
      return w
    })
    this.notify()
  }
}

// Export a singleton instance for the app
export const inkyStore = new InkyStore()
