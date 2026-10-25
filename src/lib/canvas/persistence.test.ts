import { beforeEach, describe, expect, test } from 'bun:test'
import {
  createDefaultDocument,
  deserializeDocument,
  type InkyDocumentV1,
  initAutosave,
  loadDocumentFromStorage,
  STORAGE_KEY,
  saveDocumentToStorage,
  serializeDocument,
} from './persistence'
import { InkyStore } from './store'
import type { Stroke } from './types'

describe('persistence: InkyDocumentV1 format & defaults', () => {
  test('createDefaultDocument creates a valid v1 document with extensible slots', () => {
    const doc = createDefaultDocument()
    expect(doc.version).toBe(1)
    expect(doc.camera).toEqual({ x: 0, y: 0, z: 1 })
    expect(doc.strokes).toEqual([])
    expect(doc.stamps).toEqual([])
    expect(doc.pages).toEqual([])
    expect(doc.graphs).toEqual([])
    expect(doc.pdfAttachment).toBeUndefined()
    expect(doc.metadata).toBeDefined()
    expect(typeof doc.metadata?.createdAt).toBe('number')
    expect(typeof doc.metadata?.updatedAt).toBe('number')
  })

  test('STORAGE_KEY is inky:document:v1', () => {
    expect(STORAGE_KEY).toBe('inky:document:v1')
  })
})

describe('persistence: serialization', () => {
  test('serializeDocument captures store strokes, stamps, and camera', () => {
    const store = new InkyStore()
    const stroke: Stroke = {
      id: 'stroke-1',
      points: [
        [10, 10, 0.5],
        [20, 20, 0.8],
      ],
      color: '#2563eb',
      size: 4,
      boundingBox: { minX: 10, minY: 10, maxX: 20, maxY: 20 },
    }
    store.strokes = [stroke]
    store.stampResult({
      text: 'x = 42',
      worldX: 100,
      worldY: 150,
      color: '#111111',
      fontSize: 24,
    })
    store.setCamera({ x: 50, y: -20, z: 1.5 })

    const doc = serializeDocument(store, { title: 'Test Canvas' })

    expect(doc.version).toBe(1)
    expect(doc.camera).toEqual({ x: 50, y: -20, z: 1.5 })
    expect(doc.strokes.length).toBe(1)
    expect(doc.strokes[0].id).toBe('stroke-1')
    expect(doc.stamps.length).toBe(1)
    expect(doc.stamps[0].text).toBe('x = 42')
    expect(doc.metadata?.title).toBe('Test Canvas')
    expect(Array.isArray(doc.pages)).toBe(true)
    expect(Array.isArray(doc.graphs)).toBe(true)
  })

  test('serialization produces deep copies independent of store mutations', () => {
    const store = new InkyStore()
    const stroke: Stroke = {
      id: 'stroke-1',
      points: [[5, 5]],
      color: '#111111',
      size: 2,
      boundingBox: { minX: 5, minY: 5, maxX: 5, maxY: 5 },
    }
    store.strokes = [stroke]
    const doc = serializeDocument(store)

    // Mutate store
    stroke.points.push([10, 10])
    store.strokes = []

    expect(doc.strokes.length).toBe(1)
    expect(doc.strokes[0].points.length).toBe(1)
  })
})

describe('persistence: deserialization resilience', () => {
  let store: InkyStore

  beforeEach(() => {
    store = new InkyStore()
  })

  test('deserializeDocument restores valid document into store', () => {
    const doc: InkyDocumentV1 = {
      version: 1,
      camera: { x: 120, y: 80, z: 1.2 },
      strokes: [
        {
          id: 'stroke-restored',
          points: [[1, 2]],
          color: '#dc2626',
          size: 6,
          boundingBox: { minX: 1, minY: 2, maxX: 1, maxY: 2 },
        },
      ],
      stamps: [
        {
          id: 'stamp-restored',
          text: '2+2=4',
          worldX: 50,
          worldY: 50,
          color: '#111111',
          fontSize: 20,
          chars: [
            { id: 'stamp-restored-c0', char: '2', worldX: 50, worldY: 50, fontSize: 20, angle: 0 },
          ],
        },
      ],
      metadata: { title: 'Restored' },
    }

    let notified = false
    store.subscribe(() => {
      notified = true
    })

    const success = deserializeDocument(doc, store)

    expect(success).toBe(true)
    expect(store.strokes.length).toBe(1)
    expect(store.strokes[0].id).toBe('stroke-restored')
    expect(store.stamps.length).toBe(1)
    expect(store.stamps[0].id).toBe('stamp-restored')
    expect(store.camera.x).toBe(120)
    expect(store.camera.y).toBe(80)
    expect(store.camera.z).toBe(1.2)
    expect(notified).toBe(true)
  })

  test('deserializeDocument clears selection and transient animations on restore', () => {
    store.selectedStrokeIds = ['old-stroke']
    store.selectedCharIds = ['old-char']
    store.setMathCapsule({
      latex: 'x^2',
      worldPosition: { x: 0, y: 0 },
      enclosedStrokeIds: ['old-stroke'],
      source: 'rule',
    })

    const doc = createDefaultDocument()
    deserializeDocument(doc, store)

    expect(store.selectedStrokeIds).toEqual([])
    expect(store.selectedCharIds).toEqual([])
    expect(store.mathCapsule).toBeNull()
    expect(store.gestureDissolve).toBeNull()
    expect(store.recognizedPulse).toBeNull()
  })

  test('deserializeDocument rejects invalid / corrupted inputs without throwing', () => {
    expect(deserializeDocument(null, store)).toBe(false)
    expect(deserializeDocument(undefined, store)).toBe(false)
    expect(deserializeDocument('corrupted string', store)).toBe(false)
    expect(deserializeDocument(12345, store)).toBe(false)
    expect(deserializeDocument({}, store)).toBe(false)
    expect(deserializeDocument({ version: 2 }, store)).toBe(false) // Unknown version
    expect(deserializeDocument({ version: '1' }, store)).toBe(false)
    expect(deserializeDocument({ version: 1, strokes: 'not-array' }, store)).toBe(false)
  })

  test('deserializeDocument sanitizes strokes with missing or malformed items', () => {
    const malformedDoc = {
      version: 1,
      camera: { x: 'invalid', y: 0, z: -5 }, // z clamped, x invalid fallback
      strokes: [
        null,
        { id: 'valid-1', points: [[1, 1]], color: '#111', size: 2 },
        { noId: true },
        'string instead of stroke',
      ],
      stamps: [
        null,
        {
          id: 'valid-stamp',
          text: 'hi',
          worldX: 0,
          worldY: 0,
          color: '#000',
          fontSize: 16,
          chars: [],
        },
      ],
    }

    const success = deserializeDocument(malformedDoc, store)
    expect(success).toBe(true)
    expect(store.strokes.length).toBe(1)
    expect(store.strokes[0].id).toBe('valid-1')
    expect(store.stamps.length).toBe(1)
    expect(store.stamps[0].id).toBe('valid-stamp')
    expect(store.camera.z).toBe(0.1) // Clamped to min 0.1
    expect(store.camera.x).toBe(0) // Fallback for invalid x
  })
})

describe('persistence: storage load and save', () => {
  let mockStorage: Record<string, string>
  let storage: Storage

  beforeEach(() => {
    mockStorage = {}
    storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        mockStorage = {}
      },
      key: (idx: number) => Object.keys(mockStorage)[idx] ?? null,
      length: 0,
    }
  })

  test('saveDocumentToStorage writes JSON string to storage', () => {
    const doc = createDefaultDocument()
    const ok = saveDocumentToStorage(doc, storage, 'test:key')
    expect(ok).toBe(true)
    expect(mockStorage['test:key']).toBeDefined()
    const parsed = JSON.parse(mockStorage['test:key'])
    expect(parsed.version).toBe(1)
  })

  test('loadDocumentFromStorage parses valid JSON from storage', () => {
    const doc = createDefaultDocument({ title: 'My Drawing' })
    saveDocumentToStorage(doc, storage, 'test:key')

    const loaded = loadDocumentFromStorage(storage, 'test:key')
    expect(loaded).not.toBeNull()
    expect(loaded?.version).toBe(1)
    expect(loaded?.metadata?.title).toBe('My Drawing')
  })

  test('loadDocumentFromStorage returns null for missing or corrupted entries', () => {
    expect(loadDocumentFromStorage(storage, 'missing')).toBeNull()

    mockStorage.corrupted = '{ not valid json'
    expect(loadDocumentFromStorage(storage, 'corrupted')).toBeNull()

    mockStorage['wrong-version'] = JSON.stringify({ version: 99 })
    expect(loadDocumentFromStorage(storage, 'wrong-version')).toBeNull()
  })

  test('handles storage exceptions (e.g. quota exceeded) safely', () => {
    const throwingStorage = {
      ...storage,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const doc = createDefaultDocument()
    const ok = saveDocumentToStorage(doc, throwingStorage)
    expect(ok).toBe(false)
  })
})

describe('persistence: initAutosave loop', () => {
  let mockStorage: Record<string, string>
  let storage: Storage
  let store: InkyStore

  beforeEach(() => {
    mockStorage = {}
    storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        mockStorage = {}
      },
      key: (idx: number) => Object.keys(mockStorage)[idx] ?? null,
      length: 0,
    }
    store = new InkyStore()
  })

  test('restores existing document into empty store on initialization', () => {
    const savedDoc: InkyDocumentV1 = {
      version: 1,
      camera: { x: 30, y: 40, z: 1.5 },
      strokes: [
        {
          id: 's-pre-existing',
          points: [[10, 10]],
          color: '#111',
          size: 4,
          boundingBox: { minX: 10, minY: 10, maxX: 10, maxY: 10 },
        },
      ],
      stamps: [],
    }
    mockStorage[STORAGE_KEY] = JSON.stringify(savedDoc)

    let restoredCalled = false
    const autosave = initAutosave(store, {
      storage,
      onRestore: () => {
        restoredCalled = true
      },
    })

    expect(store.strokes.length).toBe(1)
    expect(store.strokes[0].id).toBe('s-pre-existing')
    expect(store.camera.x).toBe(30)
    expect(restoredCalled).toBe(true)

    autosave.destroy()
  })

  test('does not restore over non-empty store on initialization', () => {
    const savedDoc = createDefaultDocument({ title: 'Old' })
    mockStorage[STORAGE_KEY] = JSON.stringify(savedDoc)

    // Store already has a stroke
    store.strokes = [
      {
        id: 's-current',
        points: [[0, 0]],
        color: '#2563eb',
        size: 2,
        boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      },
    ]

    const autosave = initAutosave(store, { storage })
    expect(store.strokes.length).toBe(1)
    expect(store.strokes[0].id).toBe('s-current')

    autosave.destroy()
  })

  test('debounces saves when store notifies changes', async () => {
    const autosave = initAutosave(store, { storage, debounceMs: 50 })

    expect(autosave.isDirty()).toBe(false)
    expect(mockStorage[STORAGE_KEY]).toBeUndefined()

    // Mutate store
    store.strokes.push({
      id: 's1',
      points: [[1, 1]],
      color: '#111',
      size: 2,
      boundingBox: { minX: 1, minY: 1, maxX: 1, maxY: 1 },
    })
    store.notify()

    expect(autosave.isDirty()).toBe(true)
    expect(mockStorage[STORAGE_KEY]).toBeUndefined() // Not saved yet (debounced)

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(autosave.isDirty()).toBe(false)
    expect(mockStorage[STORAGE_KEY]).toBeDefined()
    const saved = JSON.parse(mockStorage[STORAGE_KEY])
    expect(saved.strokes.length).toBe(1)

    autosave.destroy()
  })

  test('flush immediately writes pending changes and clears dirty flag', () => {
    const autosave = initAutosave(store, { storage, debounceMs: 1000 })

    store.strokes.push({
      id: 's-flush',
      points: [[2, 2]],
      color: '#dc2626',
      size: 4,
      boundingBox: { minX: 2, minY: 2, maxX: 2, maxY: 2 },
    })
    store.notify()

    expect(autosave.isDirty()).toBe(true)
    expect(mockStorage[STORAGE_KEY]).toBeUndefined()

    const ok = autosave.flush()
    expect(ok).toBe(true)
    expect(autosave.isDirty()).toBe(false)
    expect(mockStorage[STORAGE_KEY]).toBeDefined()

    const saved = JSON.parse(mockStorage[STORAGE_KEY])
    expect(saved.strokes[0].id).toBe('s-flush')

    autosave.destroy()
  })

  test('window beforeunload flushes pending changes', () => {
    const autosave = initAutosave(store, { storage, debounceMs: 5000 })

    store.strokes.push({
      id: 's-unload',
      points: [[3, 3]],
      color: '#16a34a',
      size: 2,
      boundingBox: { minX: 3, minY: 3, maxX: 3, maxY: 3 },
    })
    store.notify()

    expect(autosave.isDirty()).toBe(true)
    expect(mockStorage[STORAGE_KEY]).toBeUndefined()

    // Trigger beforeunload
    window.dispatchEvent(new Event('beforeunload'))

    expect(autosave.isDirty()).toBe(false)
    expect(mockStorage[STORAGE_KEY]).toBeDefined()

    autosave.destroy()
  })

  test('document visibilitychange (hidden) flushes pending changes', () => {
    const autosave = initAutosave(store, { storage, debounceMs: 5000 })

    store.strokes.push({
      id: 's-visibility',
      points: [[4, 4]],
      color: '#9333ea',
      size: 2,
      boundingBox: { minX: 4, minY: 4, maxX: 4, maxY: 4 },
    })
    store.notify()

    expect(autosave.isDirty()).toBe(true)

    // Simulate document visibilitychange with hidden state
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(autosave.isDirty()).toBe(false)
    expect(mockStorage[STORAGE_KEY]).toBeDefined()

    // Reset visibilityState
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    })

    autosave.destroy()
  })

  test('destroy cleans up listeners and cancels pending timers', async () => {
    const autosave = initAutosave(store, { storage, debounceMs: 50 })

    store.strokes.push({
      id: 's-abandoned',
      points: [[5, 5]],
      color: '#111',
      size: 2,
      boundingBox: { minX: 5, minY: 5, maxX: 5, maxY: 5 },
    })
    store.notify()

    autosave.destroy()

    // Wait past debounce window
    await new Promise((resolve) => setTimeout(resolve, 80))

    // Should NOT have saved because destroyed cancelled timer
    expect(mockStorage[STORAGE_KEY]).toBeUndefined()
  })
})
