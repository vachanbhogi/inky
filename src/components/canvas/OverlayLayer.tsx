'use client'

import { useEffect, useRef, useState } from 'react'
import { toScreen } from '../../lib/canvas/coordinates'
import { inkyStore } from '../../lib/canvas/store'
import { STICKY_COLORS } from '../../lib/canvas/types'
import type { Widget } from '../../lib/canvas/types'

function WidgetNode({
  widget,
  camera,
  activeTool,
  selectedWidgetIds,
  hoveredElementId,
  editingWidgetId,
}: {
  widget: Widget
  camera: { x: number; y: number; z: number }
  activeTool: string
  selectedWidgetIds: string[]
  hoveredElementId: string | null
  editingWidgetId: string | null
}) {
  const isEditing = editingWidgetId === widget.id
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pointerDownPosRef = useRef({ x: 0, y: 0 })
  const wasSelectedRef = useRef(false)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      // Delay focus slightly to prevent immediate blur from a pending mouseup event on the canvas
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          // Move cursor to end
          const len = textareaRef.current.value.length
          textareaRef.current.setSelectionRange(len, len)
        }
      }, 100)
    }
  }, [isEditing])
  const isHovered = hoveredElementId === widget.id && activeTool === 'eraser'
  const isText = widget.type === 'text'
  const isSticky = widget.type === 'sticky'

  const [screenX, screenY] = toScreen(widget.x, widget.y, camera)
  const scaledWidth = widget.width * camera.z
  const scaledHeight = widget.height * camera.z
  const fontScale = widget.scale || 1

  const stickyTheme = isSticky && widget.stickyColor ? STICKY_COLORS[widget.stickyColor] : null

  return (
    <div
      onPointerDown={(e) => {
        wasSelectedRef.current = selectedWidgetIds.includes(widget.id)
        pointerDownPosRef.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        if (activeTool === 'select' && (isText || isSticky)) {
          const dx = e.clientX - pointerDownPosRef.current.x
          const dy = e.clientY - pointerDownPosRef.current.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (wasSelectedRef.current && dist < 5) {
            e.stopPropagation()
            inkyStore.setEditingWidget(widget.id)
          }
        }
      }}
      onDoubleClick={(e) => {
        if (activeTool === 'select' && (isText || isSticky)) {
          e.stopPropagation()
          inkyStore.setEditingWidget(widget.id)
        }
      }}
      style={{
        position: 'absolute',
        transform: `translate(${screenX}px, ${screenY}px) rotate(${widget.angle || 0}rad)`,
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
        pointerEvents:
          activeTool === 'draw' ||
          activeTool === 'eraser' ||
          activeTool === 'pan' ||
          activeTool === 'shape'
            ? 'none'
            : 'auto',
        touchAction: 'none',
        animation: 'fadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        // Sticky styles
        ...(isSticky && stickyTheme
          ? {
              background: stickyTheme.bg,
              border: `1px solid ${stickyTheme.border}`,
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column' as const,
            }
          : {}),
        // Text styles
        ...(isText
          ? {
              display: 'flex',
              flexDirection: 'column' as const,
              cursor: activeTool === 'select' ? 'grab' : undefined,
            }
          : {}),
        // Desmos / other styles
        ...(!isText && !isSticky
          ? {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column' as const,
            }
          : {}),
        // Eraser hover outline or Selection outline
        ...(isHovered || (selectedWidgetIds.includes(widget.id) && activeTool === 'select')
          ? {
              outline: `2px ${isHovered ? 'dashed' : 'solid'} #6366f1`,
              outlineOffset: '0px',
            }
          : {}),
      }}
    >
      {/* Header Handle for Desmos / custom widgets */}
      {!isText && !isSticky && (
        <div
          style={{
            width: '100%',
            height: '28px',
            flexShrink: 0,
            background: activeTool === 'select' ? '#f8fafc' : '#ffffff',
            borderBottom: activeTool === 'select' ? '1px solid #e2e8f0' : '1px solid transparent',
            cursor: activeTool === 'select' ? 'grab' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            if (activeTool === 'select') (e.target as HTMLElement).style.background = '#f1f5f9'
          }}
          onMouseLeave={(e) => {
            if (activeTool === 'select') (e.target as HTMLElement).style.background = '#f8fafc'
          }}
        >
          {activeTool === 'select' && (
            <div
              style={{ width: '32px', height: '3px', borderRadius: '2px', background: '#cbd5e1' }}
            />
          )}
        </div>
      )}

      {/* Event Blockers */}
      {activeTool === 'pan' && <div style={{ position: 'absolute', inset: 0, zIndex: 20 }} />}

      <div style={{ flex: 1, width: '100%', position: 'relative' }}>
        {/* Text Widget */}
        {isText && (
          <textarea
            ref={textareaRef}
            readOnly={!isEditing}
            onBlur={() => {
              if (isEditing) inkyStore.setEditingWidget(null)
            }}
            style={{
              width: '100%',
              height: '100%',
              padding: '8px',
              background: 'transparent',
              outline: 'none',
              border: 'none',
              resize: 'none',
              color: '#1e293b',
              fontSize: `${24 * fontScale * camera.z}px`,
              fontFamily: '"Gloria Hallelujah", cursive',
              lineHeight: 1.5,
              pointerEvents: isEditing ? 'auto' : 'none',
              userSelect: isEditing ? 'auto' : 'none',
            }}
            value={widget.content || ''}
            onChange={(e) => inkyStore.updateWidget(widget.id, { content: e.target.value })}
            onPointerDown={(e) => {
              if (isEditing) e.stopPropagation()
            }}
            placeholder="Type something..."
          />
        )}

        {/* Sticky Note Widget */}
        {isSticky && (
          <textarea
            ref={textareaRef}
            readOnly={!isEditing}
            onBlur={() => {
              if (isEditing) inkyStore.setEditingWidget(null)
            }}
            style={{
              width: '100%',
              height: '100%',
              padding: '12px',
              background: 'transparent',
              outline: 'none',
              border: 'none',
              resize: 'none',
              color: stickyTheme?.text || '#854d0e',
              fontSize: `${16 * fontScale * camera.z}px`,
              fontFamily: '"Gloria Hallelujah", cursive',
              lineHeight: 1.6,
              pointerEvents: isEditing ? 'auto' : 'none',
              userSelect: isEditing ? 'auto' : 'none',
            }}
            value={widget.content || ''}
            onChange={(e) => inkyStore.updateWidget(widget.id, { content: e.target.value })}
            onPointerDown={(e) => {
              if (isEditing) e.stopPropagation()
            }}
            placeholder="Note..."
          />
        )}

        {/* Desmos Widget */}
        {widget.type === 'desmos' && <DesmosWidget id={widget.id} />}
      </div>
    </div>
  )
}

function DesmosWidget({ id: _id }: { id: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const calcRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || calcRef.current) return

    let isMounted = true
    const init = () => {
      if (!isMounted) return
      if (typeof window !== 'undefined' && (window as any).Desmos) {
        calcRef.current = (window as any).Desmos.GraphingCalculator(containerRef.current)
      } else {
        setTimeout(init, 100)
      }
    }
    init()

    return () => {
      isMounted = false
      if (calcRef.current) {
        calcRef.current.destroy()
        calcRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#fff',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    />
  )
}

export function OverlayLayer() {
  const [widgets, setWidgets] = useState(inkyStore.widgets)
  const [camera, setCamera] = useState(inkyStore.camera)
  const [activeTool, setActiveTool] = useState(inkyStore.activeTool)
  const [selectedWidgetIds, setSelectedWidgetIds] = useState(inkyStore.selectedWidgetIds)
  const [hoveredElementId, setHoveredElementId] = useState(inkyStore.hoveredElementId)
  const [editingWidgetId, setEditingWidgetId] = useState(inkyStore.editingWidgetId)

  useEffect(() => {
    const unsubscribe = inkyStore.subscribe(() => {
      setWidgets([...inkyStore.widgets])
      setCamera({ ...inkyStore.camera })
      setActiveTool(inkyStore.activeTool)
      setSelectedWidgetIds([...inkyStore.selectedWidgetIds])
      setHoveredElementId(inkyStore.hoveredElementId)
      setEditingWidgetId(inkyStore.editingWidgetId)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
      {widgets.map((widget) => (
        <WidgetNode
          key={widget.id}
          widget={widget}
          camera={camera}
          activeTool={activeTool}
          selectedWidgetIds={selectedWidgetIds}
          hoveredElementId={hoveredElementId}
          editingWidgetId={editingWidgetId}
        />
      ))}
    </div>
  )
}
