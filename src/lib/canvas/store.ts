import type { Point } from './coordinates'
import type { BoundingBox, HandleType } from './spatial-index'
import { getUnifiedBoundingBox } from './spatial-index'
import { generateStrokePath } from './svg-utils'
import type { Marquee, Stroke, ToolType } from './types'

type Listener = () => void

/** Caveat metrics used for per-char layout & boxes (≈0.5em advance, 1.25em line). */
export const CHAR_ADVANCE_EM = 0.5
export const CHAR_HEIGHT_EM = 1.25

/** One glyph of a stamped answer as a first-class canvas item: selectable,
 * draggable, transformable and erasable like a stroke. */
export interface StampChar {
  id: string
  char: string
  worldX: number
  worldY: number
  fontSize: number
  angle: number
}

/** A stamped answer: real text in a handwriting face, sized from the user's
 * own writing, living on the world plane like any other ink. */
export interface Stamp {
  id: string
  text: string
  worldX: number
  worldY: number
  color: string
  fontSize: number
  /** Per-char items laid out from the anchor (0.5em advance). Transforms and
   * the eraser operate on these; `worldX`/`worldY` stay the layout anchor. */
  chars: StampChar[]
}

/** Build the per-char items for a text stamp: one entry per code point
 * (surrogate-safe) laid along the baseline at 0.5em advance. */
export function stampCharsFor(
  text: string,
  worldX: number,
  worldY: number,
  fontSize: number,
  stampId: string,
): StampChar[] {
  return Array.from(text).map((char, i) => ({
    id: `${stampId}-c${i}`,
    char,
    worldX: worldX + i * fontSize * CHAR_ADVANCE_EM,
    worldY,
    fontSize,
    angle: 0,
  }))
}

/** Axis-aligned box of one char: its advance box, rotated about its own
 * center when the char carries an angle. */
export function charBoundingBox(ch: StampChar): BoundingBox {
  const w = ch.fontSize * CHAR_ADVANCE_EM
  const h = ch.fontSize * CHAR_HEIGHT_EM
  if (!ch.angle) {
    return { minX: ch.worldX, minY: ch.worldY, maxX: ch.worldX + w, maxY: ch.worldY + h }
  }
  const cx = ch.worldX + w / 2
  const cy = ch.worldY + h / 2
  const cos = Math.cos(ch.angle)
  const sin = Math.sin(ch.angle)
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const [px, py] of [
    [ch.worldX, ch.worldY],
    [ch.worldX + w, ch.worldY],
    [ch.worldX + w, ch.worldY + h],
    [ch.worldX, ch.worldY + h],
  ]) {
    const dx = px - cx
    const dy = py - cy
    const rx = cx + dx * cos - dy * sin
    const ry = cy + dx * sin + dy * cos
    if (rx < minX) minX = rx
    if (ry < minY) minY = ry
    if (rx > maxX) maxX = rx
    if (ry > maxY) maxY = ry
  }
  return { minX, minY, maxX, maxY }
}

/** Rendered bbox of a text stamp: the union of its char boxes (used for
 * eraser hit tests, marquee overlap and viewport clamping). */
export function stampBoundingBox(stamp: Stamp): BoundingBox {
  if (stamp.chars.length > 0) {
    return getUnifiedBoundingBox(stamp.chars.map(charBoundingBox)) as BoundingBox
  }
  // Fallback for a charless stamp (shouldn't happen — stampResult builds chars).
  const width = stamp.text.length * stamp.fontSize * CHAR_ADVANCE_EM
  const height = stamp.fontSize * CHAR_HEIGHT_EM
  return {
    minX: stamp.worldX,
    minY: stamp.worldY,
    maxX: stamp.worldX + width,
    maxY: stamp.worldY + height,
  }
}

export type PaperStyle = 'blank' | 'dot-grid' | 'graph' | 'lined'
export const PAPER_STYLES: readonly PaperStyle[] = ['blank', 'dot-grid', 'graph', 'lined']

interface UndoSnapshot {
  strokes: Stroke[]
  stamps: Stamp[]
}

interface BoardSlice {
  strokes: Stroke[]
  stamps: Stamp[]
  selectedStrokeIds: string[]
  selectedCharIds: string[]
  undoStack: UndoSnapshot[]
  redoStack: UndoSnapshot[]
}

function createBoardSlice(strokes: Stroke[] = [], stamps: Stamp[] = []): BoardSlice {
  return {
    strokes: strokes.map((stroke) => {
      const points: Point[] = stroke.points.map((point) => [...point] as Point)
      return {
        ...stroke,
        points,
        pathData: stroke.pathData || generateStrokePath(points, stroke.size),
        boundingBox: { ...stroke.boundingBox },
      }
    }),
    stamps: stamps.map((stamp) => ({
      ...stamp,
      chars: stamp.chars.map((char) => ({ ...char })),
    })),
    selectedStrokeIds: [],
    selectedCharIds: [],
    undoStack: [],
    redoStack: [],
  }
}

export class InkyStore {
  activeBoardId: string | null = null
  private boardSlices = new Map<string, BoardSlice>()
  private detachedSlice = createBoardSlice()

  private get activeSlice(): BoardSlice {
    if (!this.activeBoardId) return this.detachedSlice
    let slice = this.boardSlices.get(this.activeBoardId)
    if (!slice) {
      slice = createBoardSlice()
      this.boardSlices.set(this.activeBoardId, slice)
    }
    return slice
  }

  get strokes(): Stroke[] {
    return this.activeSlice.strokes
  }
  set strokes(strokes: Stroke[]) {
    this.activeSlice.strokes = strokes
  }

  get stamps(): Stamp[] {
    return this.activeSlice.stamps
  }
  set stamps(stamps: Stamp[]) {
    this.activeSlice.stamps = stamps
  }

  get selectedStrokeIds(): string[] {
    return this.activeSlice.selectedStrokeIds
  }
  set selectedStrokeIds(ids: string[]) {
    this.activeSlice.selectedStrokeIds = ids
  }

  get selectedCharIds(): string[] {
    return this.activeSlice.selectedCharIds
  }
  set selectedCharIds(ids: string[]) {
    this.activeSlice.selectedCharIds = ids
  }

  private get undoStack(): UndoSnapshot[] {
    return this.activeSlice.undoStack
  }
  private set undoStack(stack: UndoSnapshot[]) {
    this.activeSlice.undoStack = stack
  }

  private get redoStack(): UndoSnapshot[] {
    return this.activeSlice.redoStack
  }
  private set redoStack(stack: UndoSnapshot[]) {
    this.activeSlice.redoStack = stack
  }

  activateBoard(boardId: string, strokes: Stroke[] = [], stamps: Stamp[] = []) {
    if (!this.boardSlices.has(boardId)) {
      this.boardSlices.set(boardId, createBoardSlice(strokes, stamps))
    }
    this.activeBoardId = boardId
    this.currentStroke = null
    this.marquee = null
    this.activeHandle = null
    this.hoveredStrokeId = null
    this.hoveredCharId = null
    this.eraserPoint = null
    this.transformInitialState = null
    this.mathCapsule = null
    this.gestureDissolve = null
    this.recognizedPulse = null
    this.stampedReveal = null
    this.notify()
  }

  deleteBoardSlice(boardId: string) {
    this.boardSlices.delete(boardId)
    if (this.activeBoardId === boardId) {
      this.activeBoardId = null
    }
  }

  currentStroke: Stroke | null = null
  camera = { x: 0, y: 0, z: 1 }
  activeTool: ToolType = 'draw'
  paperStyle: PaperStyle = 'blank'
  strokeColor = '#111111'
  strokeSize = 4

  // Selection & Transform state
  /** Selected stamp chars — parallel to strokes so glyphs are first-class. */
  hoveredStrokeId: string | null = null
  hoveredCharId: string | null = null
  marquee: Marquee | null = null
  activeHandle: HandleType | null = null
  eraserPoint: { x: number; y: number; radius: number } | null = null
  showShortcuts = false
  graphSidebar: { isOpen: boolean; equation: string } = { isOpen: false, equation: '' }
  pedagogySheet: { isOpen: boolean; mode: 'teach' | 'review' } = { isOpen: false, mode: 'teach' }
  // Transient gesture-handoff animations (circle → capsule). Cleared by
  // CanvasLayer when their progress reports done.
  gestureDissolve: { stroke: Stroke; anchor: { x: number; y: number }; startedAt: number } | null =
    null
  recognizedPulse: { strokeIds: string[]; startedAt: number } | null = null
  // Most recent stamp, revealed by the feathered wipe.
  stampedReveal: { stampId: string; startedAt: number } | null = null
  mathCapsule: {
    latex: string
    worldPosition: { x: number; y: number }
    enclosedStrokeIds: string[]
    enclosedCharIds?: string[]
    source: 'rule' | 'ml' | 'stamp'
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
    chars: {
      id: string
      stampId: string
      worldX: number
      worldY: number
      fontSize: number
      angle: number
    }[]
    selectionBox: { minX: number; minY: number; maxX: number; maxY: number }
  } | null = null

  private listeners: Set<Listener> = new Set()

  private snapshot(): UndoSnapshot {
    return {
      strokes: [...this.strokes],
      // Deep-copy stamps + chars: per-char mutations (erase, transform) edit
      // char objects in place, so a shallow copy would alias them.
      stamps: this.stamps.map((s) => ({ ...s, chars: s.chars.map((c) => ({ ...c })) })),
    }
  }

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

  setPaperStyle(style: PaperStyle) {
    if (this.paperStyle !== style) {
      this.paperStyle = style
      this.notify()
    }
  }

  cyclePaperStyle() {
    const idx = PAPER_STYLES.indexOf(this.paperStyle)
    const next = PAPER_STYLES[(idx + 1) % PAPER_STYLES.length]
    this.setPaperStyle(next)
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
      enclosedCharIds?: string[]
      source: 'rule' | 'ml' | 'stamp'
      mlPending?: boolean
    } | null,
  ) {
    this.mathCapsule = capsule
    this.notify()
  }

  openGraphSidebar(equation: string = this.graphSidebar.equation || '') {
    this.graphSidebar = { isOpen: true, equation }
    this.notify()
  }

  updateGraphedEquation(equation: string) {
    this.graphSidebar = { ...this.graphSidebar, equation }
    this.notify()
  }

  closeGraphSidebar() {
    this.graphSidebar = { isOpen: false, equation: '' }
    this.notify()
  }

  openPedagogySheet(mode: 'teach' | 'review') {
    this.pedagogySheet = { isOpen: true, mode }
    this.notify()
  }

  closePedagogySheet() {
    this.pedagogySheet = { isOpen: false, mode: 'teach' }
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
    this.hoveredCharId = null
    this.eraserPoint = null
    this.notify()
  }

  setHoveredStrokeId(id: string | null) {
    if (this.hoveredStrokeId !== id) {
      this.hoveredStrokeId = id
      this.notify()
    }
  }

  setHoveredCharId(id: string | null) {
    if (this.hoveredCharId !== id) {
      this.hoveredCharId = id
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
    this.undoStack.push(this.snapshot())
    this.redoStack = []
    if (!stroke.pathData && stroke.points.length > 0) {
      stroke.pathData = generateStrokePath(stroke.points, stroke.size)
    }
    this.strokes.push(stroke)
    this.notify()
  }

  /** Stamp an answer as ONE undo step: append the text stamp (one char item
   * per code point), arm the reveal wipe, dismiss the capsule, clear the
   * selection, and return the user to the pen. The stamp's x is clamped so it
   * can never land off-screen (M2) — rendered width ≈ chars × fontSize ×
   * 0.5em × zoom. */
  stampResult(stamp: Omit<Stamp, 'id' | 'chars'>) {
    if (!stamp.text.trim()) return
    let worldX = stamp.worldX
    let worldY = stamp.worldY
    if (typeof window !== 'undefined') {
      const z = this.camera.z
      const estWidth = stamp.text.length * stamp.fontSize * 0.5 * z
      const screenX = worldX * z + this.camera.x
      const maxRight = window.innerWidth - 16
      // If the answer is too wide to fit to the right, or if it would clamp
      // all the way back over the original expression, place it below the expression.
      if (screenX + estWidth > maxRight) {
        // Check if there is an enclosed bounding box to clear
        const capsule = this.mathCapsule
        if (capsule) {
          const enclosedStrokes = this.strokes.filter((s) =>
            capsule.enclosedStrokeIds.includes(s.id),
          )
          const enclosedChars = capsule.enclosedCharIds
            ? this.stamps
                .flatMap((s) => s.chars)
                .filter((c) => capsule.enclosedCharIds?.includes(c.id))
            : []
          const allMinX = Math.min(
            ...enclosedStrokes.map((s) => s.boundingBox.minX),
            ...enclosedChars.map((c) => c.worldX),
            worldX,
          )
          const allMaxY = Math.max(
            ...enclosedStrokes.map((s) => s.boundingBox.maxY),
            ...enclosedChars.map((c) => c.worldY + c.fontSize * CHAR_HEIGHT_EM),
            worldY,
          )
          // Place cleanly on the next line below the writing with comfortable vertical breathing room
          worldX = allMinX
          worldY = allMaxY + Math.round(Math.max(28, stamp.fontSize * 0.7))
        } else {
          worldX = Math.max((8 - this.camera.x) / z, (maxRight - estWidth - this.camera.x) / z)
        }
      }
    }
    const id = `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    this.undoStack.push(this.snapshot())
    this.redoStack = []
    this.stamps.push({
      ...stamp,
      id,
      worldX,
      worldY,
      chars: stampCharsFor(stamp.text, worldX, worldY, stamp.fontSize, id),
    })
    this.stampedReveal = { stampId: id, startedAt: performance.now() }
    this.mathCapsule = null
    this.selectedStrokeIds = []
    this.selectedCharIds = []
    this.activeTool = 'draw'
    this.notify()
  }

  /** Remove one char by id. The stamp survives while any visible glyph
   * remains; losing its last visible glyph drops the whole stamp. */
  deleteChar(id: string) {
    const rec = this.charRecord(id)
    if (!rec) return
    this.undoStack.push(this.snapshot())
    this.redoStack = []
    this.stamps = this.stamps
      .map((s) => (s.id === rec.stampId ? { ...s, chars: s.chars.filter((c) => c.id !== id) } : s))
      // A stamp with no visible glyphs left is gone (whitespace is layout only).
      .filter((s) => s.chars.some((c) => !/\s/.test(c.char)))
    this.selectedCharIds = this.selectedCharIds.filter((cid) => cid !== id)
    this.dropRevealIfStampGone()
    this.notify()
  }

  /** Eraser hit test in world space: delete the char under the point. */
  deleteCharAt(x: number, y: number, radius: number): boolean {
    const hit = this.charAt(x, y, radius)
    if (!hit) return false
    this.deleteChar(hit.char.id)
    return true
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
      this.redoStack.push(this.snapshot())
      this.strokes = prev.strokes
      this.stamps = prev.stamps
      // Drop selection entries for items this undo removed.
      const existing = new Set(prev.strokes.map((s) => s.id))
      this.selectedStrokeIds = this.selectedStrokeIds.filter((id) => existing.has(id))
      const existingChars = new Set(prev.stamps.flatMap((s) => s.chars.map((c) => c.id)))
      this.selectedCharIds = this.selectedCharIds.filter((id) => existingChars.has(id))
      this.dropRevealIfStampGone()
      this.notify()
    }
  }

  redo() {
    if (!this.canRedo) return
    const next = this.redoStack.pop()
    if (next !== undefined) {
      this.undoStack.push(this.snapshot())
      this.strokes = next.strokes
      this.stamps = next.stamps
      this.dropRevealIfStampGone()
      this.notify()
    }
  }

  private dropRevealIfStampGone() {
    const id = this.stampedReveal?.stampId
    if (id && !this.stamps.some((s) => s.id === id)) this.stampedReveal = null
  }

  clear() {
    if (this.strokes.length === 0 && this.stamps.length === 0) return
    this.undoStack.push(this.snapshot())
    this.redoStack = []
    this.strokes = []
    this.stamps = []
    this.stampedReveal = null
    this.selectedStrokeIds = []
    this.selectedCharIds = []
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
      // A plain click replaces the whole selection across kinds.
      this.selectedStrokeIds = [id]
      this.selectedCharIds = []
    }
    this.notify()
  }

  selectStrokes(ids: string[]) {
    this.selectedStrokeIds = [...ids]
    this.notify()
  }

  selectChar(id: string, toggle = false) {
    if (toggle) {
      if (this.selectedCharIds.includes(id)) {
        this.selectedCharIds = this.selectedCharIds.filter((cId) => cId !== id)
      } else {
        this.selectedCharIds.push(id)
      }
    } else {
      // A plain click replaces the whole selection across kinds.
      this.selectedCharIds = [id]
      this.selectedStrokeIds = []
    }
    this.notify()
  }

  selectChars(ids: string[]) {
    this.selectedCharIds = [...ids]
    this.notify()
  }

  selectAll() {
    if (this.strokes.length === 0 && this.stamps.length === 0) return
    this.selectedStrokeIds = this.strokes.map((s) => s.id)
    this.selectedCharIds = this.stamps.flatMap((s) =>
      s.chars.filter((c) => !/\s/.test(c.char)).map((c) => c.id),
    )
    this.activeTool = 'select'
    this.notify()
  }

  clearSelection() {
    if (this.selectedStrokeIds.length === 0 && this.selectedCharIds.length === 0 && !this.marquee)
      return
    this.selectedStrokeIds = []
    this.selectedCharIds = []
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

  /** Find one char item by id (across all stamps). */
  charRecord(charId: string): { stampId: string; char: StampChar } | null {
    for (const stamp of this.stamps) {
      const char = stamp.chars.find((c) => c.id === charId)
      if (char) return { stampId: stamp.id, char }
    }
    return null
  }

  /** Top-most visible (non-whitespace) char under a world point, testing the
   * char's own rotated space. `tolerance` pads the hit box (eraser radius,
   * click affordance) — default 0 is an exact box hit. */
  charAt(
    worldX: number,
    worldY: number,
    tolerance = 0,
  ): { stampId: string; char: StampChar } | null {
    for (let si = this.stamps.length - 1; si >= 0; si--) {
      const stamp = this.stamps[si]
      for (let ci = stamp.chars.length - 1; ci >= 0; ci--) {
        const ch = stamp.chars[ci]
        if (/\s/.test(ch.char)) continue
        const w = ch.fontSize * CHAR_ADVANCE_EM
        const h = ch.fontSize * CHAR_HEIGHT_EM
        let px = worldX
        let py = worldY
        if (ch.angle) {
          const cx = ch.worldX + w / 2
          const cy = ch.worldY + h / 2
          const cos = Math.cos(-ch.angle)
          const sin = Math.sin(-ch.angle)
          const dx = worldX - cx
          const dy = worldY - cy
          px = cx + dx * cos - dy * sin
          py = cy + dx * sin + dy * cos
        }
        if (
          px >= ch.worldX - tolerance &&
          px <= ch.worldX + w + tolerance &&
          py >= ch.worldY - tolerance &&
          py <= ch.worldY + h + tolerance
        ) {
          return { stampId: stamp.id, char: ch }
        }
      }
    }
    return null
  }

  getSelectionBoundingBox() {
    const boxes = [
      ...this.strokes
        .filter((s) => this.selectedStrokeIds.includes(s.id))
        .map((s) => s.boundingBox),
      ...this.selectedCharIds
        .map((id) => this.charRecord(id)?.char)
        .filter((c): c is StampChar => c !== null)
        .map(charBoundingBox),
    ]
    return getUnifiedBoundingBox(boxes)
  }

  deleteStroke(id: string) {
    const exists = this.strokes.some((s) => s.id === id)
    if (!exists) return
    this.undoStack.push(this.snapshot())
    this.redoStack = []
    this.strokes = this.strokes.filter((s) => s.id !== id)
    this.selectedStrokeIds = this.selectedStrokeIds.filter((sId) => sId !== id)
    if (this.hoveredStrokeId === id) this.hoveredStrokeId = null
    this.notify()
  }

  deleteSelected() {
    if (this.selectedStrokeIds.length === 0 && this.selectedCharIds.length === 0) return
    this.undoStack.push(this.snapshot())
    this.redoStack = []
    this.strokes = this.strokes.filter((s) => !this.selectedStrokeIds.includes(s.id))
    const charIds = new Set(this.selectedCharIds)
    this.stamps = this.stamps
      .map((s) => ({ ...s, chars: s.chars.filter((c) => !charIds.has(c.id)) }))
      // A stamp with no visible glyphs left is gone (whitespace is layout only).
      .filter((s) => s.chars.some((c) => !/\s/.test(c.char)))
    this.selectedStrokeIds = []
    this.selectedCharIds = []
    this.dropRevealIfStampGone()
    this.notify()
  }

  /** Capture the pre-transform state of the current selection (strokes AND
   * chars) so drag/handle gestures mutate from a fixed origin and
   * commitTransform can push a single restoring undo entry. */
  beginTransform(box?: { minX: number; minY: number; maxX: number; maxY: number }) {
    const selectionBox = box ?? this.getSelectionBoundingBox()
    if (!selectionBox) return
    this.transformInitialState = {
      strokes: this.strokes
        .filter((s) => this.selectedStrokeIds.includes(s.id))
        .map((s) => ({
          id: s.id,
          points: s.points.map(([px, py]) => [px, py] as [number, number]),
          boundingBox: { ...s.boundingBox },
          pathData: s.pathData,
          angle: s.angle,
        })),
      chars: this.selectedCharIds.flatMap((id) => {
        const rec = this.charRecord(id)
        return rec
          ? [
              {
                id,
                stampId: rec.stampId,
                worldX: rec.char.worldX,
                worldY: rec.char.worldY,
                fontSize: rec.char.fontSize,
                angle: rec.char.angle,
              },
            ]
          : []
      }),
      selectionBox: { ...selectionBox },
    }
  }

  private transformHasSelection(): boolean {
    return this.selectedStrokeIds.length > 0 || this.selectedCharIds.length > 0
  }

  scaleSelected(handle: HandleType, currentWorldX: number, currentWorldY: number) {
    if (!this.transformHasSelection() || !this.transformInitialState) return

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

    // Chars scale around the same anchor; fontSize follows the area scale.
    const sizeScale = Math.sqrt(Math.abs(safeScaleX * safeScaleY))
    for (const initChar of this.transformInitialState.chars) {
      const char = this.charRecord(initChar.id)?.char
      if (!char) continue
      char.worldX = anchorX + (initChar.worldX - anchorX) * safeScaleX
      char.worldY = anchorY + (initChar.worldY - anchorY) * safeScaleY
      char.fontSize = initChar.fontSize * sizeScale
    }
    this.notify()
  }

  translateSelected(dx: number, dy: number) {
    if (!this.transformHasSelection() || !this.transformInitialState) return

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

    for (const initChar of this.transformInitialState.chars) {
      const char = this.charRecord(initChar.id)?.char
      if (!char) continue
      char.worldX = initChar.worldX + dx
      char.worldY = initChar.worldY + dy
    }
    this.notify()
  }

  rotateSelected(currentWorldX: number, currentWorldY: number) {
    if (!this.transformHasSelection() || !this.transformInitialState) return

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

    // Chars spin in place around their own centers (stroke parity: rotate
    // sets the angle, positions stay put).
    for (const initChar of this.transformInitialState.chars) {
      const char = this.charRecord(initChar.id)?.char
      if (!char) continue
      char.angle = (initChar.angle || 0) + deltaAngle
    }
    this.notify()
  }

  commitTransform() {
    if (!this.transformInitialState) return
    this.undoStack.push({
      strokes: this.strokes.map((s) => {
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
      // Capture the PRE-transform char state so one undo reverts the whole
      // gesture (chars were mutated in place during the drag).
      stamps: this.stamps.map((s) => {
        const initChars =
          this.transformInitialState?.chars.filter((ic) => ic.stampId === s.id) ?? []
        if (initChars.length === 0) return { ...s }
        return {
          ...s,
          chars: s.chars.map((c) => {
            const init = initChars.find((ic) => ic.id === c.id)
            return init
              ? {
                  ...c,
                  worldX: init.worldX,
                  worldY: init.worldY,
                  fontSize: init.fontSize,
                  angle: init.angle,
                }
              : { ...c }
          }),
        }
      }),
    })
    this.redoStack = []
    this.transformInitialState = null
    this.notify()
  }
}

export const inkyStore = new InkyStore()

// Dev-only E2E hook: lets agent-browser tests inspect/drive the store without
// a React testing library. Never exposed in production builds.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  ;(window as unknown as { inkyStore?: InkyStore }).inkyStore = inkyStore
}
