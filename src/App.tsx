import { useState } from 'react'
import { InkyBoard } from './components/canvas/InkyBoard'
import { HomeDashboard } from './components/home/HomeDashboard'
import { inkyStore } from './lib/canvas/store'
import { boardCatalog } from './lib/document/boardCatalog'

export function App() {
  const [view, setView] = useState<'home' | 'board'>(() =>
    boardCatalog.boards.length === 0 ? 'home' : 'board',
  )

  const handleOpenBoard = (boardId: string) => {
    const current = boardCatalog.getActiveBoard()
    if (current && current.id === inkyStore.activeBoardId) {
      boardCatalog.updateActiveBoardData(
        inkyStore.strokes,
        inkyStore.stamps,
        inkyStore.camera,
        inkyStore.paperStyle,
      )
    }

    boardCatalog.setActiveBoard(boardId)
    const nextBoard = boardCatalog.getActiveBoard()
    if (nextBoard) {
      inkyStore.activateBoard(nextBoard.id, nextBoard.strokes, nextBoard.stamps)
      inkyStore.setPaperStyle(nextBoard.paperStyle ?? 'blank')
      const defaultCam = { x: Math.round(window.innerWidth / 2), y: 40, z: 1 }
      inkyStore.setCamera(nextBoard.camera ?? defaultCam)
    }
    setView('board')
  }

  const handleGoHome = () => {
    const board = boardCatalog.getActiveBoard()
    if (board && board.id === inkyStore.activeBoardId) {
      boardCatalog.updateActiveBoardData(
        inkyStore.strokes,
        inkyStore.stamps,
        inkyStore.camera,
        inkyStore.paperStyle,
      )
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
