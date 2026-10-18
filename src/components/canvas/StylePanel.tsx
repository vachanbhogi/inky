'use client'

import { useEffect, useState } from 'react'
import { STROKE_COLORS, STROKE_SIZES, inkyStore } from '../../lib/canvas/store'
import type { ToolType } from '../../lib/canvas/types'

export function StylePanel() {
  const [strokeColor, setStrokeColor] = useState(inkyStore.strokeColor)
  const [strokeSize, setStrokeSize] = useState(inkyStore.strokeSize)
  const [activeTool, setActiveTool] = useState(inkyStore.activeTool)
  const [hasSelection, setHasSelection] = useState(inkyStore.selectedStrokeIds.length > 0)

  useEffect(() => {
    const unsubscribe = inkyStore.subscribe(() => {
      setStrokeColor(inkyStore.strokeColor)
      setStrokeSize(inkyStore.strokeSize)
      setActiveTool(inkyStore.activeTool)
      setHasSelection(inkyStore.selectedStrokeIds.length > 0)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const shapeTools: ToolType[] = ['rectangle', 'ellipse', 'arrow', 'line']
  const isVisible =
    activeTool === 'draw' ||
    shapeTools.includes(activeTool as any) ||
    (activeTool === 'select' && hasSelection)
  if (!isVisible) return null

  return (
    <div
      className="inky-panel inky-ui"
      style={{
        position: 'absolute',
        top: '75px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        pointerEvents: 'auto',
        animation: 'panelSlideDown 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 'calc(100vw - 32px)',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.82)',
          backdropFilter: 'blur(16px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        {/* Color Swatches */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {STROKE_COLORS.map((color) => (
            <button
              key={color.id}
              title={color.label}
              onClick={() => inkyStore.setStrokeColor(color.value)}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: color.value,
                border:
                  strokeColor === color.value
                    ? '2.5px solid #6366f1'
                    : color.id === 'white'
                      ? '2px solid rgba(0,0,0,0.15)'
                      : '2px solid transparent',
                cursor: 'pointer',
                transition: 'transform 150ms ease, border-color 150ms ease',
                transform: strokeColor === color.value ? 'scale(1.2)' : 'scale(1)',
                flexShrink: 0,
                boxShadow: strokeColor === color.value ? '0 0 0 2px rgba(99,102,241,0.25)' : 'none',
              }}
            />
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            width: '1px',
            height: '24px',
            background: 'rgba(0,0,0,0.1)',
            flexShrink: 0,
          }}
        />

        {/* Size Options */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {STROKE_SIZES.map((size) => (
            <button
              key={size.id}
              title={size.label}
              onClick={() => inkyStore.setStrokeSize(size.value)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: strokeSize === size.value ? 'rgba(99,102,241,0.1)' : 'transparent',
                border:
                  strokeSize === size.value
                    ? '1.5px solid rgba(99,102,241,0.4)'
                    : '1.5px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 150ms ease',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: `${Math.min(size.value * 2.5, 20)}px`,
                  height: `${Math.min(size.value * 2.5, 20)}px`,
                  borderRadius: '50%',
                  background: '#334155',
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
