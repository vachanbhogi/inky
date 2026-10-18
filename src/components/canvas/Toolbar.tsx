import { Eraser, Hand, Minus, Pen, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import type { ToolType } from '../../lib/canvas/types'

export function Toolbar() {
  const [activeTool, setActiveTool] = useState<ToolType>(inkyStore.activeTool)
  const [camera, setCamera] = useState(inkyStore.camera)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  useEffect(() => {
    const unsub = inkyStore.subscribe(() => {
      setActiveTool(inkyStore.activeTool)
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
    <div
      className="inky-ui absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 bg-white/85 backdrop-blur-xl border border-black/8 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.06)]"
      style={{
        animation: 'toolbarSlideDown 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Tool Buttons */}
      <button
        type="button"
        title="Pen (3)"
        onClick={() => inkyStore.setActiveTool('draw')}
        className={`p-2 rounded-xl transition-all duration-150 active:scale-95 ${
          activeTool === 'draw'
            ? 'bg-[#111111] text-white shadow-sm'
            : 'text-[#111111] hover:bg-black/5'
        }`}
      >
        <Pen size={17} />
      </button>

      <button
        type="button"
        title="Eraser (0)"
        onClick={() => inkyStore.setActiveTool('eraser')}
        className={`p-2 rounded-xl transition-all duration-150 active:scale-95 ${
          activeTool === 'eraser'
            ? 'bg-[#111111] text-white shadow-sm'
            : 'text-[#111111] hover:bg-black/5'
        }`}
      >
        <Eraser size={17} />
      </button>

      <button
        type="button"
        title="Pan (1 or Space)"
        onClick={() => inkyStore.setActiveTool('pan')}
        className={`p-2 rounded-xl transition-all duration-150 active:scale-95 ${
          activeTool === 'pan'
            ? 'bg-[#111111] text-white shadow-sm'
            : 'text-[#111111] hover:bg-black/5'
        }`}
      >
        <Hand size={17} />
      </button>

      {/* Divider */}
      <div className="w-[1px] h-5 bg-black/10 mx-0.5" />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5 text-xs font-mono text-[#111111]">
        <button
          type="button"
          title="Zoom out"
          onClick={zoomOut}
          className="p-1.5 rounded-lg hover:bg-black/5 active:scale-95 text-[#787774] hover:text-[#111111]"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          title="Reset zoom"
          onClick={zoomReset}
          className="px-2 py-1 rounded-lg hover:bg-black/5 text-[11px] font-medium"
        >
          {Math.round(camera.z * 100)}%
        </button>
        <button
          type="button"
          title="Zoom in"
          onClick={zoomIn}
          className="p-1.5 rounded-lg hover:bg-black/5 active:scale-95 text-[#787774] hover:text-[#111111]"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Divider */}
      <div className="w-[1px] h-5 bg-black/10 mx-0.5" />

      {/* Undo / Redo */}
      <button
        type="button"
        title="Undo (Cmd+Z)"
        disabled={!canUndo}
        onClick={() => inkyStore.undo()}
        className={`p-2 rounded-xl transition-all duration-150 active:scale-95 ${
          canUndo
            ? 'text-[#111111] hover:bg-black/5 cursor-pointer'
            : 'text-[#787774]/40 cursor-not-allowed'
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
            : 'text-[#787774]/40 cursor-not-allowed'
        }`}
      >
        <Redo2 size={16} />
      </button>

      <button
        type="button"
        title="Clear canvas"
        onClick={() => inkyStore.clear()}
        className="p-2 rounded-xl text-[#787774] hover:text-[#e11d48] hover:bg-rose-50 transition-all duration-150 active:scale-95 cursor-pointer"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
