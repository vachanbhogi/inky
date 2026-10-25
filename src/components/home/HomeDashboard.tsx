import { useState, useRef, useEffect } from 'react'
import { Plus, Upload, FileText, Trash2, Clock } from 'lucide-react'
import { boardCatalog, type BoardItem } from '../../lib/document/boardCatalog'
import { renderPdfToPages } from '../../lib/pdf/pdfImporter'

interface HomeDashboardProps {
  onOpenBoard: (boardId: string) => void
}

export function HomeDashboard({ onOpenBoard }: HomeDashboardProps) {
  const [boards, setBoards] = useState<BoardItem[]>(boardCatalog.boards)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessingPdf, setIsProcessingPdf] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = boardCatalog.subscribe(() => {
      setBoards([...boardCatalog.boards])
    })
    return unsub
  }, [])

  const handleCreateBlankBoard = () => {
    const newBoard = boardCatalog.createBoard('infinite', 'Scratch Board')
    onOpenBoard(newBoard.id)
  }

  const handleProcessPdfFile = async (file: File) => {
    if (!file || file.type !== 'application/pdf') return
    try {
      setIsProcessingPdf(true)
      const buffer = await file.arrayBuffer()
      const pages = await renderPdfToPages(buffer)
      if (pages.length > 0) {
        const title = file.name.replace(/\.pdf$/i, '')
        const board = boardCatalog.createBoard('worksheet', title, pages)
        onOpenBoard(board.id)
      }
    } catch (err) {
      console.error('Error importing PDF:', err)
    } finally {
      setIsProcessingPdf(false)
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

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="relative w-screen h-screen overflow-y-auto bg-[#fbfbfa] text-[#111111] flex flex-col items-center selection:bg-neutral-200"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center border-2 border-dashed border-[#111111]/30 m-4 rounded-3xl animate-in fade-in duration-150">
          <Upload size={48} className="text-[#111111] animate-bounce mb-3" />
          <h2 className="text-xl font-medium tracking-tight">Drop your homework PDF here</h2>
          <p className="text-sm text-neutral-500 mt-1">We'll open it as a ready-to-write worksheet</p>
        </div>
      )}

      {/* Main container */}
      <div className="w-full max-w-5xl px-8 py-16 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-xl bg-[#111111] flex items-center justify-center text-white font-bold text-sm shadow-sm">
              i
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Inky</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingPdf}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-black/8 hover:border-black/15 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-sm font-medium transition-all active:scale-95 cursor-pointer"
            >
              <Upload size={15} />
              <span>{isProcessingPdf ? 'Opening PDF…' : 'Upload PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleCreateBlankBoard}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] text-white hover:bg-black shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-sm font-medium transition-all active:scale-95 cursor-pointer"
            >
              <Plus size={16} />
              <span>New Board</span>
            </button>
          </div>
        </header>

        {/* Quick Start Section */}
        <section className="mb-14">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-4">
            Start fresh
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Blank Infinite Board */}
            <div
              onClick={handleCreateBlankBoard}
              className="group p-5 bg-white border border-black/8 hover:border-black/20 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all cursor-pointer flex flex-col justify-between h-40 active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-800 group-hover:bg-[#111111] group-hover:text-white transition-colors">
                <Plus size={20} />
              </div>
              <div>
                <h3 className="font-medium text-sm">Blank Board</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Infinite math scratchpad</p>
              </div>
            </div>

            {/* Dropzone Card */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group p-5 bg-neutral-50 border border-dashed border-neutral-300 hover:border-neutral-800 rounded-2xl transition-all cursor-pointer flex flex-col justify-between h-40 active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-xl bg-white border border-black/8 flex items-center justify-center text-neutral-800 group-hover:bg-[#111111] group-hover:text-white transition-colors">
                <Upload size={18} />
              </div>
              <div>
                <h3 className="font-medium text-sm">Import Worksheet</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Drag & drop or select a PDF</p>
              </div>
            </div>
          </div>
        </section>

        {/* Recent Homework & Boards */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-4">
            Recent Work
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {boards.map((b) => (
              <div
                key={b.id}
                onClick={() => onOpenBoard(b.id)}
                className="group relative bg-white border border-black/8 hover:border-black/20 rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all cursor-pointer flex flex-col"
              >
                {/* Visual Thumbnail */}
                <div className="w-full h-36 bg-[#f4f4f2] border-b border-black/5 relative flex items-center justify-center overflow-hidden">
                  {b.pdfPages && b.pdfPages[0] ? (
                    <img
                      src={b.pdfPages[0].dataUrl}
                      alt={b.title}
                      className="w-full h-full object-cover opacity-90 group-hover:scale-102 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 text-neutral-400">
                      <FileText size={24} />
                      <span className="text-[11px]">Infinite Canvas</span>
                    </div>
                  )}

                  {/* Badge */}
                  {b.type === 'worksheet' && (
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-white/90 backdrop-blur-md text-[10px] font-semibold text-neutral-700 shadow-xs">
                      PDF
                    </span>
                  )}
                </div>

                {/* Info row */}
                <div className="p-3.5 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <h4 className="text-xs font-semibold truncate text-[#111111]">{b.title}</h4>
                    <span className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
                      <Clock size={10} />
                      {formatDate(b.updatedAt)}
                    </span>
                  </div>

                  {boards.length > 1 && (
                    <button
                      type="button"
                      title="Delete Board"
                      onClick={(e) => {
                        e.stopPropagation()
                        boardCatalog.deleteBoard(b.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-red-600 transition-all cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
