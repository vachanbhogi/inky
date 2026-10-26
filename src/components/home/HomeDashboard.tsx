import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, ArrowRight, FileUp, Plus, Trash2 } from 'lucide-react'
import {
  boardCatalog,
  type BoardItem,
  type DocumentType,
  type PaperStyle,
} from '../../lib/document/boardCatalog'
import { generateStrokePath } from '../../lib/canvas/svg-utils'
import { extractDroppedPdfFile, hasDraggedFiles, renderPdfToPages } from '../../lib/pdf/pdfImporter'
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
    const firstPage = board.pdfPages[0]
    const pageW = firstPage.width || 816
    const pageH = firstPage.height || 1056
    const hasStrokesOnPdf = board.strokes && board.strokes.length > 0
    return (
      <div className="w-full h-full bg-[#f4f3ef] flex items-center justify-center p-4 overflow-hidden">
        <div className="relative h-full aspect-[8.5/11] bg-white rounded-md shadow-[0_2px_10px_rgba(0,0,0,0.06)] border border-black/8 overflow-hidden">
          <img
            src={firstPage.dataUrl}
            alt=""
            className="w-full h-full object-cover object-top"
          />
          {hasStrokesOnPdf && (
            <svg
              viewBox={`${-pageW / 2} 80 ${pageW} ${pageH}`}
              className="absolute inset-0 w-full h-full pointer-events-none"
              preserveAspectRatio="none"
            >
              {board.strokes.slice(0, 60).map((s) => {
                const d = s.pathData ?? generateStrokePath(s.points, s.size)
                if (!d) return null
                return <path key={s.id} d={d} fill={s.color || '#111111'} />
              })}
            </svg>
          )}
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
      <div className="w-full h-full bg-[#f3f2ee] flex items-center justify-center p-4 overflow-hidden">
        <div className="relative h-full aspect-[8.5/11] bg-white rounded-md shadow-[0_2px_10px_rgba(0,0,0,0.06)] border border-black/8 overflow-hidden">
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
  const [isImportingPdf, setIsImportingPdf] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)

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

  // Keyboard shortcuts for dialog (Esc, Enter, ArrowLeft/Right, 1/2)
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
    if (!file) return
    try {
      setIsImportingPdf(true)
      const buffer = await file.arrayBuffer()
      const pages = await renderPdfToPages(buffer)
      if (pages.length > 0) {
        const title = file.name.replace(/\.pdf$/i, '') || 'Worksheet'
        const board = boardCatalog.createBoard('worksheet', title, pages, 'blank')
        onOpenBoard(board.id)
      }
    } catch (err) {
      console.error('Failed to import PDF:', err)
    } finally {
      setIsImportingPdf(false)
    }
  }

  // Also bind window-level dragover/drop so dropping anywhere in the viewport is 100% intercepted
  // and the browser never navigates away to its built-in PDF viewer.
  useEffect(() => {
    const onWinDragEnter = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return
      e.preventDefault()
      dragDepthRef.current += 1
      setIsDragging(true)
    }
    const onWinDragOver = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
      setIsDragging(true)
    }
    const onWinDragLeave = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return
      e.preventDefault()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0 || (e.clientX <= 0 && e.clientY <= 0)) {
        dragDepthRef.current = 0
        setIsDragging(false)
      }
    }
    const onWinDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepthRef.current = 0
      setIsDragging(false)
      const file = extractDroppedPdfFile(e.dataTransfer)
      if (file) {
        void handleProcessPdfFile(file)
      }
    }

    window.addEventListener('dragenter', onWinDragEnter)
    window.addEventListener('dragover', onWinDragOver)
    window.addEventListener('dragleave', onWinDragLeave)
    window.addEventListener('drop', onWinDrop)
    return () => {
      window.removeEventListener('dragenter', onWinDragEnter)
      window.removeEventListener('dragover', onWinDragOver)
      window.removeEventListener('dragleave', onWinDragLeave)
      window.removeEventListener('drop', onWinDrop)
    }
  })

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = 0
    setIsDragging(false)
    const file = extractDroppedPdfFile(e.dataTransfer)
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
      onDragEnter={(e) => {
        if (!hasDraggedFiles(e.dataTransfer)) return
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragOver={(e) => {
        if (!hasDraggedFiles(e.dataTransfer)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setIsDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          dragDepthRef.current = 0
          setIsDragging(false)
        }
      }}
      onDrop={handleDrop}
      className="relative w-screen h-screen overflow-y-auto bg-[#fbfbfa] text-[#111111] flex flex-col items-center select-none"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="sr-only"
        onChange={handleFileSelect}
      />

      {/* Drag drop curtain */}
      {isDragging && (
        <div className="absolute inset-4 z-50 bg-white/95 border border-black/10 rounded-xl flex flex-col items-center justify-center pointer-events-none">
          <p className="text-sm font-medium text-[#111111]">Drop PDF</p>
        </div>
      )}

      {/* Seamless Floating Island Setup Dialog */}
      {pendingTemplate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`New ${pendingTemplate.title}`}
          className="inky-ui fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          {/* Calm Backdrop (clean dim without blur) */}
          <button
            type="button"
            aria-label="Close dialog"
            onClick={() => setPendingTemplate(null)}
            className="fixed inset-0 bg-black/20 cursor-default w-full h-full border-none p-0 m-0"
          />

          <div
            className="relative z-10 w-full max-w-[460px] h-[310px] bg-white border border-black/8 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.08)] px-8 py-6 overflow-hidden flex flex-col justify-center"
            style={{
              animation: 'modalSlideUp 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            {/* Floating top-left back button (does not occupy its own layout row) */}
            <button
              type="button"
              aria-label="Back"
              onClick={() => {
                if (setupStep === 'name') {
                  setSetupStep('layout')
                } else {
                  setPendingTemplate(null)
                }
              }}
              className="absolute top-4 left-4 z-20 p-1.5 text-[#787774] hover:text-[#111111] hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
              style={{ outline: 'none' }}
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>

            {/* Step 1: Format (Page vs Pageless) */}
            {setupStep === 'layout' ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 pt-3">
                {/* Left: Page Option (Physical sheet with crisp page geometry) */}
                <button
                  type="button"
                  onClick={() => handlePickLayout('page')}
                  className="group flex flex-col items-center p-2.5 rounded-xl border border-transparent hover:border-black/10 hover:bg-[#fbfbfa] transition-all cursor-pointer"
                  style={{ outline: 'none' }}
                >
                  {/* Realistic 8.5x11 Sheet on Warm Desk */}
                  <div className="w-full aspect-[4/4.6] bg-[#f2f1ed] rounded-lg flex items-center justify-center p-3 mb-2.5 overflow-hidden transition-transform group-hover:scale-[1.02]">
                    <div className="h-full aspect-[8.5/11] bg-white rounded-[3px] shadow-[0_4px_14px_rgba(0,0,0,0.08)] border border-black/10 relative overflow-hidden flex flex-col justify-between">
                      <PaperPatternSurface style={pendingTemplate.paperStyle} />
                      {/* Page margin guideline / subtle stationery rule for blank paper */}
                      {pendingTemplate.paperStyle === 'blank' && (
                        <div className="absolute inset-0 p-3 pointer-events-none flex flex-col justify-between opacity-30">
                          <div className="w-1/3 h-[1.5px] bg-black/20 rounded-full" />
                          <div className="space-y-1.5 w-full">
                            <div className="w-full h-[1px] bg-black/10 rounded-full" />
                            <div className="w-4/5 h-[1px] bg-black/10 rounded-full" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-[#111111]">Page</span>
                </button>

                {/* Clean Central Divider */}
                <div className="w-[1px] h-40 bg-black/[0.08] self-center" />

                {/* Right: Pageless Option (Infinite boundless canvas with corner expand/pan markers) */}
                <button
                  type="button"
                  onClick={() => handlePickLayout('pageless')}
                  className="group flex flex-col items-center p-2.5 rounded-xl border border-transparent hover:border-black/10 hover:bg-[#fbfbfa] transition-all cursor-pointer"
                  style={{ outline: 'none' }}
                >
                  {/* Boundless Canvas Surface with subtle canvas corner crops */}
                  <div className="w-full aspect-[4/4.6] bg-white rounded-lg border border-black/10 relative overflow-hidden mb-2.5 transition-transform group-hover:scale-[1.02]">
                    <PaperPatternSurface style={pendingTemplate.paperStyle} />
                    {/* Technical architectural drafting corner crop marks showing unbounded canvas */}
                    <div className="absolute inset-2.5 pointer-events-none opacity-25">
                      {/* Top-left corner */}
                      <div className="absolute top-0 left-0 w-2.5 h-[1.5px] bg-black" />
                      <div className="absolute top-0 left-0 w-[1.5px] h-2.5 bg-black" />
                      {/* Top-right corner */}
                      <div className="absolute top-0 right-0 w-2.5 h-[1.5px] bg-black" />
                      <div className="absolute top-0 right-0 w-[1.5px] h-2.5 bg-black" />
                      {/* Bottom-left corner */}
                      <div className="absolute bottom-0 left-0 w-2.5 h-[1.5px] bg-black" />
                      <div className="absolute bottom-0 left-0 w-[1.5px] h-2.5 bg-black" />
                      {/* Bottom-right corner */}
                      <div className="absolute bottom-0 right-0 w-2.5 h-[1.5px] bg-black" />
                      <div className="absolute bottom-0 right-0 w-[1.5px] h-2.5 bg-black" />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-[#111111]">Pageless</span>
                </button>
              </div>
            ) : (
              /* Step 2: Name Input (Inline input + arrow button centered inside the same modal size) */
              <form onSubmit={handleConfirmCreate} className="flex flex-col px-4">
                <div className="flex items-center gap-3 border-b-2 border-black/10 focus-within:border-[#111111] pb-2.5 transition-colors">
                  <label htmlFor="inky-title-input" className="sr-only">
                    Note title
                  </label>
                  <input
                    id="inky-title-input"
                    ref={nameInputRef}
                    type="text"
                    maxLength={80}
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder={pendingTemplate.defaultName}
                    aria-label="Note name"
                    style={{ outline: 'none', boxShadow: 'none' }}
                    className="flex-1 min-w-0 text-2xl font-semibold tracking-tight bg-transparent text-[#111111] placeholder:text-stone-300 border-none p-0"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    aria-label="Confirm"
                    className="p-2.5 bg-[#111111] hover:bg-[#333333] text-white rounded-xl transition-all active:scale-95 cursor-pointer shadow-xs shrink-0 flex items-center justify-center"
                    style={{ outline: 'none' }}
                  >
                    <ArrowRight size={16} strokeWidth={2.2} />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Main container */}
      <div className="w-full max-w-5xl px-8 py-12 flex flex-col">
        {/* Header with Playful Squid Mark & Rounded Wordmark */}
        <header className="flex items-center justify-between mb-10 pb-4 border-b border-black/8">
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
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#111111] text-white hover:bg-[#333333] text-xs font-medium transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        </header>

        {/* Template Gallery */}
        <section className="mb-12 flex flex-col">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-5">
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tmpl)}
                className="group flex flex-col items-start text-left transition-all active:scale-[0.98] cursor-pointer"
              >
                {/* 8.5x11 Sheet Preview */}
                <div className="w-full aspect-[8.5/11] bg-white border border-black/8 group-hover:border-black/25 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] relative overflow-hidden transition-all duration-150 mb-2.5">
                  {!tmpl.isPdfUpload ? (
                    <PaperPatternSurface style={tmpl.paperStyle} />
                  ) : (
                    <div className="w-full h-full bg-[#fafaf9] flex flex-col items-center justify-center p-4 text-center">
                      <div className="w-10 h-10 rounded-lg bg-white border border-black/8 shadow-2xs flex items-center justify-center text-[#111111] mb-2">
                        <FileUp size={18} className={isImportingPdf ? 'animate-bounce' : ''} />
                      </div>
                      <span className="text-xs font-medium text-[#111111]">
                        {isImportingPdf ? 'Importing…' : 'PDF'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Caption */}
                <span className="text-xs font-medium text-[#111111] pl-0.5">{tmpl.title}</span>
              </button>
            ))}
          </div>
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
                  className="group relative flex flex-col bg-white border border-black/8 hover:border-black/25 rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-150 cursor-pointer active:scale-[0.99]"
                >
                  {/* Authentic Paper + Live Ink Thumbnail */}
                  <div className="w-full aspect-[4/3] border-b border-black/6 relative overflow-hidden">
                    <BoardThumbnailPreview board={b} />
                  </div>

                  {/* Minimal Info row */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between bg-white min-w-0">
                    <span
                      title={b.title || 'Untitled'}
                      className="text-xs font-medium text-[#111111] truncate pr-2 min-w-0"
                    >
                      {b.title || 'Untitled'}
                    </span>

                    <button
                      type="button"
                      title="Delete"
                      aria-label={`Delete ${b.title || 'Untitled'}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        boardCatalog.deleteBoard(b.id)
                      }}
                      className="opacity-70 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-md hover:bg-black/5 text-[#787774] hover:text-red-600 transition-all cursor-pointer shrink-0"
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
