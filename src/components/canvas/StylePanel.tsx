import { useEffect, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'
import { PALETTE_COLORS } from '../../lib/canvas/types'

export function StylePanel() {
  const [activeTool, setActiveTool] = useState(inkyStore.activeTool)
  const [strokeColor, setStrokeColor] = useState(inkyStore.strokeColor)
  const [strokeSize, setStrokeSize] = useState(inkyStore.strokeSize)
  const [hasSelection, setHasSelection] = useState(inkyStore.selectedStrokeIds.length > 0)

  useEffect(() => {
    const unsub = inkyStore.subscribe(() => {
      setActiveTool(inkyStore.activeTool)
      setStrokeColor(inkyStore.strokeColor)
      setStrokeSize(inkyStore.strokeSize)
      setHasSelection(inkyStore.selectedStrokeIds.length > 0)
    })
    return unsub
  }, [])

  // Show contextual style panel when drawing or when an existing stroke is selected
  const isVisible = activeTool === 'draw' || (activeTool === 'select' && hasSelection)
  if (!isVisible) return null

  return (
    <section
      aria-label="Style Palette"
      className="inky-ui fixed top-[70px] inset-x-0 mx-auto w-fit z-20 pointer-events-auto flex items-center gap-2 p-1.5 bg-white/90 backdrop-blur-xl border border-black/8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
      style={{
        animation: 'toolbarSlideDown 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Curated Color Swatches */}
      <div className="flex items-center gap-1 px-1">
        {PALETTE_COLORS.map((color) => {
          const isSelected = strokeColor === color
          return (
            <button
              key={color}
              type="button"
              title={`Color: ${color}`}
              onClick={() => {
                inkyStore.setStrokeColor(color)
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

      {/* Stroke Size Selector */}
      <div className="flex items-center gap-1 px-1">
        {[
          { size: 2, label: 'Fine' },
          { size: 4, label: 'Medium' },
          { size: 8, label: 'Bold' },
        ].map(({ size, label }) => {
          const isSelected = strokeSize === size
          return (
            <button
              key={size}
              type="button"
              title={`Size: ${label} (${size}px)`}
              onClick={() => {
                inkyStore.setStrokeSize(size)
              }}
              className={`min-w-[36px] min-h-[36px] p-1.5 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-90 ${
                isSelected ? 'bg-black/8 text-[#111111]' : 'text-[#787774] hover:bg-black/5'
              }`}
            >
              <span
                className="block rounded-full bg-current transition-all"
                style={{
                  width: `${Math.max(4, size + 1)}px`,
                  height: `${Math.max(4, size + 1)}px`,
                }}
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}
