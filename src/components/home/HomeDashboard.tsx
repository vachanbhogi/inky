import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { boardCatalog, type BoardItem } from '../../lib/document/boardCatalog'
import { renderPdfToPages } from '../../lib/pdf/pdfImporter'

interface HomeDashboardProps {
  onOpenBoard: (boardId: string) => void
}

export function HomeDashboard({ onOpenBoard }: HomeDashboardProps) {
  const [boards, setBoards] = useState<BoardItem[]>(boardCatalog.boards)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = boardCatalog.subscribe(() => {
      setBoards([...boardCatalog.boards])
    })
    return unsub
  }, [])

  const handleCreateBoard = () => {
    const newBoard = boardCatalog.createBoard('infinite', 'Untitled')
    onOpenBoard(newBoard.id)
  }

  const handleProcessPdfFile = async (file: File) => {
    if (!file || file.type !== 'application/pdf') return
    try {
      const buffer = await file.arrayBuffer()
      const pages = await renderPdfToPages(buffer)
      if (pages.length > 0) {
        const title = file.name.replace(/\.pdf$/i, '')
        const board = boardCatalog.createBoard('worksheet', title, pages)
        onOpenBoard(board.id)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      await handleProcessPdfFile(file)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await handleProcessPdfFile(file)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="relative w-screen h-screen overflow-y-auto bg-[#fbfbfa] text-[#111111] flex flex-col items-center select-none"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Drag drop curtain */}
      {isDragging && (
        <div className="absolute inset-4 z-50 bg-white/95 border border-black/10 rounded-2xl flex flex-col items-center justify-center pointer-events-none">
          <p className="text-sm font-medium text-neutral-800">Drop PDF to open</p>
        </div>
      )}

      {/* Main Notion-inspired document canvas */}
      <div className="w-full max-w-3xl px-8 py-20 flex flex-col">
        {/* Workspace Title & Actions */}
        <div className="flex items-baseline justify-between mb-10 pb-3 border-b border-black/[0.06]">
          <div className="flex items-center gap-2">
            <span className="text-xl font-medium tracking-tight text-neutral-900">Inky</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-md hover:bg-black/[0.04] text-neutral-600 hover:text-black transition-colors cursor-pointer"
            >
              Import PDF
            </button>
            <span className="text-neutral-300">·</span>
            <button
              type="button"
              onClick={handleCreateBoard}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md hover:bg-black/[0.04] text-neutral-800 hover:text-black font-medium transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Board List (Notion table/gallery style) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {boards.map((b) => (
            <div
              key={b.id}
              onClick={() => onOpenBoard(b.id)}
              className="group relative flex flex-col bg-white border border-black/[0.07] hover:border-black/20 rounded-lg overflow-hidden transition-all duration-150 cursor-pointer active:scale-[0.99]"
            >
              {/* Clean Preview Header */}
              <div className="w-full h-32 bg-[#fafaf9] border-b border-black/[0.04] relative flex items-center justify-center overflow-hidden">
                {b.pdfPages && b.pdfPages[0] ? (
                  <img
                    src={b.pdfPages[0].dataUrl}
                    alt=""
                    className="w-full h-full object-cover object-top opacity-90"
                  />
                ) : (
                  <div className="w-12 h-16 bg-white border border-black/[0.08] rounded shadow-[0_1px_3px_rgba(0,0,0,0.02)]" />
                )}
              </div>

              {/* Title row */}
              <div className="p-2.5 flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-800 truncate pr-2">
                  {b.title || 'Untitled'}
                </span>

                {boards.length > 1 && (
                  <button
                    type="button"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      boardCatalog.deleteBoard(b.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-black/[0.06] text-neutral-400 hover:text-red-600 transition-all cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
