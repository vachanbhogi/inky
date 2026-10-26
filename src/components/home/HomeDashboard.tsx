import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { boardCatalog, type BoardItem, type PaperStyle } from '../../lib/document/boardCatalog'
import { renderPdfToPages } from '../../lib/pdf/pdfImporter'
import { InkyLogo } from '../common/InkyLogo'

interface HomeDashboardProps {
  onOpenBoard: (boardId: string) => void
}

interface TemplateOption {
  id: string
  title: string
  type: 'infinite' | 'worksheet'
  paperStyle: PaperStyle
  isPdfUpload?: boolean
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'infinite',
    title: 'Infinite',
    type: 'infinite',
    paperStyle: 'blank',
  },
  {
    id: 'page-blank',
    title: 'Blank Page',
    type: 'infinite',
    paperStyle: 'blank',
  },
  {
    id: 'page-graph',
    title: 'Graph Paper',
    type: 'infinite',
    paperStyle: 'graph',
  },
  {
    id: 'page-binder',
    title: 'Binder Paper',
    type: 'infinite',
    paperStyle: 'lined',
  },
  {
    id: 'import-pdf',
    title: 'Import PDF',
    type: 'worksheet',
    paperStyle: 'blank',
    isPdfUpload: true,
  },
]

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

  const handleSelectTemplate = (template: TemplateOption) => {
    if (template.isPdfUpload) {
      fileInputRef.current?.click()
      return
    }

    const newBoard = boardCatalog.createBoard(
      template.type,
      template.title,
      undefined,
      template.paperStyle,
    )
    onOpenBoard(newBoard.id)
  }

  const handleProcessPdfFile = async (file: File) => {
    if (!file || file.type !== 'application/pdf') return
    try {
      const buffer = await file.arrayBuffer()
      const pages = await renderPdfToPages(buffer)
      if (pages.length > 0) {
        const title = file.name.replace(/\.pdf$/i, '')
        const board = boardCatalog.createBoard('worksheet', title, pages, 'blank')
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

      {/* Main container */}
      <div className="w-full max-w-4xl px-8 py-16 flex flex-col">
        {/* Header with Editorial Wordmark */}
        <header className="flex items-center justify-between mb-10 pb-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <InkyLogo size={24} />
            <span
              className="text-2xl font-serif tracking-tight text-[#111111]"
              style={{ fontFamily: "'Newsreader', 'Instrument Serif', 'Times New Roman', serif" }}
            >
              Inky
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleSelectTemplate(TEMPLATES[0])}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#111111] text-white hover:bg-neutral-800 text-xs font-medium transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        </header>

        {/* Start a new document (Google Docs style gallery) */}
        <section className="mb-14">
          <h2 className="text-xs font-semibold text-neutral-400 mb-3.5 tracking-wide">
            Start a new document
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tmpl)}
                className="group flex flex-col items-center text-left transition-all active:scale-[0.98] cursor-pointer"
              >
                {/* 8.5x11 Miniature Sheet Preview */}
                <div className="w-full aspect-[8.5/11] bg-white border border-black/[0.08] group-hover:border-black/30 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.02)] group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] relative overflow-hidden flex items-center justify-center transition-all p-2.5 mb-2">
                  {tmpl.id === 'infinite' && (
                    <div className="w-full h-full relative flex items-center justify-center">
                      <div className="absolute inset-0 bg-[radial-gradient(#d1d1d6_1px,transparent_1px)] [background-size:8px_8px] opacity-70" />
                      <div className="w-8 h-8 rounded-full border border-black/15 flex items-center justify-center bg-white/90 shadow-xs z-10">
                        <span className="text-base text-neutral-600 font-serif">∞</span>
                      </div>
                    </div>
                  )}

                  {tmpl.id === 'page-blank' && (
                    <div className="w-full h-full bg-white border border-black/[0.04] rounded flex flex-col justify-between p-2">
                      <div className="space-y-1.5">
                        <div className="h-1 w-2/3 bg-black/10 rounded-full" />
                        <div className="h-1 w-full bg-black/5 rounded-full" />
                        <div className="h-1 w-4/5 bg-black/5 rounded-full" />
                      </div>
                      <div className="h-1 w-1/3 bg-black/5 rounded-full self-end" />
                    </div>
                  )}

                  {tmpl.id === 'page-graph' && (
                    <div className="w-full h-full bg-white relative overflow-hidden rounded border border-black/[0.04]">
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:6px_6px]" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-7 h-7 border-l-2 border-b-2 border-blue-500/40" />
                      </div>
                    </div>
                  )}

                  {tmpl.id === 'page-binder' && (
                    <div className="w-full h-full bg-white relative overflow-hidden rounded border border-black/[0.04] flex flex-col justify-between py-2">
                      {/* Red margin line */}
                      <div className="absolute left-3 top-0 bottom-0 w-[1px] bg-red-400/40" />
                      {/* Horizontal lined rules */}
                      <div className="w-full space-y-2 pl-4 pr-1">
                        <div className="h-[1px] w-full bg-blue-300/30" />
                        <div className="h-[1px] w-full bg-blue-300/30" />
                        <div className="h-[1px] w-full bg-blue-300/30" />
                        <div className="h-[1px] w-full bg-blue-300/30" />
                        <div className="h-[1px] w-full bg-blue-300/30" />
                      </div>
                    </div>
                  )}

                  {tmpl.id === 'import-pdf' && (
                    <div className="w-full h-full bg-neutral-50/70 border border-dashed border-neutral-300 group-hover:border-neutral-500 rounded flex flex-col items-center justify-center p-2 text-center transition-colors">
                      <div className="w-7 h-7 rounded-md bg-white border border-black/8 flex items-center justify-center text-neutral-600 mb-1 shadow-xs">
                        <Plus size={14} />
                      </div>
                      <span className="text-[10px] text-neutral-500 font-medium">Drop PDF</span>
                    </div>
                  )}
                </div>

                {/* Caption */}
                <span className="text-xs font-medium text-neutral-800 text-center truncate w-full">
                  {tmpl.title}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent documents */}
        <section>
          <h2 className="text-xs font-semibold text-neutral-400 mb-3.5 tracking-wide">
            Recent
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
            {boards.map((b) => (
              <div
                key={b.id}
                onClick={() => onOpenBoard(b.id)}
                className="group relative flex flex-col bg-white border border-black/[0.07] hover:border-black/20 rounded-lg overflow-hidden transition-all duration-150 cursor-pointer active:scale-[0.99]"
              >
                {/* Thumbnail Header */}
                <div className="w-full aspect-[4/3] bg-[#fafaf9] border-b border-black/[0.04] relative flex items-center justify-center overflow-hidden">
                  {b.pdfPages && b.pdfPages[0] ? (
                    <img
                      src={b.pdfPages[0].dataUrl}
                      alt=""
                      className="w-full h-full object-cover object-top opacity-90"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-white border border-black/[0.08] rounded shadow-[0_1px_3px_rgba(0,0,0,0.02)]" />
                  )}
                </div>

                {/* Info row */}
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
        </section>
      </div>
    </div>
  )
}
