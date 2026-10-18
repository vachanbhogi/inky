import { Eraser, Hand, Minus, Pen, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { PALETTE_COLORS, type ToolType } from '../../lib/canvas/types'

export function Toolbar() {
  const [activeTool, setActiveTool] = useState<ToolType>(inkyStore.activeTool)
  const [strokeColor, setStrokeColor] = useState(inkyStore.strokeColor)
  const [camera, setCamera] = useState(inkyStore.camera)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  useEffect(() => {
    const unsub = inkyStore.subscribe(() => {
      setActiveTool(inkyStore.activeTool)
      setStrokeColor(inkyStore.strokeColor)
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
    <nav
      aria-label="Canvas Toolbar"
      className="inky-ui fixed top-4 inset-x-0 mx-auto w-fit z-30 pointer-events-auto flex items-center gap-1.5 p-1.5 bg-white/90 backdrop-blur-xl border border-black/8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
      style={{
        animation: 'toolbarSlideDown 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Tool Selection */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Pen (3)"
          onClick={() => inkyStore.setActiveTool('draw')}
          className={`p-2 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer ${
            activeTool === 'draw'
              ? 'bg-[#111111] text-white shadow-sm'
              : 'text-[#111111] hover:bg-black/5'
          }`}
        >
          <Pen size={16} />
        </button>

        <button
          type="button"
          title="Eraser (0)"
          onClick={() => inkyStore.setActiveTool('eraser')}
          className={`p-2 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer ${
            activeTool === 'eraser'
              ? 'bg-[#111111] text-white shadow-sm'
              : 'text-[#111111] hover:bg-black/5'
          }`}
        >
          <Eraser size={16} />
        </button>

        <button
          type="button"
          title="Pan (1)"
          onClick={() => inkyStore.setActiveTool('pan')}
          className={`p-2 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer ${
            activeTool === 'pan'
              ? 'bg-[#111111] text-white shadow-sm'
              : 'text-[#111111] hover:bg-black/5'
          }`}
        >
          <Hand size={16} />
        </button>
      </div>

      {/* Divider */}
      <div className="w-[1px] h-5 bg-black/8 mx-0.5" />

      {/* Curated Color Swatches */}
      <div className="flex items-center gap-1 px-1">
        {PALETTE_COLORS.map((color) => {
          const isSelected = activeTool === 'draw' && strokeColor === color
          return (
            <button
              key={color}
              type="button"
              title={`Color: ${color}`}
              onClick={() => {
                inkyStore.setStrokeColor(color)
                inkyStore.setActiveTool('draw')
              }}
              className="relative p-1 rounded-full cursor-pointer transition-transform duration-150 active:scale-90 flex items-center justify-center"
            >
              <span
                className={`block w-4 h-4 rounded-full transition-all duration-150 ${
                  isSelected
                    ? 'scale-110 shadow-sm'
                    : 'opacity-85 hover:opacity-100 hover:scale-105'
                }`}
                style={{ backgroundColor: color }}
              />
              {isSelected && (
                <span
                  className="absolute inset-0 rounded-full border border-black/25 pointer-events-none"
                  style={{ margin: '-1px' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="w-[1px] h-5 bg-black/8 mx-0.5" />

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
          title="Reset zoom"
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
          className={`p-2 rounded-xl transition-all duration-150 active:scale-95 ${
            canUndo
              ? 'text-[#111111] hover:bg-black/5 cursor-pointer'
              : 'text-[#787774]/35 cursor-not-allowed'
          }`}
        >
          <Undo2 size={16} />
        </button>

        <button
          type="button"
          title="Redo (Cmd+Shift+Z)"
          disabled={!canRedo}
          onClick={() => inkyStore.redo()}
          className={`p-2 rounded-xl transition-all duration-150 active:scale-95 ${
            canRedo
              ? 'text-[#111111] hover:bg-black/5 cursor-pointer'
              : 'text-[#787774]/35 cursor-not-allowed'
          }`}
        >
          <Redo2 size={16} />
        </button>

        <button
          type="button"
          title="Clear canvas"
          onClick={() => inkyStore.clear()}
          className="p-2 rounded-xl text-[#787774] hover:text-[#dc2626] hover:bg-rose-50/70 transition-all duration-150 active:scale-95 cursor-pointer"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </nav>
  )
}
