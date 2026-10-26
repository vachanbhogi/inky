import { useState, useRef, useEffect } from 'react'
import { FileUp, Plus, Trash2, X } from 'lucide-react'
import {
  boardCatalog,
  type BoardItem,
  type DocumentType,
  type PaperStyle,
} from '../../lib/document/boardCatalog'
import { generateStrokePath } from '../../lib/canvas/svg-utils'
import { renderPdfToPages } from '../../lib/pdf/pdfImporter'
import { InkyLogo } from '../common/InkyLogo'

interface HomeDashboardProps {
  onOpenBoard: (boardId: string) => void
}

interface TemplateOption {
  id: string
  title: string
  defaultName: string
  paperStyle: PaperStyle
  isPdfUpload?: boolean
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'blank',
    title: 'Blank',
    defaultName: 'Blank Note',
    paperStyle: 'blank',
  },
  {
    id: 'dotted',
    title: 'Dotted',
    defaultName: 'Dotted Note',
    paperStyle: 'dot-grid',
  },
  {
    id: 'graph',
    title: 'Graph Paper',
    defaultName: 'Graph Homework',
    paperStyle: 'graph',
  },
  {
    id: 'lined',
    title: 'Binder Paper',
    defaultName: 'Class Notes',
    paperStyle: 'lined',
  },
  {
    id: 'import-pdf',
    title: 'Import PDF',
    defaultName: 'Worksheet',
    paperStyle: 'blank',
    isPdfUpload: true,
  },
]

function PaperPatternSurface({ style }: { style: PaperStyle }) {
  if (style === 'dot-grid') {
    return (
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.24) 1px, transparent 1px)',
          backgroundSize: '10px 10px',
          backgroundPosition: '5px 5px',
        }}
      />
    )
  }

  if (style === 'graph') {
    return (
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(30, 41, 59, 0.14) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(30, 41, 59, 0.14) 1px, transparent 1px),
            linear-gradient(to right, rgba(30, 41, 59, 0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(30, 41, 59, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px, 40px 40px, 8px 8px, 8px 8px',
        }}
      />
    )
  }

  if (style === 'lined') {
    return (
      <div className="absolute inset-0 overflow-hidden">
        {/* Top header band */}
        <div
          className="absolute inset-x-0 top-5 bottom-0"
          style={{
            backgroundImage: 'linear-gradient(to bottom, rgba(37, 99, 235, 0.18) 1px, transparent 1px)',
            backgroundSize: '100% 11px',
          }}
        />
        {/* Red vertical margin line */}
        <div className="absolute top-0 bottom-0 left-5 w-[1px] bg-red-400/45" />
      </div>
    )
  }

  return null
}

function BoardThumbnailPreview({ board }: { board: BoardItem }) {
  const style = board.paperStyle ?? 'blank'

  if (board.pdfPages && board.pdfPages[0]) {
    return (
      <div className="w-full h-full bg-[#f4f3ef] flex items-center justify-center p-3 overflow-hidden">
        <div className="relative h-full aspect-[8.5/11] bg-white rounded-[4px] shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-black/[0.08] overflow-hidden">
          <img
            src={board.pdfPages[0].dataUrl}
            alt=""
            className="w-full h-full object-cover object-top"
          />
        </div>
      </div>
    )
  }

  // Compute bounding box of strokes if any exist so we can render live miniature ink
  const hasStrokes = board.strokes && board.strokes.length > 0
  let viewBox = '-300 60 600 450'
  if (hasStrokes) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const s of board.strokes) {
      if (!s.boundingBox) continue
      if (s.boundingBox.minX < minX) minX = s.boundingBox.minX
      if (s.boundingBox.minY < minY) minY = s.boundingBox.minY
      if (s.boundingBox.maxX > maxX) maxX = s.boundingBox.maxX
      if (s.boundingBox.maxY > maxY) maxY = s.boundingBox.maxY
    }
    if (Number.isFinite(minX) && Number.isFinite(minY)) {
      const pad = 48
      const w = Math.max(240, maxX - minX + pad * 2)
      const h = Math.max(180, maxY - minY + pad * 2)
      viewBox = `${minX - pad} ${minY - pad} ${w} ${h}`
    }
  }

  const inkOverlay = hasStrokes ? (
    <svg
      viewBox={viewBox}
      className="absolute inset-0 w-full h-full pointer-events-none p-2"
      preserveAspectRatio="xMidYMid meet"
    >
      {board.strokes.slice(0, 60).map((s) => {
        const d = s.pathData ?? generateStrokePath(s.points, s.size)
        if (!d) return null
        return <path key={s.id} d={d} fill={s.color || '#111111'} />
      })}
    </svg>
  ) : null

  if (board.type === 'worksheet') {
    // Framed 8.5x11 sheet on desk
    return (
      <div className="w-full h-full bg-[#f3f2ee] flex items-center justify-center p-3 overflow-hidden">
        <div className="relative h-full aspect-[8.5/11] bg-white rounded-[4px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-black/[0.08] overflow-hidden">
          <PaperPatternSurface style={style} />
          {inkOverlay}
        </div>
      </div>
    )
  }

  // Open Pageless surface
  return (
    <div className="relative w-full h-full bg-white overflow-hidden">
      <PaperPatternSurface style={style} />
      {inkOverlay}
    </div>
  )
}

export function HomeDashboard({ onOpenBoard }: HomeDashboardProps) {
  const [boards, setBoards] = useState<BoardItem[]>(boardCatalog.boards)
  const [isDragging, setIsDragging] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<TemplateOption | null>(null)
  const [docName, setDocName] = useState('')
  const [docLayout, setDocLayout] = useState<'page' | 'pageless'>('page')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = boardCatalog.subscribe(() => {
      setBoards([...boardCatalog.boards])
    })
    return unsub
  }, [])

  useEffect(() => {
    if (pendingTemplate) {
      setDocName('')
      setDocLayout('page')
      setTimeout(() => {
        nameInputRef.current?.focus()
      }, 20)
    }
  }, [pendingTemplate])

  const handleSelectTemplate = (template: TemplateOption) => {
    if (template.isPdfUpload) {
      fileInputRef.current?.click()
      return
    }
    setPendingTemplate(template)
  }

  const handleConfirmCreate = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!pendingTemplate) return

    const finalTitle = docName.trim() || pendingTemplate.defaultName
    const docType: DocumentType = docLayout === 'page' ? 'worksheet' : 'infinite'
    const newBoard = boardCatalog.createBoard(
      docType,
      finalTitle,
      undefined,
      pendingTemplate.paperStyle,
    )
    setPendingTemplate(null)
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
        <div className="absolute inset-4 z-50 bg-white/95 border border-black/15 rounded-2xl flex flex-col items-center justify-center pointer-events-none">
          <p className="text-sm font-medium text-neutral-800">Drop PDF to open</p>
        </div>
      )}

      {/* Lightweight Name + Page/Pageless Setup Dialog */}
      {pendingTemplate && (
        <div
          onClick={() => setPendingTemplate(null)}
          className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmCreate}
            className="w-full max-w-sm bg-white border border-black/[0.08] rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.12)] p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-9 rounded border border-black/12 bg-white relative overflow-hidden shrink-0 shadow-2xs">
                  <PaperPatternSurface style={pendingTemplate.paperStyle} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#111111]">
                    New {pendingTemplate.title}
                  </h3>
                  <p className="text-[11px] text-neutral-400">Name it and pick a style</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingTemplate(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-black/5 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Name input */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inky-note-name" className="text-[11px] font-medium text-neutral-500">
                Name
              </label>
              <input
                id="inky-note-name"
                ref={nameInputRef}
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder={pendingTemplate.defaultName}
                className="w-full px-3 py-2 text-sm bg-[#fbfbfa] border border-black/10 rounded-xl text-[#111111] placeholder:text-neutral-400 focus:outline-none focus:border-[#111111] transition-colors"
              />
            </div>

            {/* Page vs Pageless selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-neutral-500">Format</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDocLayout('page')}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    docLayout === 'page'
                      ? 'border-[#111111] bg-neutral-900/[0.03] shadow-2xs'
                      : 'border-black/10 hover:border-black/25'
                  }`}
                >
                  {/* Mini Page sheet icon */}
                  <div className="w-6 h-8 rounded-[3px] bg-white border border-black/20 shadow-2xs shrink-0 relative overflow-hidden">
                    <PaperPatternSurface style={pendingTemplate.paperStyle} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#111111]">Page</div>
                    <div className="text-[10px] text-neutral-400 leading-tight">Sheet of paper</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDocLayout('pageless')}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    docLayout === 'pageless'
                      ? 'border-[#111111] bg-neutral-900/[0.03] shadow-2xs'
                      : 'border-black/10 hover:border-black/25'
                  }`}
                >
                  {/* Mini Pageless open space icon */}
                  <div className="w-7 h-7 rounded-md bg-white border border-dashed border-black/25 shrink-0 relative overflow-hidden">
                    <PaperPatternSurface style={pendingTemplate.paperStyle} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#111111]">Pageless</div>
                    <div className="text-[10px] text-neutral-400 leading-tight">Open space</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingTemplate(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:bg-black/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-[#111111] text-white hover:bg-neutral-800 text-xs font-medium transition-all active:scale-95 cursor-pointer"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main container */}
      <div className="w-full max-w-4xl px-8 py-14 flex flex-col">
        {/* Header with Playful Squid Mark & Rounded Wordmark */}
        <header className="flex items-center justify-between mb-10 pb-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <InkyLogo size={28} />
            <span
              className="text-[22px] font-bold tracking-[-0.03em] text-[#111111]"
              style={{
                fontFamily:
                  "'ui-rounded', 'SF Pro Rounded', 'Nunito', 'Plus Jakarta Sans', system-ui, sans-serif",
              }}
            >
              inky
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

        {/* Start a new document */}
        <section className="mb-12">
          <h2 className="text-xs font-medium text-neutral-400 mb-3.5">New note</h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tmpl)}
                className="group flex flex-col items-start text-left transition-all active:scale-[0.98] cursor-pointer"
              >
                {/* Authentic 8.5x11 Sheet Preview */}
                <div className="w-full aspect-[8.5/11] bg-white border border-black/[0.09] group-hover:border-black/30 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)] relative overflow-hidden transition-all mb-2.5">
                  {!tmpl.isPdfUpload ? (
                    <>
                      <PaperPatternSurface style={tmpl.paperStyle} />
                      {/* Subtle folded corner / top sheen */}
                      <div className="absolute inset-0 ring-1 ring-inset ring-black/[0.03] rounded-xl pointer-events-none" />
                    </>
                  ) : (
                    <div className="w-full h-full bg-[#fafaf9] flex flex-col items-center justify-center p-3 text-center">
                      <div className="w-9 h-9 rounded-xl bg-white border border-black/[0.08] shadow-2xs flex items-center justify-center text-neutral-700 mb-2 group-hover:scale-105 transition-transform">
                        <FileUp size={16} />
                      </div>
                      <span className="text-[11px] font-medium text-neutral-600">Upload PDF</span>
                      <span className="text-[9px] text-neutral-400 mt-0.5">or drag & drop</span>
                    </div>
                  )}
                </div>

                {/* Caption */}
                <span className="text-xs font-medium text-neutral-800 pl-0.5">{tmpl.title}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent documents */}
        {boards.length > 0 && (
          <section>
            <h2 className="text-xs font-medium text-neutral-400 mb-3.5">Recent</h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {boards.map((b) => (
                <div
                  key={b.id}
                  onClick={() => onOpenBoard(b.id)}
                  className="group relative flex flex-col bg-white border border-black/[0.08] hover:border-black/25 rounded-xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.02)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition-all duration-150 cursor-pointer active:scale-[0.99]"
                >
                  {/* Authentic Paper + Live Ink Thumbnail */}
                  <div className="w-full aspect-[4/3] border-b border-black/[0.05] relative overflow-hidden">
                    <BoardThumbnailPreview board={b} />
                  </div>

                  {/* Info row */}
                  <div className="px-3 py-2.5 flex items-center justify-between bg-white">
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-medium text-neutral-800 truncate">
                        {b.title || 'Untitled'}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        {b.pdfPages && b.pdfPages.length > 0
                          ? `PDF · ${b.pdfPages.length}p`
                          : b.type === 'worksheet'
                            ? 'Page'
                            : 'Pageless'}
                      </div>
                    </div>

                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        boardCatalog.deleteBoard(b.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-black/[0.06] text-neutral-400 hover:text-red-600 transition-all cursor-pointer shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
