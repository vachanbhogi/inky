import { useState } from 'react'
import { InkyBoard } from './components/canvas/InkyBoard'
import { HomeDashboard } from './components/home/HomeDashboard'
import { boardCatalog } from './lib/document/boardCatalog'
import { inkyStore } from './lib/canvas/store'

export function App() {
  const [view, setView] = useState<'home' | 'board'>('board')

  const handleOpenBoard = (boardId: string) => {
    // 1. Flush any existing strokes & stamps to current board before switching
    const current = boardCatalog.getActiveBoard()
    if (current) {
      boardCatalog.updateActiveBoardData(inkyStore.strokes, inkyStore.stamps)
    }

    // 2. Set new active board
    boardCatalog.setActiveBoard(boardId)
    const nextBoard = boardCatalog.getActiveBoard()
    if (nextBoard) {
      inkyStore.clear()
      inkyStore.strokes = nextBoard.strokes.map((s) => ({
        ...s,
        points: s.points.map((p) => [...p]),
        boundingBox: { ...s.boundingBox },
      }))
      inkyStore.stamps = nextBoard.stamps.map((st) => ({
        ...st,
        chars: st.chars.map((c) => ({ ...c })),
      }))
      inkyStore.clearSelection()
      inkyStore.setCamera({ x: window.innerWidth / 2, y: 40, z: 1 })
    }
    setView('board')
  }

  const handleGoHome = () => {
    const board = boardCatalog.getActiveBoard()
    if (board) {
      boardCatalog.updateActiveBoardData(inkyStore.strokes, inkyStore.stamps)
    }
    setView('home')
  }

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#fbfbfa]">
      {view === 'home' ? (
        <HomeDashboard onOpenBoard={handleOpenBoard} />
      ) : (
        <InkyBoard onGoHome={handleGoHome} />
      )}
    </main>
  )
}

export default App

