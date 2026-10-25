import type { Point } from './coordinates'
import { getBoundingBox } from './spatial-index'
import type { InkyStore, Stamp, StampChar } from './store'
import { stampCharsFor } from './store'
import { generateStrokePath } from './svg-utils'
import type { Stroke } from './types'

export const STORAGE_KEY = 'inky:document:v1'

export interface InkyDocumentMetadata {
  id?: string
  title?: string
  createdAt?: number
  updatedAt?: number
  [key: string]: unknown
}

export interface InkyDocumentV1 {
  version: 1
  metadata?: InkyDocumentMetadata
  camera: {
    x: number
    y: number
    z: number
  }
  strokes: Stroke[]
  stamps: Stamp[]
  /** Forward-compatible extensible slots */
  pages?: unknown[]
  pdfAttachment?: unknown
  graphs?: unknown[]
  [key: string]: unknown
}

export interface AutosaveOptions {
  storageKey?: string
  storage?: Storage
  debounceMs?: number
  restoreOnStartup?: boolean
  onSave?: (doc: InkyDocumentV1) => void
  onRestore?: (doc: InkyDocumentV1) => void
  onError?: (err: unknown) => void
}

export interface AutosaveController {
  saveNow: () => boolean
  flush: () => boolean
  restore: () => boolean
  destroy: () => void
  isDirty: () => boolean
}

/**
 * Creates a blank v1 document with initialized extensible slots and timestamps.
 */
export function createDefaultDocument(metadata?: Partial<InkyDocumentMetadata>): InkyDocumentV1 {
  const now = Date.now()
  return {
    version: 1,
    metadata: {
      createdAt: now,
      updatedAt: now,
      ...metadata,
    },
    camera: { x: 0, y: 0, z: 1 },
    strokes: [],
    stamps: [],
    pages: [],
    graphs: [],
    pdfAttachment: undefined,
  }
}

/**
 * Deep clones store state into an InkyDocumentV1 snapshot.
 */
export function serializeDocument(
  store: InkyStore,
  metadata?: Partial<InkyDocumentMetadata>,
): InkyDocumentV1 {
  const now = Date.now()
  const strokes: Stroke[] = store.strokes.map((s) => ({
    id: s.id,
    points: s.points.map((p) => [...p] as Point),
    color: s.color,
    size: s.size,
    pathData: s.pathData,
    boundingBox: { ...s.boundingBox },
    angle: s.angle,
  }))

  const stamps: Stamp[] = store.stamps.map((st) => ({
    id: st.id,
    text: st.text,
    worldX: st.worldX,
    worldY: st.worldY,
    color: st.color,
    fontSize: st.fontSize,
    chars: st.chars.map((c) => ({ ...c })),
  }))

  return {
    version: 1,
    metadata: {
      createdAt: (metadata?.createdAt as number | undefined) ?? now,
      updatedAt: now,
      ...metadata,
    },
    camera: { ...store.camera },
    strokes,
    stamps,
    pages: [],
    graphs: [],
    pdfAttachment: undefined,
  }
}

/**
 * Validates and sanitizes a raw point object or tuple.
 */
function sanitizePoint(raw: unknown): Point | null {
  if (Array.isArray(raw)) {
    const x = raw[0]
    const y = raw[1]
    if (typeof x !== 'number' || !Number.isFinite(x)) return null
    if (typeof y !== 'number' || !Number.isFinite(y)) return null
    const pressure = raw[2]
    if (typeof pressure === 'number' && Number.isFinite(pressure)) {
      return [x, y, pressure]
    }
    return [x, y]
  }

  if (raw && typeof raw === 'object') {
    const p = raw as { x?: unknown; y?: unknown; pressure?: unknown }
    if (typeof p.x !== 'number' || !Number.isFinite(p.x)) return null
    if (typeof p.y !== 'number' || !Number.isFinite(p.y)) return null
    if (typeof p.pressure === 'number' && Number.isFinite(p.pressure)) {
      return [p.x, p.y, p.pressure]
    }
    return [p.x, p.y]
  }

  return null
}

/**
 * Validates and sanitizes a raw stroke object.
 */
function sanitizeStroke(raw: unknown): Stroke | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<Stroke>
  if (typeof s.id !== 'string' || !s.id) return null
  if (!Array.isArray(s.points)) return null

  const validPoints: Point[] = []
  for (const p of s.points) {
    const pt = sanitizePoint(p)
    if (pt) validPoints.push(pt)
  }
  if (validPoints.length === 0) return null

  const color = typeof s.color === 'string' && s.color ? s.color : '#111111'
  const size = typeof s.size === 'number' && Number.isFinite(s.size) && s.size > 0 ? s.size : 4
  const boundingBox =
    s.boundingBox &&
    typeof s.boundingBox.minX === 'number' &&
    typeof s.boundingBox.maxX === 'number' &&
    typeof s.boundingBox.minY === 'number' &&
    typeof s.boundingBox.maxY === 'number'
      ? { ...s.boundingBox }
      : getBoundingBox(validPoints)

  const pathData =
    typeof s.pathData === 'string' ? s.pathData : generateStrokePath(validPoints, size)

  return {
    id: s.id,
    points: validPoints,
    color,
    size,
    pathData,
    boundingBox,
    angle: typeof s.angle === 'number' && Number.isFinite(s.angle) ? s.angle : undefined,
  }
}

/**
 * Validates and sanitizes a raw stamp char object.
 */
function sanitizeStampChar(raw: unknown): StampChar | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Partial<StampChar>
  if (typeof c.id !== 'string' || !c.id) return null
  if (typeof c.char !== 'string') return null
  if (typeof c.worldX !== 'number' || !Number.isFinite(c.worldX)) return null
  if (typeof c.worldY !== 'number' || !Number.isFinite(c.worldY)) return null
  if (typeof c.fontSize !== 'number' || !Number.isFinite(c.fontSize)) return null
  return {
    id: c.id,
    char: c.char,
    worldX: c.worldX,
    worldY: c.worldY,
    fontSize: c.fontSize,
    angle: typeof c.angle === 'number' && Number.isFinite(c.angle) ? c.angle : 0,
  }
}

/**
 * Validates and sanitizes a raw stamp object.
 */
function sanitizeStamp(raw: unknown): Stamp | null {
  if (!raw || typeof raw !== 'object') return null
  const st = raw as Partial<Stamp>
  if (typeof st.id !== 'string' || !st.id) return null
  if (typeof st.text !== 'string') return null
  const worldX = typeof st.worldX === 'number' && Number.isFinite(st.worldX) ? st.worldX : 0
  const worldY = typeof st.worldY === 'number' && Number.isFinite(st.worldY) ? st.worldY : 0
  const color = typeof st.color === 'string' && st.color ? st.color : '#111111'
  const fontSize =
    typeof st.fontSize === 'number' && Number.isFinite(st.fontSize) && st.fontSize > 0
      ? st.fontSize
      : 24

  let chars: StampChar[] = []
  if (Array.isArray(st.chars)) {
    for (const c of st.chars) {
      const validChar = sanitizeStampChar(c)
      if (validChar) chars.push(validChar)
    }
  }
  if (chars.length === 0 && st.text.length > 0) {
    chars = stampCharsFor(st.text, worldX, worldY, fontSize, st.id)
  }

  return {
    id: st.id,
    text: st.text,
    worldX,
    worldY,
    color,
    fontSize,
    chars,
  }
}

/**
 * Deserializes an InkyDocumentV1 (or raw object) into the InkyStore.
 * Returns true if restored successfully, or false if invalid/corrupted.
 */
export function deserializeDocument(doc: unknown, store: InkyStore): boolean {
  if (!doc || typeof doc !== 'object') return false

  const candidate = doc as Record<string, unknown>
  if (candidate.version !== 1) return false
  if (candidate.strokes !== undefined && !Array.isArray(candidate.strokes)) return false
  if (candidate.stamps !== undefined && !Array.isArray(candidate.stamps)) return false

  // Sanitize strokes
  const sanitizedStrokes: Stroke[] = []
  if (Array.isArray(candidate.strokes)) {
    for (const raw of candidate.strokes) {
      const s = sanitizeStroke(raw)
      if (s) sanitizedStrokes.push(s)
    }
  }

  // Sanitize stamps
  const sanitizedStamps: Stamp[] = []
  if (Array.isArray(candidate.stamps)) {
    for (const raw of candidate.stamps) {
      const st = sanitizeStamp(raw)
      if (st) sanitizedStamps.push(st)
    }
  }

  // Sanitize camera
  const rawCam = candidate.camera as Partial<{ x: unknown; y: unknown; z: unknown }> | undefined
  const camX = typeof rawCam?.x === 'number' && Number.isFinite(rawCam.x) ? rawCam.x : 0
  const camY = typeof rawCam?.y === 'number' && Number.isFinite(rawCam.y) ? rawCam.y : 0
  const camZ =
    typeof rawCam?.z === 'number' && Number.isFinite(rawCam.z)
      ? Math.min(Math.max(rawCam.z, 0.1), 5)
      : 1

  // Apply to store cleanly
  store.strokes = sanitizedStrokes
  store.stamps = sanitizedStamps
  store.camera = { x: camX, y: camY, z: camZ }

  store.selectedStrokeIds = []
  store.selectedCharIds = []
  store.hoveredStrokeId = null
  store.hoveredCharId = null
  store.marquee = null
  store.activeHandle = null
  store.eraserPoint = null
  store.gestureDissolve = null
  store.recognizedPulse = null
  store.stampedReveal = null
  store.mathCapsule = null
  store.transformInitialState = null

  store.notify()
  return true
}

/**
 * Resolves local storage safely in browser and test environments.
 */
function resolveStorage(explicitStorage?: Storage): Storage | null {
  if (explicitStorage) return explicitStorage
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage
    }
  } catch {
    // Access denied / sandbox restriction
  }
  return null
}

/**
 * Saves a document to storage as JSON. Returns true on success, false on failure.
 */
export function saveDocumentToStorage(
  doc: InkyDocumentV1,
  storage?: Storage,
  key: string = STORAGE_KEY,
): boolean {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return false
  try {
    const serialized = JSON.stringify(doc)
    targetStorage.setItem(key, serialized)
    return true
  } catch {
    return false
  }
}

/**
 * Loads and parses a document from storage. Returns document or null if missing/invalid.
 */
export function loadDocumentFromStorage(
  storage?: Storage,
  key: string = STORAGE_KEY,
): InkyDocumentV1 | null {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return null
  try {
    const raw = targetStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
      return null
    }
    return parsed as InkyDocumentV1
  } catch {
    return null
  }
}

/**
 * Clears document from storage. Returns true on success, false on failure.
 */
export function clearDocumentFromStorage(storage?: Storage, key: string = STORAGE_KEY): boolean {
  const targetStorage = resolveStorage(storage)
  if (!targetStorage) return false
  try {
    targetStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * Initializes the autosave loop and restores any saved document on startup.
 */
export function initAutosave(store: InkyStore, options: AutosaveOptions = {}): AutosaveController {
  const key = options.storageKey ?? STORAGE_KEY
  const debounceMs = options.debounceMs ?? 500
  const storage = options.storage

  let dirty = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let isDestroyed = false

  const save = (): boolean => {
    if (isDestroyed) return false
    try {
      const doc = serializeDocument(store)
      const ok = saveDocumentToStorage(doc, storage, key)
      if (ok) {
        dirty = false
        if (debounceTimer) {
          clearTimeout(debounceTimer)
          debounceTimer = null
        }
        options.onSave?.(doc)
        return true
      }
      return false
    } catch (err) {
      options.onError?.(err)
      return false
    }
  }

  const restore = (): boolean => {
    if (isDestroyed) return false
    try {
      const doc = loadDocumentFromStorage(storage, key)
      if (!doc) return false
      const success = deserializeDocument(doc, store)
      if (success && options.onRestore) {
        options.onRestore(doc)
      }
      return success
    } catch (err) {
      options.onError?.(err)
      return false
    }
  }

  // Restore on startup if store is empty
  if (options.restoreOnStartup !== false) {
    const isEmpty = store.strokes.length === 0 && store.stamps.length === 0
    if (isEmpty) {
      restore()
    }
  }

  const scheduleSave = () => {
    if (isDestroyed) return
    dirty = true
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      save()
    }, debounceMs)
  }

  const unsubscribe = store.subscribe(scheduleSave)

  const handleBeforeUnload = () => {
    if (dirty) {
      save()
    }
  }

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && dirty) {
      save()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  const destroy = () => {
    if (isDestroyed) return
    isDestroyed = true
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    unsubscribe()
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    dirty = false
  }

  return {
    saveNow: save,
    flush: save,
    restore,
    destroy,
    isDirty: () => dirty,
  }
}
