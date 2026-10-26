import { beforeEach, describe, expect, test } from 'bun:test'
import { loadDocumentFromStorage, STORAGE_KEY } from '../canvas/persistence'
import { inkyStore } from '../canvas/store'
import type { Stroke } from '../canvas/types'
import {
  boardCatalog,
  boardPdfStorageKey,
  boardStorageKey,
  CATALOG_STORAGE_KEY,
  CURRENT_BOARD_KEY,
} from './boardCatalog'

const makeStroke = (id: string, x: number, y: number): Stroke => ({
  id,
  points: [
    [x, y],
    [x + 20, y + 20],
  ],
  color: '#111111',
  size: 4,
  boundingBox: { minX: x, minY: y, maxX: x + 20, maxY: y + 20 },
})

describe('boardCatalog per-board localStorage isolation', () => {
  beforeEach(() => {
    localStorage.clear()
    boardCatalog.boards = []
    boardCatalog.activeBoardId = null
  })

  test('saves each board in its own separate localStorage key and never leaks strokes between boards', () => {
    // 1. Create Board A and add strokes
    const boardA = boardCatalog.createBoard('worksheet', 'Algebra Homework', undefined, 'graph')
    inkyStore.activateBoard(boardA.id, boardA.strokes, boardA.stamps)
    const strokeA = makeStroke('stroke-algebra-1', -100, 200)
    inkyStore.addStroke(strokeA)
    boardCatalog.updateActiveBoardData(
      inkyStore.strokes,
      inkyStore.stamps,
      { x: 640, y: 40, z: 1 },
      'graph',
    )

    // Verify Board A's dedicated file exists in localStorage
    const savedDocA = loadDocumentFromStorage(localStorage, boardStorageKey(boardA.id))
    expect(savedDocA).not.toBeNull()
    expect(savedDocA?.strokes.map((s) => s.id)).toEqual(['stroke-algebra-1'])

    // 2. Create Board B (should start 100% empty even if legacy global key is polluted)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        camera: { x: 0, y: 0, z: 1 },
        strokes: [makeStroke('legacy-polluted-stroke', 0, 0)],
        stamps: [],
      }),
    )

    const boardB = boardCatalog.createBoard('infinite', 'Physics Scratchpad', undefined, 'dot-grid')
    inkyStore.activateBoard(boardB.id, boardB.strokes, boardB.stamps)

    expect(boardB.strokes).toEqual([])
    expect(inkyStore.strokes).toEqual([])

    const savedDocB = loadDocumentFromStorage(localStorage, boardStorageKey(boardB.id))
    expect(savedDocB).not.toBeNull()
    expect(savedDocB?.strokes).toEqual([])

    // 3. Draw on Board B
    const strokeB = makeStroke('stroke-physics-1', 50, 50)
    inkyStore.addStroke(strokeB)
    boardCatalog.updateActiveBoardData(
      inkyStore.strokes,
      inkyStore.stamps,
      { x: 200, y: 100, z: 1.2 },
      'dot-grid',
    )

    // 4. Reload catalog from localStorage (simulating page refresh)
    boardCatalog.boards = []
    boardCatalog.activeBoardId = null
    boardCatalog.load()

    const reloadedA = boardCatalog.boards.find((b) => b.id === boardA.id)
    const reloadedB = boardCatalog.boards.find((b) => b.id === boardB.id)

    expect(reloadedA).toBeDefined()
    expect(reloadedB).toBeDefined()
    expect(reloadedA?.strokes.map((s) => s.id)).toEqual(['stroke-algebra-1'])
    expect(reloadedB?.strokes.map((s) => s.id)).toEqual(['stroke-physics-1'])
    expect(reloadedA?.paperStyle).toBe('graph')
    expect(reloadedB?.paperStyle).toBe('dot-grid')
    expect(reloadedB?.camera).toEqual({ x: 200, y: 100, z: 1.2 })
  })

  test('deleting a board removes its per-board document and PDF keys from localStorage', () => {
    const board = boardCatalog.createBoard(
      'worksheet',
      'Temp PDF',
      [{ pageNumber: 1, width: 816, height: 1056, dataUrl: 'data:image/jpeg;base64,fake' }],
      'blank',
    )
    const docKey = boardStorageKey(board.id)
    const pdfKey = boardPdfStorageKey(board.id)

    expect(localStorage.getItem(docKey)).not.toBeNull()
    expect(localStorage.getItem(pdfKey)).not.toBeNull()

    boardCatalog.deleteBoard(board.id)

    expect(localStorage.getItem(docKey)).toBeNull()
    expect(localStorage.getItem(pdfKey)).toBeNull()
    expect(localStorage.getItem(CURRENT_BOARD_KEY)).toBeNull()
    const rawCatalog = JSON.parse(localStorage.getItem(CATALOG_STORAGE_KEY) ?? '[]')
    expect(rawCatalog).toEqual([])
  })
})
