import type { Stroke } from '../canvas/types'
import type { Stamp } from '../canvas/store'

export type DocumentType = 'infinite' | 'worksheet'

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
  createdAt: number
  updatedAt: number
  thumbnailUrl?: string
  strokes: Stroke[]
  stamps: Stamp[]
  pdfPages?: WorksheetPage[]
}

const STORAGE_KEY = 'inky:boards:catalog:v1'
const CURRENT_BOARD_KEY = 'inky:boards:current_id'

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

  private save() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.boards))
        if (this.activeBoardId) {
          localStorage.setItem(CURRENT_BOARD_KEY, this.activeBoardId)
        }
      }
    } catch {}
  }

  private load() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          this.boards = JSON.parse(raw)
        }
        const activeId = localStorage.getItem(CURRENT_BOARD_KEY)
        if (activeId && this.boards.some((b) => b.id === activeId)) {
          this.activeBoardId = activeId
        }
      }
    } catch {}

    if (this.boards.length === 0) {
      const defaultBoard: BoardItem = {
        id: 'board-default',
        title: 'Scratch Board',
        type: 'infinite',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        strokes: [],
        stamps: [],
      }
      this.boards = [defaultBoard]
      this.activeBoardId = defaultBoard.id
      this.save()
    }
  }

  getActiveBoard(): BoardItem | undefined {
    return this.boards.find((b) => b.id === this.activeBoardId) ?? this.boards[0]
  }

  setActiveBoard(id: string) {
    if (this.boards.some((b) => b.id === id)) {
      this.activeBoardId = id
      this.notify()
    }
  }

  createBoard(type: DocumentType = 'infinite', title?: string, pdfPages?: WorksheetPage[]): BoardItem {
    const id = `board-${Date.now()}`
    const name = title ?? (type === 'worksheet' ? 'Homework Worksheet' : 'New Board')
    const newBoard: BoardItem = {
      id,
      title: name,
      type,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      strokes: [],
      stamps: [],
      pdfPages,
    }
    this.boards.unshift(newBoard)
    this.activeBoardId = id
    this.notify()
    return newBoard
  }

  updateActiveBoardData(strokes: Stroke[], stamps: Stamp[]) {
    const active = this.getActiveBoard()
    if (!active) return
    active.strokes = [...strokes]
    active.stamps = [...stamps]
    active.updatedAt = Date.now()
    this.notify()
  }

  deleteBoard(id: string) {
    if (this.boards.length <= 1) return
    this.boards = this.boards.filter((b) => b.id !== id)
    if (this.activeBoardId === id) {
      this.activeBoardId = this.boards[0].id
    }
    this.notify()
  }
}

export const boardCatalog = new BoardCatalogStore()
