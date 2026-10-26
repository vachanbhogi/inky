import type { Stroke } from '../canvas/types'
import type { Stamp } from '../canvas/store'
import {
  clearDocumentFromStorage,
  createDefaultDocument,
  deserializeDocument,
  loadDocumentFromStorage,
  saveDocumentToStorage,
  serializeDocument,
} from '../canvas/persistence'
import { InkyStore, inkyStore } from '../canvas/store'

export type DocumentType = 'infinite' | 'worksheet'
export type PaperStyle = 'blank' | 'dot-grid' | 'graph' | 'lined'

export interface WorksheetPage {
  pageNumber: number
  width: number
  height: number
  dataUrl: string
}

export interface BoardItem {
  id: string
  title: string
  type: DocumentType
  paperStyle?: PaperStyle
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

  private saveBoardDocument(board: BoardItem) {
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
      })
      saveDocumentToStorage(doc, window.localStorage, boardStorageKey(board.id))
      if (board.pdfPages && board.pdfPages.length > 0) {
        window.localStorage.setItem(boardPdfStorageKey(board.id), JSON.stringify(board.pdfPages))
      }
    } catch {}
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

              if (perBoardDoc) {
                const tempStore = new InkyStore()
                if (deserializeDocument(perBoardDoc, tempStore)) {
                  strokes = tempStore.strokes
                  stamps = tempStore.stamps
                  camera = { ...tempStore.camera }
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
                try {
                  window.localStorage.setItem(
                    boardPdfStorageKey(rawBoard.id),
                    JSON.stringify(pdfPages),
                  )
                } catch {}
              }

              hydrated.push({
                ...rawBoard,
                strokes,
                stamps,
                camera,
                pdfPages,
              })
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
    const newBoard: BoardItem = {
      id,
      title: name,
      type,
      paperStyle,
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
      })
      blankDoc.camera = { ...defaultCam }
      saveDocumentToStorage(blankDoc, window.localStorage, boardStorageKey(newBoard.id))
      if (pdfPages && pdfPages.length > 0) {
        try {
          window.localStorage.setItem(boardPdfStorageKey(newBoard.id), JSON.stringify(pdfPages))
        } catch {}
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
    this.saveBoardDocument(active)
    this.notify()
  }

  deleteBoard(id: string) {
    this.boards = this.boards.filter((b) => b.id !== id)
    inkyStore.deleteBoardSlice(id)
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
