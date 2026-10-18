'use client'

import {
  ArrowUpRight,
  Calculator,
  Circle,
  Eraser,
  Hand,
  HelpCircle,
  Minus,
  MousePointer2,
  Pen,
  Plus,
  Redo2,
  Slash,
  Square,
  StickyNote,
  Type,
  Undo2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toWorld } from '../../lib/canvas/coordinates'
import { inkyStore } from '../../lib/canvas/store'
import type { StickyColor } from '../../lib/canvas/types'

const STICKY_OPTIONS: { color: StickyColor; hex: string }[] = [
  { color: 'yellow', hex: '#fef9c3' },
  { color: 'pink', hex: '#fce7f3' },
  { color: 'blue', hex: '#dbeafe' },
  { color: 'green', hex: '#dcfce7' },
  { color: 'purple', hex: '#ede9fe' },
  { color: 'orange', hex: '#ffedd5' },
]

export function Toolbar({
  containerRef,
}: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [activeTool, setActiveTool] = useState(inkyStore.activeTool)
  const [camera, setCamera] = useState(inkyStore.camera)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [showStickyPicker, setShowStickyPicker] = useState(false)
  const [showZoomTooltip, setShowZoomTooltip] = useState(false)

  useEffect(() => {
    const unsub = inkyStore.subscribe(() => {
      setActiveTool(inkyStore.activeTool)
      setCamera({ ...inkyStore.camera })
      setCanUndo(inkyStore.canUndo)
      setCanRedo(inkyStore.canRedo)
    })
    return () => {
      unsub()
    }
  }, [])

  const bg = '#ffffff'
  const border = 'rgba(0,0,0,0.05)'
  const shadow = '0 2px 12px rgba(0,0,0,0.08)'
  const activeColor = '#e0e7ff'
  const textColor = '#1e1e1e'

  const ToolBtn = ({ tool, icon: Icon, label, num, onClick, isActive }: any) => (
    <button
      onClick={
        onClick ||
        (() => {
          inkyStore.setActiveTool(tool)
          setShowStickyPicker(false)
        })
      }
      title={`${label} (${num})`}
      style={{
        position: 'relative',
        padding: '8px 10px',
        borderRadius: '8px',
        border: 'none',
        background: (isActive ?? activeTool === tool) ? activeColor : 'transparent',
        color: textColor,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 120ms ease',
      }}
    >
      <Icon size={18} />
      {num && (
        <span
          style={{
            position: 'absolute',
            bottom: '2px',
            right: '4px',
            fontSize: '8px',
            fontWeight: 600,
            opacity: 0.4,
          }}
        >
          {num}
        </span>
      )}
    </button>
  )

  const addStickyNote = (color: StickyColor) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const [wx, wy] = toWorld(rect.width / 2 - 100, rect.height / 2 - 75, inkyStore.camera)
    inkyStore.addWidget({
      id: Date.now().toString(),
      x: wx,
      y: wy,
      width: 200,
      height: 150,
      type: 'sticky',
      content: '',
      stickyColor: color,
      scale: 1,
    })
    inkyStore.setActiveTool('select')
    setShowStickyPicker(false)
  }

  const addDesmos = () => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const [wx, wy] = toWorld(rect.width / 2 - 300, rect.height / 2 - 200, inkyStore.camera)
    inkyStore.addWidget({
      id: Date.now().toString(),
      x: wx,
      y: wy,
      width: 600,
      height: 400,
      type: 'desmos',
    })
    inkyStore.setActiveTool('select')
  }

  const zoomIn = () => inkyStore.setCamera({ z: Math.min(inkyStore.camera.z + 0.1, 5) })
  const zoomOut = () => inkyStore.setCamera({ z: Math.max(inkyStore.camera.z - 0.1, 0.1) })
  const zoomReset = () => inkyStore.setCamera({ z: 1 })

  // const ShapeIcon = SHAPE_OPTIONS.find(s => s.type === activeShape)?.icon || Square

  return (
    <>
      {/* Main Toolbar */}
      <div
        className="inky-ui"
        style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '4px',
          padding: '4px',
          maxWidth: 'calc(100vw - 32px)',
          background: bg,
          backdropFilter: 'blur(16px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
          borderRadius: '14px',
          border: `1px solid ${border}`,
          boxShadow: shadow,
          pointerEvents: 'auto',
          animation: 'toolbarSlideDown 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <ToolBtn tool="pan" icon={Hand} label="Pan" num="1" />
        <ToolBtn tool="select" icon={MousePointer2} label="Select" num="2" />
        <ToolBtn tool="draw" icon={Pen} label="Draw" num="3" />
        <ToolBtn tool="line" icon={Slash} label="Line" num="4" />
        <ToolBtn tool="arrow" icon={ArrowUpRight} label="Arrow" num="5" />
        <ToolBtn tool="rectangle" icon={Square} label="Rectangle" num="6" />
        <ToolBtn tool="ellipse" icon={Circle} label="Ellipse" num="7" />
        <ToolBtn tool="text" icon={Type} label="Text" num="8" />

        {/* Sticky note */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowStickyPicker(!showStickyPicker)
            }}
            title="Sticky Note (9)"
            style={{
              position: 'relative',
              padding: '8px 10px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: textColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              transition: 'background 120ms ease',
            }}
          >
            <StickyNote size={18} />
            <span
              style={{
                position: 'absolute',
                bottom: '2px',
                right: '4px',
                fontSize: '8px',
                fontWeight: 600,
                opacity: 0.4,
              }}
            >
              9
            </span>
          </button>
          {showStickyPicker && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                marginTop: '8px',
                background: bg,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '10px',
                border: `1px solid ${border}`,
                boxShadow: shadow,
                padding: '6px',
                display: 'flex',
                gap: '4px',
                transform: 'translateX(-50%)',
                animation: 'fadeIn 150ms ease both',
              }}
            >
              {STICKY_OPTIONS.map((s) => (
                <button
                  key={s.color}
                  title={s.color}
                  onClick={() => addStickyNote(s.color)}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    border: '1.5px solid rgba(0,0,0,0.1)',
                    background: s.hex,
                    cursor: 'pointer',
                    transition: 'transform 120ms ease',
                  }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.transform = 'scale(1.15)')}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.transform = 'scale(1)')}
                />
              ))}
            </div>
          )}
        </div>

        <ToolBtn tool="eraser" icon={Eraser} label="Eraser" num="0" />

        <div style={{ width: '1px', background: 'rgba(0,0,0,0.08)', margin: '4px 2px' }} />

        <button
          onClick={addDesmos}
          title="Add Calculator (G)"
          style={{
            position: 'relative',
            padding: '8px 10px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            color: textColor,
            transition: 'background 120ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Calculator size={18} />
          <span
            style={{
              position: 'absolute',
              bottom: '2px',
              right: '4px',
              fontSize: '8px',
              fontWeight: 600,
              opacity: 0.4,
            }}
          >
            G
          </span>
        </button>

        <button
          onClick={() => inkyStore.setShowShortcuts(true)}
          title="Shortcuts (?)"
          style={{
            position: 'relative',
            padding: '8px 10px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            color: textColor,
            transition: 'background 120ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <HelpCircle size={18} />
        </button>
      </div>

      {/* Bottom Controls */}
      <div
        className="inky-ui"
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 10,
          display: 'flex',
          gap: '8px',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: '10px',
            overflow: 'visible',
            background: bg,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${border}`,
            boxShadow: shadow,
            fontSize: '13px',
            fontWeight: 600,
            color: textColor,
          }}
        >
          <button
            onClick={zoomOut}
            style={{
              padding: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: textColor,
            }}
          >
            <Minus size={15} />
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={zoomReset}
              onMouseEnter={() => setShowZoomTooltip(true)}
              onMouseLeave={() => setShowZoomTooltip(false)}
              aria-label="Reset zoom to 100%"
              style={{
                padding: '8px 4px',
                minWidth: '48px',
                textAlign: 'center',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: textColor,
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {Math.round(camera.z * 100)}%
            </button>
            {showZoomTooltip && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: '10px',
                  padding: '5px 10px',
                  background: '#1e293b',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  animation: 'fadeIn 150ms ease both',
                  zIndex: 100,
                }}
              >
                Reset to 100%
                {/* Tiny arrow */}
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop: '5px solid #1e293b',
                  }}
                />
              </div>
            )}
          </div>
          <button
            onClick={zoomIn}
            style={{
              padding: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: textColor,
            }}
          >
            <Plus size={15} />
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: '10px',
            overflow: 'hidden',
            background: bg,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${border}`,
            boxShadow: shadow,
          }}
        >
          <button
            onClick={() => inkyStore.undo()}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            style={{
              padding: '8px',
              border: 'none',
              background: 'transparent',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              color: textColor,
              opacity: canUndo ? 1 : 0.3,
            }}
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={() => inkyStore.redo()}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            style={{
              padding: '8px',
              border: 'none',
              background: 'transparent',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              color: textColor,
              opacity: canRedo ? 1 : 0.3,
            }}
          >
            <Redo2 size={15} />
          </button>
        </div>
      </div>
    </>
  )
}
