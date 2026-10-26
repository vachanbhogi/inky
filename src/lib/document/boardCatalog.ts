import type { Stroke } from '../canvas/types'
import type { Stamp } from '../canvas/store'

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
        } else {
          localStorage.removeItem(CURRENT_BOARD_KEY)
        }
      }
    } catch {}
  }

  private load() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            // Filter out legacy auto-created 'board-default' if it was never drawn on
            this.boards = parsed.filter(
              (b: BoardItem) =>
                !(
                  b.id === 'board-default' &&
                  b.title === 'Scratch Board' &&
                  (!b.strokes || b.strokes.length === 0) &&
                  (!b.stamps || b.stamps.length === 0)
                ),
            )
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
    const id = `board-${Date.now()}`
    const name = title?.trim() || (type === 'worksheet' ? 'Homework' : 'Untitled')
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
    this.boards = this.boards.filter((b) => b.id !== id)
    if (this.activeBoardId === id) {
      this.activeBoardId = this.boards[0]?.id ?? null
    }
    this.notify()
  }
}

export const boardCatalog = new BoardCatalogStore()
