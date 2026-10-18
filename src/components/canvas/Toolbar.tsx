import { Eraser, Hand, Minus, MousePointer, Pen, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { PALETTE_COLORS, type ToolType } from '../../lib/canvas/types'

export function Toolbar() {
  const [activeTool, setActiveTool] = useState<ToolType>(inkyStore.activeTool)
  const [strokeColor, setStrokeColor] = useState(inkyStore.strokeColor)
  const [strokeSize, setStrokeSize] = useState(inkyStore.strokeSize)
  const [hasSelection, setHasSelection] = useState(inkyStore.selectedStrokeIds.length > 0)
  const [camera, setCamera] = useState(inkyStore.camera)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  useEffect(() => {
    const unsub = inkyStore.subscribe(() => {
      setActiveTool(inkyStore.activeTool)
      setStrokeColor(inkyStore.strokeColor)
      setStrokeSize(inkyStore.strokeSize)
      setHasSelection(inkyStore.selectedStrokeIds.length > 0)
      setCamera({ ...inkyStore.camera })
      setCanUndo(inkyStore.canUndo)
      setCanRedo(inkyStore.canRedo)
    })
    return unsub
  }, [])

  const zoomIn = () => inkyStore.setCamera({ z: inkyStore.camera.z + 0.1 })
  const zoomOut = () => inkyStore.setCamera({ z: inkyStore.camera.z - 0.1 })
  const zoomReset = () => inkyStore.setCamera({ z: 1 })

  return (
    <>
      {/* Top Centered Unified Command Island */}
      <nav
        aria-label="Inky Command Bar"
        className="inky-ui fixed top-4 inset-x-0 mx-auto w-fit z-30 pointer-events-auto flex items-center gap-1.5 p-1.5 bg-white/95 backdrop-blur-xl border border-black/8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-200"
        style={{
          animation: 'toolbarSlideDown 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        {/* Core Tools */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Select (2 or V)"
            onClick={() => inkyStore.setActiveTool('select')}
            className={`relative min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer ${
              activeTool === 'select'
                ? 'bg-[#111111] text-white shadow-sm'
                : 'text-[#111111] hover:bg-black/5'
            }`}
          >
            <MousePointer size={18} />
          </button>

          <button
            type="button"
            title="Pen (3 or P)"
            onClick={() => inkyStore.setActiveTool('draw')}
            className={`relative min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer ${
              activeTool === 'draw'
                ? 'bg-[#111111] text-white shadow-sm'
                : 'text-[#111111] hover:bg-black/5'
            }`}
          >
            <Pen size={18} />
          </button>

          <button
            type="button"
            title="Eraser (0 or E)"
            onClick={() => inkyStore.setActiveTool('eraser')}
            className={`relative min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer ${
              activeTool === 'eraser'
                ? 'bg-[#111111] text-white shadow-sm'
                : 'text-[#111111] hover:bg-black/5'
            }`}
          >
            <Eraser size={18} />
          </button>

          <button
            type="button"
            title="Pan (1 or H)"
            onClick={() => inkyStore.setActiveTool('pan')}
            className={`relative min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer ${
              activeTool === 'pan'
                ? 'bg-[#111111] text-white shadow-sm'
                : 'text-[#111111] hover:bg-black/5'
            }`}
          >
            <Hand size={18} />
          </button>
        </div>

        {/* Always-Visible Style Dock (Zero layout shift, instant color pick & draw) */}
        <div className="w-[1px] h-5 bg-black/10 mx-1" />

        {/* Curated Color Swatches */}
        <div className="flex items-center gap-0.5 px-0.5">
          {PALETTE_COLORS.map((color) => {
            const isSelected = strokeColor === color
            return (
              <button
                key={color}
                type="button"
                title={`Color: ${color}`}
                onClick={() => {
                  inkyStore.setStrokeColor(color)
                  if (activeTool !== 'draw' && activeTool !== 'select') {
                    inkyStore.setActiveTool('draw')
                  }
                  if (hasSelection) {
                    for (const id of inkyStore.selectedStrokeIds) {
                      const stroke = inkyStore.strokes.find((s) => s.id === id)
                      if (stroke) stroke.color = color
                    }
                    inkyStore.notify()
                  }
                }}
                className="relative min-w-[36px] min-h-[36px] p-1 rounded-full cursor-pointer transition-transform duration-150 active:scale-90 flex items-center justify-center"
              >
                <span
                  className={`block w-4 h-4 rounded-full transition-all duration-150 ${
                    isSelected
                      ? 'scale-110 shadow-sm ring-2 ring-black/25 ring-offset-2'
                      : 'opacity-85 hover:opacity-100 hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              </button>
            )
          })}
        </div>

        <div className="w-[1px] h-5 bg-black/10 mx-1" />

        {/* Stroke Thickness Selector */}
        <div className="flex items-center gap-0.5 px-0.5">
          {[
            { size: 2, label: 'Fine', dotSize: 4 },
            { size: 4, label: 'Medium', dotSize: 6 },
            { size: 8, label: 'Bold', dotSize: 9 },
          ].map(({ size, label, dotSize }) => {
            const isSelected = strokeSize === size
            return (
              <button
                key={size}
                type="button"
                title={`Size: ${label} (${size}px)`}
                onClick={() => {
                  inkyStore.setStrokeSize(size)
                  if (activeTool !== 'draw' && activeTool !== 'select') {
                    inkyStore.setActiveTool('draw')
                  }
                }}
                className={`min-w-[36px] min-h-[36px] p-1.5 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-90 ${
                  isSelected ? 'bg-black/8 text-[#111111]' : 'text-[#787774] hover:bg-black/5'
                }`}
              >
                <span
                  className="block rounded-full bg-current transition-all"
                  style={{
                    width: `${dotSize}px`,
                    height: `${dotSize}px`,
                  }}
                />
              </button>
            )
          })}
        </div>
      </nav>

      {/* Bottom-Left Navigation & History Cluster */}
      <aside
        aria-label="Navigation Controls"
        className="inky-ui fixed bottom-4 left-4 z-30 pointer-events-auto flex items-center gap-1.5 p-1 bg-white/95 backdrop-blur-xl border border-black/8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
      >
        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 text-xs font-mono text-[#111111]">
          <button
            type="button"
            title="Zoom out"
            onClick={zoomOut}
            className="p-1.5 rounded-lg hover:bg-black/5 active:scale-95 text-[#787774] hover:text-[#111111] cursor-pointer"
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            title="Reset zoom to 100%"
            onClick={zoomReset}
            className="px-1.5 py-1 rounded-lg hover:bg-black/5 text-[11px] font-medium tracking-tight cursor-pointer"
          >
            {Math.round(camera.z * 100)}%
          </button>
          <button
            type="button"
            title="Zoom in"
            onClick={zoomIn}
            className="p-1.5 rounded-lg hover:bg-black/5 active:scale-95 text-[#787774] hover:text-[#111111] cursor-pointer"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-5 bg-black/8 mx-0.5" />

        {/* Undo / Redo & Trash */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Undo (Cmd+Z)"
            disabled={!canUndo}
            onClick={() => inkyStore.undo()}
            className={`p-1.5 rounded-lg transition-all duration-150 active:scale-95 ${
              canUndo
                ? 'text-[#111111] hover:bg-black/5 cursor-pointer'
                : 'text-[#787774]/35 cursor-not-allowed'
            }`}
          >
            <Undo2 size={15} />
          </button>

          <button
            type="button"
            title="Redo (Cmd+Shift+Z)"
            disabled={!canRedo}
            onClick={() => inkyStore.redo()}
            className={`p-1.5 rounded-lg transition-all duration-150 active:scale-95 ${
              canRedo
                ? 'text-[#111111] hover:bg-black/5 cursor-pointer'
                : 'text-[#787774]/35 cursor-not-allowed'
            }`}
          >
            <Redo2 size={15} />
          </button>

          <button
            type="button"
            title="Clear canvas"
            onClick={() => inkyStore.clear()}
            className="p-1.5 rounded-lg text-[#787774] hover:text-[#dc2626] hover:bg-rose-50/70 transition-all duration-150 active:scale-95 cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </aside>
    </>
  )
}
