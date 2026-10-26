import {
  clearDocumentFromStorage,
  createDefaultDocument,
  deserializeDocument,
  loadDocumentFromStorage,
  saveDocumentToStorage,
  serializeDocument,
} from '../canvas/persistence'
import type { Stamp } from '../canvas/store'
import { InkyStore, inkyStore } from '../canvas/store'
import type { Stroke } from '../canvas/types'
import type { WorksheetMethod } from '../pdf/pdfCurriculum'
import { extractCurriculumFromPages } from '../pdf/pdfImporter'
import { deletePdfPagesFromIdb, loadPdfPagesFromIdb, savePdfPagesToIdb } from '../pdf/pdfStorage'

export type DocumentType = 'infinite' | 'worksheet'
export type PaperStyle = 'blank' | 'dot-grid' | 'graph' | 'lined'

export interface WorksheetPage {
  pageNumber: number
  width: number
  height: number
  dataUrl: string
  textContent?: string
}

export interface BoardItem {
  id: string
  title: string
  type: DocumentType
  paperStyle?: PaperStyle
  pageCount?: number
  worksheetMethod?: WorksheetMethod
  worksheetTopic?: string
  createdAt: number
  updatedAt: number
  thumbnailUrl?: string
  strokes: Stroke[]
  stamps: Stamp[]
  pdfPages?: WorksheetPage[]
  camera?: { x: number; y: number; z: number }
}

export const CATALOG_STORAGE_KEY = 'inky:boards:catalog:v1'
export const CURRENT_BOARD_KEY = 'inky:boards:current_id'

export function boardStorageKey(boardId: string): string {
  return `inky:board:doc:${boardId}`
}

export function boardPdfStorageKey(boardId: string): string {
  return `inky:board:pdf:${boardId}`
}

class BoardCatalogStore {
  boards: BoardItem[] = []
  activeBoardId: string | null = null
  private listeners = new Set<() => void>()

  constructor() {
    this.load()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private notify() {
    this.save()
    for (const fn of this.listeners) fn()
  }

  private saveBoardDocument(board: BoardItem, skipPdf = false) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      const tempStore = new InkyStore()
      tempStore.strokes = board.strokes
      tempStore.stamps = board.stamps
      if (board.camera) {
        tempStore.camera = { ...board.camera }
      }
      const doc = serializeDocument(tempStore, {
        id: board.id,
        title: board.title,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        type: board.type,
        paperStyle: board.paperStyle,
        pageCount: board.pageCount,
        worksheetMethod: board.worksheetMethod,
        worksheetTopic: board.worksheetTopic,
      })
      saveDocumentToStorage(doc, window.localStorage, boardStorageKey(board.id))
      if (!skipPdf && board.pdfPages && board.pdfPages.length > 0) {
        this.savePdfPagesSafely(board.id, board.pdfPages)
      }
    } catch {}
  }

  private savePdfPagesSafely(boardId: string, pdfPages: WorksheetPage[]) {
    void savePdfPagesToIdb(boardId, pdfPages)
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      window.localStorage.setItem(boardPdfStorageKey(boardId), JSON.stringify(pdfPages))
    } catch {
      // If localStorage quota is exceeded by older PDF boards, evict other PDF keys from localStorage
      // (their full pages remain safely in IndexedDB) so the active PDF board can also be cached synchronously.
      try {
        for (const b of this.boards) {
          if (b.id !== boardId) {
            window.localStorage.removeItem(boardPdfStorageKey(b.id))
          }
        }
        window.localStorage.setItem(boardPdfStorageKey(boardId), JSON.stringify(pdfPages))
      } catch {}
    }
  }

  private save() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Keep the catalog index lightweight: store metadata + at most 60 preview strokes
        // while the full strokes/stamps live in `inky:board:doc:<boardId>` and PDFs in `inky:board:pdf:<boardId>`.
        const catalogIndex = this.boards.map((b) => ({
          id: b.id,
          title: b.title,
          type: b.type,
          paperStyle: b.paperStyle,
          pageCount: b.pageCount,
          worksheetMethod: b.worksheetMethod,
          worksheetTopic: b.worksheetTopic,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          thumbnailUrl: b.thumbnailUrl,
          camera: b.camera,
          // Keep lightweight preview strokes for HomeDashboard cards without bloating the index
          strokes: (b.strokes ?? []).slice(0, 60),
          stamps: [],
        }))
        localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalogIndex))
        if (this.activeBoardId) {
          localStorage.setItem(CURRENT_BOARD_KEY, this.activeBoardId)
        } else {
          localStorage.removeItem(CURRENT_BOARD_KEY)
        }
      }
    } catch {}
  }

  load() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(CATALOG_STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            const hydrated: BoardItem[] = []
            for (const rawBoard of parsed as BoardItem[]) {
              // Filter out legacy auto-created 'board-default' if it was never drawn on
              if (
                rawBoard.id === 'board-default' &&
                rawBoard.title === 'Scratch Board' &&
                (!rawBoard.strokes || rawBoard.strokes.length === 0) &&
                (!rawBoard.stamps || rawBoard.stamps.length === 0)
              ) {
                continue
              }

              // Load per-board document file from localStorage if present
              const perBoardDoc = loadDocumentFromStorage(
                window.localStorage,
                boardStorageKey(rawBoard.id),
              )
              let strokes = Array.isArray(rawBoard.strokes) ? rawBoard.strokes : []
              let stamps = Array.isArray(rawBoard.stamps) ? rawBoard.stamps : []
              let camera = rawBoard.camera
              let pageCount = rawBoard.pageCount
              let worksheetMethod = rawBoard.worksheetMethod
              let worksheetTopic = rawBoard.worksheetTopic

              if (perBoardDoc) {
                const tempStore = new InkyStore()
                if (deserializeDocument(perBoardDoc, tempStore)) {
                  strokes = tempStore.strokes
                  stamps = tempStore.stamps
                  camera = { ...tempStore.camera }
                }
                if (
                  typeof perBoardDoc.metadata?.pageCount === 'number' &&
                  Number.isFinite(perBoardDoc.metadata.pageCount)
                ) {
                  pageCount = perBoardDoc.metadata.pageCount
                }
                if (typeof perBoardDoc.metadata?.worksheetMethod === 'string') {
                  worksheetMethod = perBoardDoc.metadata.worksheetMethod as WorksheetMethod
                }
                if (typeof perBoardDoc.metadata?.worksheetTopic === 'string') {
                  worksheetTopic = perBoardDoc.metadata.worksheetTopic
                }
              } else if (strokes.length > 0 || stamps.length > 0) {
                // Seamless migration: persist legacy inline board data into its dedicated per-board key
                const migratedBoard: BoardItem = {
                  ...rawBoard,
                  strokes,
                  stamps,
                }
                this.saveBoardDocument(migratedBoard)
              }

              // Load per-board PDF pages if present
              let pdfPages = rawBoard.pdfPages
              const rawPdf = window.localStorage.getItem(boardPdfStorageKey(rawBoard.id))
              if (rawPdf) {
                try {
                  const parsedPdf = JSON.parse(rawPdf)
                  if (Array.isArray(parsedPdf)) {
                    pdfPages = parsedPdf
                  }
                } catch {}
              } else if (pdfPages && pdfPages.length > 0) {
                this.savePdfPagesSafely(rawBoard.id, pdfPages)
              }

              // Retroactively extract curriculum if board has PDF pages but no detected method yet
              if (
                (!worksheetMethod || worksheetMethod === 'auto') &&
                pdfPages &&
                pdfPages.length > 0
              ) {
                const cur = extractCurriculumFromPages(pdfPages, rawBoard.title)
                if (cur.method !== 'auto') {
                  worksheetMethod = cur.method
                  worksheetTopic = cur.topicLabel
                }
              }

              const hydratedItem: BoardItem = {
                ...rawBoard,
                pageCount:
                  pageCount ??
                  (rawBoard.type === 'worksheet' ? Math.max(1, pdfPages?.length ?? 1) : undefined),
                worksheetMethod,
                worksheetTopic,
                strokes,
                stamps,
                camera,
                pdfPages,
              }
              hydrated.push(hydratedItem)

              // If PDF pages were not cached in localStorage (e.g., multi-page PDF stored in IndexedDB),
              // hydrate asynchronously from IndexedDB and notify listeners once ready.
              if (!pdfPages || pdfPages.length === 0) {
                void loadPdfPagesFromIdb(rawBoard.id).then((idbPages) => {
                  if (idbPages && idbPages.length > 0) {
                    const target = this.boards.find((b) => b.id === rawBoard.id)
                    if (target && (!target.pdfPages || target.pdfPages.length === 0)) {
                      target.pdfPages = idbPages
                      target.pageCount = Math.max(target.pageCount ?? 1, idbPages.length)
                      if (!target.worksheetMethod || target.worksheetMethod === 'auto') {
                        const cur = extractCurriculumFromPages(idbPages, target.title)
                        if (cur.method !== 'auto') {
                          target.worksheetMethod = cur.method
                          target.worksheetTopic = cur.topicLabel
                          this.saveBoardDocument(target, false)
                        }
                      }
                      for (const fn of this.listeners) fn()
                    }
                  }
                })
              }
            }
            this.boards = hydrated
          }
        }
        const activeId = localStorage.getItem(CURRENT_BOARD_KEY)
        if (activeId && this.boards.some((b) => b.id === activeId)) {
          this.activeBoardId = activeId
        } else if (this.boards.length > 0) {
          this.activeBoardId = this.boards[0].id
        }
      }
    } catch {}
  }

  getActiveBoard(): BoardItem | undefined {
    if (!this.activeBoardId) return this.boards[0]
    return this.boards.find((b) => b.id === this.activeBoardId) ?? this.boards[0]
  }

  setActiveBoard(id: string) {
    if (this.boards.some((b) => b.id === id)) {
      this.activeBoardId = id
      this.notify()
    }
  }

  createBoard(
    type: DocumentType = 'infinite',
    title?: string,
    pdfPages?: WorksheetPage[],
    paperStyle: PaperStyle = 'blank',
  ): BoardItem {
    const id = `board-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const name = title?.trim() || (type === 'worksheet' ? 'Homework' : 'Untitled')
    const defaultCam =
      typeof window !== 'undefined'
        ? { x: Math.round(window.innerWidth / 2), y: 40, z: 1 }
        : { x: 512, y: 40, z: 1 }
    const initialPageCount = type === 'worksheet' ? Math.max(1, pdfPages?.length ?? 1) : 1
    const curriculum =
      pdfPages && pdfPages.length > 0 ? extractCurriculumFromPages(pdfPages, name) : undefined
    const newBoard: BoardItem = {
      id,
      title: name,
      type,
      paperStyle,
      pageCount: initialPageCount,
      worksheetMethod: curriculum?.method,
      worksheetTopic: curriculum?.topicLabel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      strokes: [],
      stamps: [],
      pdfPages,
      camera: defaultCam,
    }

    // Immediately create a clean, isolated per-board document file in localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const blankDoc = createDefaultDocument({
        id: newBoard.id,
        title: newBoard.title,
        createdAt: newBoard.createdAt,
        updatedAt: newBoard.updatedAt,
        type: newBoard.type,
        paperStyle: newBoard.paperStyle,
        pageCount: newBoard.pageCount,
        worksheetMethod: newBoard.worksheetMethod,
        worksheetTopic: newBoard.worksheetTopic,
      })
      blankDoc.camera = { ...defaultCam }
      saveDocumentToStorage(blankDoc, window.localStorage, boardStorageKey(newBoard.id))
      if (pdfPages && pdfPages.length > 0) {
        this.savePdfPagesSafely(newBoard.id, pdfPages)
      }
    }

    this.boards.unshift(newBoard)
    this.activeBoardId = id
    this.notify()
    return newBoard
  }

  updateActiveBoardData(
    strokes: Stroke[],
    stamps: Stamp[],
    camera?: { x: number; y: number; z: number },
    paperStyle?: PaperStyle,
  ) {
    const active = this.getActiveBoard()
    if (!active) return
    active.strokes = [...strokes]
    active.stamps = [...stamps]
    if (camera) {
      active.camera = { ...camera }
    }
    if (paperStyle) {
      active.paperStyle = paperStyle
    }
    active.updatedAt = Date.now()
    // PDF pages are immutable once imported — skip re-writing megabytes of base64 JPEGs on every stroke!
    this.saveBoardDocument(active, true)
    this.notify()
  }

  addPageToActiveBoard(): number {
    const active = this.getActiveBoard()
    if (!active) return 1
    if (active.type !== 'worksheet') {
      active.type = 'worksheet'
      active.pageCount = 1
    } else {
      const currentCount = Math.max(active.pageCount ?? 1, active.pdfPages?.length ?? 1)
      active.pageCount = currentCount + 1
    }
    active.updatedAt = Date.now()
    this.saveBoardDocument(active, true)
    this.notify()
    return active.pageCount ?? 1
  }

  importPdfIntoBoard(
    boardId: string,
    pdfPages: WorksheetPage[],
    title?: string,
  ): BoardItem | undefined {
    const board = this.boards.find((b) => b.id === boardId)
    if (!board || pdfPages.length === 0) return board
    board.type = 'worksheet'
    board.pdfPages = pdfPages
    board.pageCount = Math.max(board.pageCount ?? 1, pdfPages.length)
    if (
      title &&
      (board.title === 'Untitled' || board.title === 'Homework' || board.title === 'Blank Note')
    ) {
      board.title = title
    }
    const curriculum = extractCurriculumFromPages(pdfPages, title ?? board.title)
    board.worksheetMethod = curriculum.method
    board.worksheetTopic = curriculum.topicLabel
    board.updatedAt = Date.now()
    this.saveBoardDocument(board, false)
    this.notify()
    return board
  }

  setActiveBoardMethod(method: WorksheetMethod, topicLabel?: string) {
    const active = this.getActiveBoard()
    if (!active) return
    active.worksheetMethod = method
    if (topicLabel !== undefined) {
      active.worksheetTopic = topicLabel
    }
    active.updatedAt = Date.now()
    this.saveBoardDocument(active, true)
    this.notify()
  }

  deleteBoard(id: string) {
    this.boards = this.boards.filter((b) => b.id !== id)
    inkyStore.deleteBoardSlice(id)
    void deletePdfPagesFromIdb(id)
    if (typeof window !== 'undefined' && window.localStorage) {
      clearDocumentFromStorage(window.localStorage, boardStorageKey(id))
      try {
        window.localStorage.removeItem(boardPdfStorageKey(id))
      } catch {}
    }
    if (this.activeBoardId === id) {
      this.activeBoardId = this.boards[0]?.id ?? null
    }
    this.notify()
  }
}

export const boardCatalog = new BoardCatalogStore()
