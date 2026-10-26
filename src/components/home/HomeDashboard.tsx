import { useState, useRef, useEffect } from 'react'
import { FileUp, Plus, Trash2 } from 'lucide-react'
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
          backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.28) 1.15px, transparent 1.15px)',
          backgroundSize: '12px 12px',
          backgroundPosition: '6px 6px',
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
            linear-gradient(to right, rgba(30, 41, 59, 0.16) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(30, 41, 59, 0.16) 1px, transparent 1px),
            linear-gradient(to right, rgba(30, 41, 59, 0.065) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(30, 41, 59, 0.065) 1px, transparent 1px)
          `,
          backgroundSize: '45px 45px, 45px 45px, 9px 9px, 9px 9px',
        }}
      />
    )
  }

  if (style === 'lined') {
    return (
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-x-0 top-6 bottom-0"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, rgba(37, 99, 235, 0.2) 1px, transparent 1px)',
            backgroundSize: '100% 13px',
          }}
        />
        <div className="absolute top-0 bottom-0 left-6 w-[1px] bg-red-400/50" />
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
        <div className="relative h-full aspect-[8.5/11] bg-white rounded-[6px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] border border-black/[0.08] overflow-hidden">
          <img
            src={board.pdfPages[0].dataUrl}
            alt=""
            className="w-full h-full object-cover object-top"
          />
        </div>
      </div>
    )
  }

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
    return (
      <div className="w-full h-full bg-[#f3f2ee] flex items-center justify-center p-3 overflow-hidden">
        <div className="relative h-full aspect-[8.5/11] bg-white rounded-[6px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] border border-black/[0.08] overflow-hidden">
          <PaperPatternSurface style={style} />
          {inkOverlay}
        </div>
      </div>
    )
  }

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
  const [setupStep, setSetupStep] = useState<'layout' | 'name'>('layout')
  const [docLayout, setDocLayout] = useState<'page' | 'pageless'>('page')
  const [docName, setDocName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = boardCatalog.subscribe(() => {
      setBoards([...boardCatalog.boards])
    })
    return unsub
  }, [])

  // Focus input when entering name step
  useEffect(() => {
    if (pendingTemplate && setupStep === 'name') {
      const id = setTimeout(() => {
        nameInputRef.current?.focus()
      }, 15)
      return () => clearTimeout(id)
    }
  }, [pendingTemplate, setupStep])

  // Keyboard shortcuts for integrated bar (Esc, Enter, ArrowLeft/Right, 1/2)
  useEffect(() => {
    if (!pendingTemplate) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setPendingTemplate(null)
        return
      }

      if (setupStep === 'layout') {
        if (e.key === 'ArrowLeft' || e.key === '1') {
          e.preventDefault()
          setDocLayout('page')
          return
        }
        if (e.key === 'ArrowRight' || e.key === '2') {
          e.preventDefault()
          setDocLayout('pageless')
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          setSetupStep('name')
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingTemplate, setupStep])

  const handleSelectTemplate = (template: TemplateOption) => {
    if (template.isPdfUpload) {
      fileInputRef.current?.click()
      return
    }
    setPendingTemplate(template)
    setSetupStep('layout')
    setDocLayout('page')
    setDocName('')
  }

  const handlePickLayout = (layout: 'page' | 'pageless') => {
    setDocLayout(layout)
    setSetupStep('name')
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
        <div className="absolute inset-4 z-50 bg-white/95 border border-black/10 rounded-2xl flex flex-col items-center justify-center pointer-events-none">
          <p className="text-sm font-medium text-neutral-800">Drop PDF</p>
        </div>
      )}

      {/* Main container */}
      <div className="w-full max-w-5xl px-8 py-10 flex flex-col">
        {/* Header with Playful Squid Mark & Rounded Wordmark */}
        <header className="flex items-center justify-between mb-8 pb-3.5 border-b border-black/[0.06]">
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
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#111111] text-white hover:bg-neutral-800 text-xs font-medium transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        </header>

        {/* Template Gallery + Integrated Toolbar-Style Setup */}
        <section className="mb-10 flex flex-col">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-5">
            {TEMPLATES.map((tmpl) => {
              const isSelected = pendingTemplate?.id === tmpl.id
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tmpl)}
                  className="group flex flex-col items-start text-left transition-all active:scale-[0.98] cursor-pointer"
                >
                  {/* Large, toolbar-styled 8.5x11 Sheet Preview */}
                  <div
                    className={`w-full aspect-[8.5/11] bg-white rounded-2xl relative overflow-hidden transition-all duration-150 mb-2.5 ${
                      isSelected
                        ? 'border-2 border-[#111111] shadow-[0_8px_30px_rgb(0,0,0,0.08)]'
                        : 'border border-black/8 group-hover:border-black/25 shadow-[0_8px_30px_rgb(0,0,0,0.04)] group-hover:shadow-[0_12px_36px_rgb(0,0,0,0.08)]'
                    }`}
                  >
                    {!tmpl.isPdfUpload ? (
                      <PaperPatternSurface style={tmpl.paperStyle} />
                    ) : (
                      <div className="w-full h-full bg-[#fafaf9] flex flex-col items-center justify-center p-4 text-center">
                        <div className="w-10 h-10 rounded-xl bg-white border border-black/8 shadow-[0_4px_12px_rgb(0,0,0,0.04)] flex items-center justify-center text-[#111111] mb-2 group-hover:scale-105 transition-transform">
                          <FileUp size={18} />
                        </div>
                        <span className="text-xs font-medium text-[#111111]">PDF</span>
                      </div>
                    )}
                  </div>

                  {/* Caption */}
                  <span className="text-xs font-medium text-[#111111] pl-1">{tmpl.title}</span>
                </button>
              )
            })}
          </div>

          {/* Integrated One-Question-at-a-Time Command Pill (Toolbar Aesthetic) */}
          {pendingTemplate && (
            <div className="mt-6 flex justify-center">
              {setupStep === 'layout' ? (
                <div
                  role="region"
                  aria-label="Choose format"
                  className="inline-flex items-center gap-1.5 p-1.5 bg-white/95 backdrop-blur-xl border border-black/8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
                >
                  <button
                    type="button"
                    onClick={() => handlePickLayout('page')}
                    className={`px-4 py-2 rounded-xl text-xs font-medium transition-all duration-150 active:scale-95 cursor-pointer ${
                      docLayout === 'page'
                        ? 'bg-[#111111] text-white shadow-xs'
                        : 'text-[#111111] hover:bg-black/5'
                    }`}
                  >
                    Page
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePickLayout('pageless')}
                    className={`px-4 py-2 rounded-xl text-xs font-medium transition-all duration-150 active:scale-95 cursor-pointer ${
                      docLayout === 'pageless'
                        ? 'bg-[#111111] text-white shadow-xs'
                        : 'text-[#111111] hover:bg-black/5'
                    }`}
                  >
                    Pageless
                  </button>
                  <div className="w-[1px] h-4 bg-black/8 mx-1" />
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-[#787774] bg-[#f7f6f3] border border-[#eaeaea] rounded">
                    Esc
                  </kbd>
                </div>
              ) : (
                <form
                  onSubmit={handleConfirmCreate}
                  className="inline-flex items-center gap-2 p-1.5 pl-3.5 bg-white/95 backdrop-blur-xl border border-black/8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
                >
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder={pendingTemplate.defaultName}
                    aria-label="Note name"
                    className="w-48 text-xs font-medium bg-transparent text-[#111111] placeholder:text-[#787774]/60 outline-none focus:outline-none focus-visible:outline-none border-none"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#111111] text-white hover:bg-neutral-800 text-xs font-medium transition-all active:scale-95 cursor-pointer"
                  >
                    <span>Create</span>
                    <kbd className="px-1 py-0.2 text-[10px] font-mono text-white/80 bg-white/15 rounded">
                      ↵
                    </kbd>
                  </button>
                  <kbd
                    onClick={() => setPendingTemplate(null)}
                    className="px-1.5 py-0.5 text-[10px] font-mono text-[#787774] bg-[#f7f6f3] border border-[#eaeaea] rounded cursor-pointer hover:text-[#111111]"
                  >
                    Esc
                  </kbd>
                </form>
              )}
            </div>
          )}
        </section>

        {/* Recent documents */}
        {boards.length > 0 && (
          <section>
            <h2 className="text-xs font-medium text-[#787774] mb-3.5">Recent</h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
              {boards.map((b) => (
                <div
                  key={b.id}
                  onClick={() => onOpenBoard(b.id)}
                  className="group relative flex flex-col bg-white border border-black/8 hover:border-black/25 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_36px_rgb(0,0,0,0.08)] transition-all duration-150 cursor-pointer active:scale-[0.99]"
                >
                  {/* Authentic Paper + Live Ink Thumbnail */}
                  <div className="w-full aspect-[4/3] border-b border-black/[0.05] relative overflow-hidden">
                    <BoardThumbnailPreview board={b} />
                  </div>

                  {/* Minimal Info row */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between bg-white">
                    <span className="text-xs font-medium text-[#111111] truncate pr-2">
                      {b.title || 'Untitled'}
                    </span>

                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        boardCatalog.deleteBoard(b.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-black/5 text-[#787774] hover:text-red-600 transition-all cursor-pointer shrink-0"
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
