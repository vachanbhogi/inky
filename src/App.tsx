import { useState } from 'react'
import { InkyBoard } from './components/canvas/InkyBoard'
import { HomeDashboard } from './components/home/HomeDashboard'
import { boardCatalog } from './lib/document/boardCatalog'
import { inkyStore } from './lib/canvas/store'

export function App() {
  const [view, setView] = useState<'home' | 'board'>('board')

  const handleOpenBoard = (boardId: string) => {
    boardCatalog.setActiveBoard(boardId)
    const board = boardCatalog.getActiveBoard()
    if (board) {
      // Load board strokes & stamps into inkyStore
      inkyStore.strokes = [...board.strokes]
      inkyStore.stamps = [...board.stamps]
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

