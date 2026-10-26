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

  test('addPageToActiveBoard increments pageCount and persists across reload', () => {
    const board = boardCatalog.createBoard('worksheet', 'Multi-page Notes', undefined, 'lined')
    expect(board.pageCount).toBe(1)

    const count2 = boardCatalog.addPageToActiveBoard()
    expect(count2).toBe(2)
    expect(boardCatalog.getActiveBoard()?.pageCount).toBe(2)

    const count3 = boardCatalog.addPageToActiveBoard()
    expect(count3).toBe(3)

    boardCatalog.boards = []
    boardCatalog.activeBoardId = null
    boardCatalog.load()

    expect(boardCatalog.getActiveBoard()?.pageCount).toBe(3)
  })

  test('importPdfIntoBoard converts an empty board to a worksheet with PDF pages and persists it', () => {
    const board = boardCatalog.createBoard('infinite', 'Untitled', undefined, 'blank')
    const pdfPages = [
      { pageNumber: 1, width: 816, height: 1056, dataUrl: 'data:image/jpeg;base64,page1' },
      { pageNumber: 2, width: 816, height: 1056, dataUrl: 'data:image/jpeg;base64,page2' },
    ]
    const updated = boardCatalog.importPdfIntoBoard(board.id, pdfPages, 'Calculus Midterm')
    expect(updated?.type).toBe('worksheet')
    expect(updated?.title).toBe('Calculus Midterm')
    expect(updated?.pageCount).toBe(2)
    expect(updated?.pdfPages).toHaveLength(2)

    boardCatalog.boards = []
    boardCatalog.activeBoardId = null
    boardCatalog.load()

    const reloaded = boardCatalog.getActiveBoard()
    expect(reloaded?.title).toBe('Calculus Midterm')
    expect(reloaded?.type).toBe('worksheet')
    expect(reloaded?.pageCount).toBe(2)
    expect(reloaded?.pdfPages).toHaveLength(2)
  })

  test('automatically detects PDF curriculum on createBoard and importPdfIntoBoard and persists setActiveBoardMethod', () => {
    const pdfPages = [
      {
        pageNumber: 1,
        width: 816,
        height: 1056,
        dataUrl: 'data:image/jpeg;base64,page1',
        textContent: 'Name: ___ Solve each equation by completing the square. 1) x^2 + 6x - 7 = 0',
      },
    ]
    const board = boardCatalog.createBoard('worksheet', 'Unit 5 Homework', pdfPages, 'blank')
    expect(board.worksheetMethod).toBe('completing-the-square')
    expect(board.worksheetTopic).toBe('Completing the Square')

    // Switch method explicitly via setActiveBoardMethod
    boardCatalog.setActiveBoardMethod('quadratic-formula', 'Quadratic Formula')
    expect(boardCatalog.getActiveBoard()?.worksheetMethod).toBe('quadratic-formula')
    expect(boardCatalog.getActiveBoard()?.worksheetTopic).toBe('Quadratic Formula')

    // Reload from localStorage and verify persistence
    boardCatalog.boards = []
    boardCatalog.activeBoardId = null
    boardCatalog.load()

    const reloaded = boardCatalog.getActiveBoard()
    expect(reloaded?.worksheetMethod).toBe('quadratic-formula')
    expect(reloaded?.worksheetTopic).toBe('Quadratic Formula')

    // Also test importPdfIntoBoard curriculum detection
    const emptyBoard = boardCatalog.createBoard('infinite', 'Blank Board', undefined, 'blank')
    const imported = boardCatalog.importPdfIntoBoard(
      emptyBoard.id,
      [
        {
          pageNumber: 1,
          width: 816,
          height: 1056,
          dataUrl: 'data:image/jpeg;base64,page2',
          textContent: 'Solve each equation by completing the square. 1) x^2 + 6x - 7 = 0',
        },
      ],
      'Imported Worksheet',
    )
    expect(imported?.worksheetMethod).toBe('completing-the-square')
    expect(imported?.worksheetTopic).toBe('Completing the Square')
  })
})
