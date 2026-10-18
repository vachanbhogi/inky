'use client'

import { useGesture } from '@use-gesture/react'
import { useEffect, useRef, useState } from 'react'
import { toWorld } from '../../lib/canvas/coordinates'
import type { Point } from '../../lib/canvas/coordinates'
import { getBoundingBox } from '../../lib/canvas/spatial-index'
import { inkyStore } from '../../lib/canvas/store'
import type { ShapeType, Stroke, ToolType } from '../../lib/canvas/types'
import { CanvasLayer } from './CanvasLayer'
import { OverlayLayer } from './OverlayLayer'
import { ShortcutsModal } from './ShortcutsModal'
import { StylePanel } from './StylePanel'
import { Toolbar } from './Toolbar'

import PerfectFreehandWorker from '../../workers/perfect-freehand.worker?worker'

export function InkyBoard() {
  const containerRef = useRef<HTMLDivElement>(null)
  const workerRef = useRef<Worker>(null)
  const currentStrokeIdRef = useRef<string | null>(null)

  const [camera, setCamera] = useState(inkyStore.camera)
  const [activeTool, setActiveTool] = useState(inkyStore.activeTool)

  const previousToolRef = useRef<ToolType | null>(null)
  const isSpaceDownRef = useRef(false)

  useEffect(() => {
    const unsubscribe = inkyStore.subscribe(() => {
      setCamera({ ...inkyStore.camera })
      setActiveTool(inkyStore.activeTool)
    })

    const worker = new PerfectFreehandWorker()
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent) => {
      const { id, pathData, status, error } = event.data
      if (status === 'error') {
        console.error('Worker error:', error)
        return
      }

      if (id === currentStrokeIdRef.current) {
        if (inkyStore.currentStroke) {
          inkyStore.setCurrentStroke({ ...inkyStore.currentStroke, pathData })
        }
      } else {
        const idx = inkyStore.strokes.findIndex((s) => s.id === id)
        if (idx !== -1) {
          const updated = [...inkyStore.strokes]
          updated[idx].pathData = pathData
          inkyStore.strokes = updated
          inkyStore.notify()
        }
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'INPUT'
      )
        return

      switch (e.key.toLowerCase()) {
        case 'h':
        case '1':
          inkyStore.setActiveTool('pan')
          break
        case 'v':
        case '2':
          inkyStore.setActiveTool('select')
          break
        case 'p':
        case '3':
          inkyStore.setActiveTool('draw')
          break
        case 'l':
        case '4':
          inkyStore.setActiveTool('line')
          break
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            inkyStore.setSelection(
              inkyStore.strokes.map((s) => s.id),
              inkyStore.widgets.map((w) => w.id),
            )
            inkyStore.setActiveTool('select')
          } else {
            inkyStore.setActiveTool('arrow')
          }
          break
        case '5':
          inkyStore.setActiveTool('arrow')
          break
        case 'r':
        case '6':
          inkyStore.setActiveTool('rectangle')
          break
        case 'o':
        case '7':
          inkyStore.setActiveTool('ellipse')
          break
        case 't':
        case '8':
          inkyStore.setActiveTool('text')
          break
        case 's':
        case '9': {
          const wx = (window.innerWidth / 2 - inkyStore.camera.x) / inkyStore.camera.z
          const wy = (window.innerHeight / 2 - inkyStore.camera.y) / inkyStore.camera.z
          inkyStore.addDefaultSticky(wx, wy)
          break
        }
        case 'g': {
          const wx = (window.innerWidth / 2 - inkyStore.camera.x) / inkyStore.camera.z
          const wy = (window.innerHeight / 2 - inkyStore.camera.y) / inkyStore.camera.z
          inkyStore.addDesmos(wx, wy)
          break
        }
        case 'e':
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            inkyStore.setCamera({ z: 1 })
            break
          }
          inkyStore.setActiveTool('eraser')
          break
        case 'backspace':
        case 'delete':
          if (
            (e.target as HTMLElement).tagName === 'TEXTAREA' ||
            (e.target as HTMLElement).tagName === 'INPUT'
          )
            break
          inkyStore.deleteSelected()
          break
        case 'escape':
          inkyStore.setSelection([], [])
          inkyStore.setShowShortcuts(false)
          inkyStore.setEditingWidget(null)
          break
        case '?':
          inkyStore.setShowShortcuts(!inkyStore.showShortcuts)
          break
        case ' ':
          if (
            (e.target as HTMLElement).tagName === 'TEXTAREA' ||
            (e.target as HTMLElement).tagName === 'INPUT'
          )
            break
          if (!isSpaceDownRef.current) {
            isSpaceDownRef.current = true
            previousToolRef.current = inkyStore.activeTool
            inkyStore.setActiveTool('pan')
            e.preventDefault()
          }
          break
        case '=':
        case '+':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            inkyStore.setCamera({ z: Math.min(inkyStore.camera.z + 0.1, 5) })
          }
          break
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            inkyStore.setCamera({ z: Math.max(inkyStore.camera.z - 0.1, 0.1) })
          }
          break
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (e.shiftKey) inkyStore.redo()
            else inkyStore.undo()
          }
          break
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        isSpaceDownRef.current = false
        if (previousToolRef.current) {
          inkyStore.setActiveTool(previousToolRef.current)
          previousToolRef.current = null
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      unsubscribe()
      worker.terminate()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const requestStrokeGeneration = (id: string, points: Point[], options: any) => {
    workerRef.current?.postMessage({ id, points, options })
  }

  useGesture(
    {
      onDrag: ({ event, first, last, delta: [dx, dy], ...rest }: any) => {
        if ((event.target as HTMLElement).closest('.inky-ui')) return
        if ((event.target as HTMLElement).tagName?.toLowerCase() === 'textarea') return

        const isMiddleClick = (event as PointerEvent).button === 1
        const isRightClick = (event as PointerEvent).button === 2
        const isMultiTouch = rest.touches > 1
        const isPanIntended =
          isMiddleClick || isRightClick || isMultiTouch || inkyStore.activeTool === 'pan'

        if (isPanIntended) {
          inkyStore.setCamera({ x: inkyStore.camera.x + dx, y: inkyStore.camera.y + dy })
          return
        }

        const pointerEvent = event as PointerEvent
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const [worldX, worldY] = toWorld(
          pointerEvent.clientX - rect.left,
          pointerEvent.clientY - rect.top,
          inkyStore.camera,
        )

        // ERASER
        if (inkyStore.activeTool === 'eraser') {
          for (let i = inkyStore.strokes.length - 1; i >= 0; i--) {
            const s = inkyStore.strokes[i]
            if (isPointOnStroke(worldX, worldY, s)) {
              inkyStore.deleteStroke(s.id)
              // We don't return here to allow erasing multiple overlapping lines in one "frame"
            }
          }
          for (let i = inkyStore.widgets.length - 1; i >= 0; i--) {
            const w = inkyStore.widgets[i]
            if (
              worldX >= w.x &&
              worldX <= w.x + w.width &&
              worldY >= w.y &&
              worldY <= w.y + w.height
            ) {
              inkyStore.deleteWidget(w.id)
            }
          }
          return
        }
        if (inkyStore.activeTool === 'select') {
          if (first) {
            if (inkyStore.activeHandle) {
              const state = buildTransformState()
              inkyStore.setTransformInitialState(state)
              return { isResizing: true, startWorldX: worldX, startWorldY: worldY }
            }

            const hitSelBox = hitTestSelectionBox(worldX, worldY)
            if (hitSelBox) {
              const state = buildTransformState()
              inkyStore.setTransformInitialState(state)
              return { isDraggingSelection: true, startWorldX: worldX, startWorldY: worldY }
            }

            const hit = hitTestElement(worldX, worldY)
            if (hit) {
              if (hit.type === 'stroke' && !inkyStore.selectedStrokeIds.includes(hit.id))
                inkyStore.setSelection([hit.id], [])
              else if (hit.type === 'widget' && !inkyStore.selectedWidgetIds.includes(hit.id))
                inkyStore.setSelection([], [hit.id])
              const state = buildTransformState()
              inkyStore.setTransformInitialState(state)
              return { isDraggingSelection: true, startWorldX: worldX, startWorldY: worldY }
            }

            inkyStore.setSelection([], [])
            inkyStore.setMarquee({ startX: worldX, startY: worldY, endX: worldX, endY: worldY })
            return { isMarquee: true, startX: worldX, startY: worldY }
          }

          const { memo } = rest
          if (memo?.isResizing && inkyStore.transformInitialState) {
            handleResize(worldX, worldY, memo, requestStrokeGeneration)
            if (last) {
              inkyStore.setActiveHandle(null)
              inkyStore.setTransformInitialState(null)
            }
            return memo
          }
          if (memo?.isMarquee) {
            inkyStore.setMarquee({
              startX: memo.startX,
              startY: memo.startY,
              endX: worldX,
              endY: worldY,
            })
            if (last) {
              finalizeMarquee()
              inkyStore.setMarquee(null)
            }
            return memo
          }
          if (memo?.isDraggingSelection) {
            const totalDx = worldX - memo.startWorldX
            const totalDy = worldY - memo.startWorldY
            inkyStore.translateSelection(totalDx, totalDy)
            if (last) inkyStore.setTransformInitialState(null)
            return memo
          }
          return
        }

        // SHAPES
        const shapeTools: ToolType[] = ['rectangle', 'ellipse', 'arrow', 'line']
        if (shapeTools.includes(inkyStore.activeTool)) {
          if (first) {
            const id = Date.now().toString()
            currentStrokeIdRef.current = id
            const shapeStroke: Stroke = {
              id,
              points: [],
              color: inkyStore.strokeColor,
              size: inkyStore.strokeSize,
              boundingBox: { minX: worldX, minY: worldY, maxX: worldX, maxY: worldY },
              x: 0,
              y: 0,
              angle: 0,
              shapeType: inkyStore.activeTool as ShapeType,
              shapeData: { startX: worldX, startY: worldY, endX: worldX, endY: worldY },
            }
            inkyStore.setCurrentStroke(shapeStroke)
          } else if (last) {
            const cs = inkyStore.currentStroke
            if (cs?.shapeData) {
              const sd = cs.shapeData
              const pad = 10
              const bb = {
                minX: Math.min(sd.startX, sd.endX) - pad,
                minY: Math.min(sd.startY, sd.endY) - pad,
                maxX: Math.max(sd.startX, sd.endX) + pad,
                maxY: Math.max(sd.startY, sd.endY) + pad,
              }
              inkyStore.addStroke({ ...cs, boundingBox: bb })
              inkyStore.setCurrentStroke(null)
              currentStrokeIdRef.current = null
            }
          } else {
            if (inkyStore.currentStroke?.shapeData) {
              const sd = { ...inkyStore.currentStroke.shapeData, endX: worldX, endY: worldY }
              const pad = 10
              const bb = {
                minX: Math.min(sd.startX, sd.endX) - pad,
                minY: Math.min(sd.startY, sd.endY) - pad,
                maxX: Math.max(sd.startX, sd.endX) + pad,
                maxY: Math.max(sd.startY, sd.endY) + pad,
              }
              inkyStore.setCurrentStroke({
                ...inkyStore.currentStroke,
                shapeData: sd,
                boundingBox: bb,
              })
            }
          }
          return
        }

        // DRAW
        if (inkyStore.activeTool === 'draw') {
          const screenX = pointerEvent.clientX - rect.left
          const screenY = pointerEvent.clientY - rect.top
          const pressure = pointerEvent.pressure || 0.5
          const worldPoint = toWorld(screenX, screenY, inkyStore.camera)
          worldPoint.push(pressure)

          if (first) {
            const id = Date.now().toString()
            currentStrokeIdRef.current = id
            const newStroke: Stroke = {
              id,
              points: [worldPoint],
              color: inkyStore.strokeColor,
              size: inkyStore.strokeSize,
              boundingBox: getBoundingBox([worldPoint]),
              x: 0,
              y: 0,
              angle: 0,
            }
            inkyStore.setCurrentStroke(newStroke)
            requestStrokeGeneration(id, [worldPoint], {
              size: inkyStore.strokeSize,
              simulatePressure: false,
            })
          } else if (last) {
            const fs = inkyStore.currentStroke
            if (fs && currentStrokeIdRef.current) {
              inkyStore.addStroke({ ...fs, boundingBox: getBoundingBox(fs.points) })
              inkyStore.setCurrentStroke(null)
              currentStrokeIdRef.current = null
            }
          } else {
            if (inkyStore.currentStroke && currentStrokeIdRef.current) {
              const newPoints = [...inkyStore.currentStroke.points, worldPoint]
              inkyStore.setCurrentStroke({
                ...inkyStore.currentStroke,
                points: newPoints,
                boundingBox: getBoundingBox(newPoints),
              })
              requestStrokeGeneration(currentStrokeIdRef.current, newPoints, {
                size: inkyStore.strokeSize,
                simulatePressure: false,
              })
            }
          }
        }
      },
      onPinch: ({ offset: [zoomLevel], event }: any) => {
        event.preventDefault()
        inkyStore.setCamera({ z: zoomLevel })
      },
      onWheel: ({ event, delta: [dx, dy] }: any) => {
        if ((event.target as HTMLElement).closest('.inky-ui')) return
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) {
          const rect = containerRef.current?.getBoundingClientRect()
          if (!rect) return
          const screenX = event.clientX - rect.left
          const screenY = event.clientY - rect.top
          const [worldX, worldY] = toWorld(screenX, screenY, inkyStore.camera)
          const newZ = Math.min(Math.max(inkyStore.camera.z - dy * 0.01, 0.1), 5)
          inkyStore.setCamera({ x: screenX - worldX * newZ, y: screenY - worldY * newZ, z: newZ })
        } else {
          inkyStore.setCamera({ x: inkyStore.camera.x - dx, y: inkyStore.camera.y - dy })
        }
      },
    },
    {
      target: containerRef,
      eventOptions: { passive: false },
      drag: {
        from: () => [inkyStore.camera.x, inkyStore.camera.y],
        pointer: { keys: false },
        filterTaps: true,
      },
      pinch: { from: () => [inkyStore.camera.z, 0] },
    },
  )

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.inky-ui')) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const [worldX, worldY] = toWorld(e.clientX - rect.left, e.clientY - rect.top, inkyStore.camera)

    if (inkyStore.activeTool === 'text') {
      const id = Date.now().toString()
      inkyStore.addWidget({
        id,
        x: worldX,
        y: worldY - 20,
        width: 250,
        height: 40,
        type: 'text',
        content: '',
        scale: 1,
      })
      inkyStore.setSelection([], [id])
      inkyStore.setEditingWidget(id)
      inkyStore.setActiveTool('select')
      return
    }

    if (inkyStore.activeTool === 'select') {
      // Handle detection
      const selection = inkyStore.getSelectionBoundingBox()
      if (selection) {
        const handle = detectHandle(worldX, worldY, selection)
        if (handle) {
          inkyStore.setActiveHandle(handle)
          return
        }
        if (hitTestSelectionBox(worldX, worldY)) {
          inkyStore.setActiveHandle(null)
          return
        }
      }
      inkyStore.setActiveHandle(null)

      const hit = hitTestElement(worldX, worldY)
      if (hit) {
        if (hit.type === 'stroke' && !inkyStore.selectedStrokeIds.includes(hit.id))
          inkyStore.setSelection([hit.id], [])
        else if (hit.type === 'widget' && !inkyStore.selectedWidgetIds.includes(hit.id))
          inkyStore.setSelection([], [hit.id])
      } else {
        inkyStore.setSelection([], [])
      }
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (inkyStore.activeTool !== 'eraser') return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const [worldX, worldY] = toWorld(e.clientX - rect.left, e.clientY - rect.top, inkyStore.camera)

    let hitId: string | null = null
    for (let i = inkyStore.strokes.length - 1; i >= 0; i--) {
      const s = inkyStore.strokes[i]
      const sx = s.x || 0,
        sy = s.y || 0
      if (
        worldX >= s.boundingBox.minX + sx - 5 &&
        worldX <= s.boundingBox.maxX + sx + 5 &&
        worldY >= s.boundingBox.minY + sy - 5 &&
        worldY <= s.boundingBox.maxY + sy + 5
      ) {
        hitId = s.id
        break
      }
    }
    if (!hitId) {
      for (let i = inkyStore.widgets.length - 1; i >= 0; i--) {
        const w = inkyStore.widgets[i]
        if (worldX >= w.x && worldX <= w.x + w.width && worldY >= w.y && worldY <= w.y + w.height) {
          hitId = w.id
          break
        }
      }
    }
    inkyStore.setHoveredElementId(hitId)
  }

  // Cursor based on tool
  const cursorMap: Record<string, string> = {
    select: 'default',
    pan: 'grab',
    draw: 'crosshair',
    eraser: 'crosshair',
    text: 'text',
    rectangle: 'crosshair',
    ellipse: 'crosshair',
    arrow: 'crosshair',
    line: 'crosshair',
  }

  const gridColor = 'rgba(0,0,0,0.08)'
  const gridSize = 20 * camera.z
  const bgColor = '#f8f9fa'

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: bgColor,
        touchAction: 'none',
        cursor: cursorMap[activeTool] || 'default',
        backgroundImage: `radial-gradient(circle, ${gridColor} 1px, transparent 1px)`,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
        transition: 'background-color 300ms ease',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <CanvasLayer />
      <OverlayLayer />
      <Toolbar containerRef={containerRef} />
      <StylePanel />
      <ShortcutsModal />
    </div>
  )
}

// --- Helpers ---

function buildTransformState() {
  return {
    strokes: inkyStore.selectedStrokeIds.map((id) => {
      const s = inkyStore.strokes.find((x) => x.id === id)!
      return {
        id,
        points: JSON.parse(JSON.stringify(s.points)),
        boundingBox: { ...s.boundingBox },
        x: s.x,
        y: s.y,
        angle: s.angle,
      }
    }),
    widgets: inkyStore.selectedWidgetIds.map((id) => {
      const w = inkyStore.widgets.find((x) => x.id === id)!
      return {
        id,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        scale: w.scale || 1,
        angle: w.angle || 0,
      }
    }),
    selectionBox: inkyStore.getSelectionBoundingBox()!,
  }
}

function hitTestSelectionBox(worldX: number, worldY: number): boolean {
  const selection = inkyStore.getSelectionBoundingBox()
  if (!selection) return false
  const { box, angle } = selection
  const { minX, minY, maxX, maxY } = box
  const cx = minX + (maxX - minX) / 2,
    cy = minY + (maxY - minY) / 2
  const cosA = Math.cos(-angle),
    sinA = Math.sin(-angle)
  const ux = cx + (worldX - cx) * cosA - (worldY - cy) * sinA
  const uy = cy + (worldX - cx) * sinA + (worldY - cy) * cosA
  const pad = 4
  return ux >= minX - pad && ux <= maxX + pad && uy >= minY - pad && uy <= maxY + pad
}

function hitTestElement(
  worldX: number,
  worldY: number,
): { type: 'stroke' | 'widget'; id: string } | null {
  for (let i = inkyStore.strokes.length - 1; i >= 0; i--) {
    const s = inkyStore.strokes[i]
    const sx = s.x || 0,
      sy = s.y || 0
    // Unrotate the pointer into the stroke's local space for accurate OBB hit testing
    if (s.angle !== 0) {
      const bcx = s.boundingBox.minX + (s.boundingBox.maxX - s.boundingBox.minX) / 2 + sx
      const bcy = s.boundingBox.minY + (s.boundingBox.maxY - s.boundingBox.minY) / 2 + sy
      const cosA = Math.cos(-s.angle),
        sinA = Math.sin(-s.angle)
      const lx = bcx + (worldX - bcx) * cosA - (worldY - bcy) * sinA
      const ly = bcy + (worldX - bcx) * sinA + (worldY - bcy) * cosA
      if (
        lx >= s.boundingBox.minX + sx - 5 &&
        lx <= s.boundingBox.maxX + sx + 5 &&
        ly >= s.boundingBox.minY + sy - 5 &&
        ly <= s.boundingBox.maxY + sy + 5
      )
        return { type: 'stroke', id: s.id }
    } else {
      if (
        worldX >= s.boundingBox.minX + sx - 5 &&
        worldX <= s.boundingBox.maxX + sx + 5 &&
        worldY >= s.boundingBox.minY + sy - 5 &&
        worldY <= s.boundingBox.maxY + sy + 5
      )
        return { type: 'stroke', id: s.id }
    }
  }
  for (let i = inkyStore.widgets.length - 1; i >= 0; i--) {
    const w = inkyStore.widgets[i]
    if (worldX >= w.x && worldX <= w.x + w.width && worldY >= w.y && worldY <= w.y + w.height)
      return { type: 'widget', id: w.id }
  }
  return null
}

function detectHandle(
  worldX: number,
  worldY: number,
  selection: { box: any; angle: number },
): 'nw' | 'ne' | 'sw' | 'se' | 'rotate' | null {
  const { box, angle } = selection
  const { minX, minY, maxX, maxY } = box
  const cx = minX + (maxX - minX) / 2,
    cy = minY + (maxY - minY) / 2
  const cosA = Math.cos(-angle),
    sinA = Math.sin(-angle)
  const ux = cx + (worldX - cx) * cosA - (worldY - cy) * sinA
  const uy = cy + (worldX - cx) * sinA + (worldY - cy) * cosA
  const pad = 4
  const bx = minX - pad,
    by = minY - pad,
    bw = maxX - minX + pad * 2,
    bh = maxY - minY + pad * 2
  const threshold = 16 / inkyStore.camera.z
  const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x1 - x2, y1 - y2)

  if (dist(ux, uy, bx, by) < threshold) return 'nw'
  if (dist(ux, uy, bx + bw, by) < threshold) return 'ne'
  if (dist(ux, uy, bx, by + bh) < threshold) return 'sw'
  if (dist(ux, uy, bx + bw, by + bh) < threshold) return 'se'
  if (dist(ux, uy, bx + bw / 2, by - 24 / inkyStore.camera.z) < threshold) return 'rotate'
  return null
}

function handleResize(
  worldX: number,
  worldY: number,
  memo: any,
  requestStrokeGeneration: (id: string, points: Point[], options: any) => void,
) {
  const startX = memo.startWorldX,
    startY = memo.startWorldY
  const deltaX = worldX - startX,
    deltaY = worldY - startY
  const handle = inkyStore.activeHandle
  const state = inkyStore.transformInitialState!
  const sb = state.selectionBox

  if (handle === 'rotate') {
    const cx = sb.box.minX + (sb.box.maxX - sb.box.minX) / 2
    const cy = sb.box.minY + (sb.box.maxY - sb.box.minY) / 2
    const startAngle = Math.atan2(startY - cy, startX - cx)
    const currentAngle = Math.atan2(worldY - cy, worldX - cx)
    inkyStore.rotateSelection(currentAngle - startAngle, cx, cy)
    return
  }

  if (handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se') {
    const fixedX = handle.includes('e') ? sb.box.minX : sb.box.maxX
    const fixedY = handle.includes('s') ? sb.box.minY : sb.box.maxY
    const oldW = sb.box.maxX - sb.box.minX,
      oldH = sb.box.maxY - sb.box.minY
    let newW = oldW,
      newH = oldH

    if (handle === 'se') {
      newW += deltaX
      newH += deltaY
    }
    if (handle === 'nw') {
      newW -= deltaX
      newH -= deltaY
    }
    if (handle === 'ne') {
      newW += deltaX
      newH -= deltaY
    }
    if (handle === 'sw') {
      newW -= deltaX
      newH += deltaY
    }

    const scaleX = oldW === 0 ? 1 : newW / oldW
    const scaleY = oldH === 0 ? 1 : newH / oldH

    for (const s of state.strokes) {
      const target = inkyStore.strokes.find((x) => x.id === s.id)
      if (target) {
        target.points = s.points.map(
          (p) =>
            [fixedX + (p[0] - fixedX) * scaleX, fixedY + (p[1] - fixedY) * scaleY, p[2]] as Point,
        )
        let minX = Number.POSITIVE_INFINITY,
          minY = Number.POSITIVE_INFINITY,
          maxX = Number.NEGATIVE_INFINITY,
          maxY = Number.NEGATIVE_INFINITY
        for (const p of target.points) {
          if (p[0] < minX) minX = p[0]
          if (p[1] < minY) minY = p[1]
          if (p[0] > maxX) maxX = p[0]
          if (p[1] > maxY) maxY = p[1]
        }
        target.boundingBox = { minX, minY, maxX, maxY }
        requestStrokeGeneration(target.id, target.points, {})
      }
    }
    for (const w of state.widgets) {
      const target = inkyStore.widgets.find((x) => x.id === w.id)
      if (target) {
        target.x = fixedX + (w.x - fixedX) * scaleX
        target.y = fixedY + (w.y - fixedY) * scaleY
        target.width = Math.max(10, w.width * scaleX)
        target.height = Math.max(10, w.height * scaleY)
      }
    }
    inkyStore.notify()
  }
}

function finalizeMarquee() {
  const m = inkyStore.marquee
  if (!m) return
  const minX = Math.min(m.startX, m.endX),
    maxX = Math.max(m.startX, m.endX)
  const minY = Math.min(m.startY, m.endY),
    maxY = Math.max(m.startY, m.endY)

  const strokeIds: string[] = []
  for (const s of inkyStore.strokes) {
    // Account for OBB translation offsets
    const sx = s.x || 0,
      sy = s.y || 0
    if (
      !(
        s.boundingBox.maxX + sx < minX ||
        s.boundingBox.minX + sx > maxX ||
        s.boundingBox.maxY + sy < minY ||
        s.boundingBox.minY + sy > maxY
      )
    )
      strokeIds.push(s.id)
  }
  const widgetIds: string[] = []
  for (const w of inkyStore.widgets) {
    if (!(w.x + w.width < minX || w.x > maxX || w.y + w.height < minY || w.y > maxY))
      widgetIds.push(w.id)
  }
  inkyStore.setSelection(strokeIds, widgetIds)
}
function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2
  if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.sqrt((px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2)
}

function isPointOnStroke(worldX: number, worldY: number, stroke: Stroke): boolean {
  const sx = stroke.x || 0,
    sy = stroke.y || 0
  const { minX, minY, maxX, maxY } = stroke.boundingBox

  // Quick AABB check first (with decent padding)
  if (
    worldX < minX + sx - 20 ||
    worldX > maxX + sx + 20 ||
    worldY < minY + sy - 20 ||
    worldY > maxY + sy + 20
  )
    return false

  // Detailed check: unrotate the world point into the stroke's local space
  const bcx = minX + (maxX - minX) / 2 + sx
  const bcy = minY + (maxY - minY) / 2 + sy
  const cosA = Math.cos(-stroke.angle),
    sinA = Math.sin(-stroke.angle)
  const lx = bcx + (worldX - bcx) * cosA - (worldY - bcy) * sinA
  const ly = bcy + (worldX - bcx) * sinA + (worldY - bcy) * cosA

  const threshold = Math.max(10, stroke.size * 1.5)

  if (stroke.shapeType && stroke.shapeData) {
    const { startX, startY, endX, endY } = stroke.shapeData
    switch (stroke.shapeType) {
      case 'rectangle': {
        const rx = Math.min(startX, endX),
          ry = Math.min(startY, endY)
        const rw = Math.abs(endX - startX),
          rh = Math.abs(endY - startY)
        const onLeft =
          Math.abs(lx - rx) < threshold && ly >= ry - threshold && ly <= ry + rh + threshold
        const onRight =
          Math.abs(lx - (rx + rw)) < threshold && ly >= ry - threshold && ly <= ry + rh + threshold
        const onTop =
          Math.abs(ly - ry) < threshold && lx >= rx - threshold && lx <= rx + rw + threshold
        const onBottom =
          Math.abs(ly - (ry + rh)) < threshold && lx >= rx - threshold && lx <= rx + rw + threshold
        return onLeft || onRight || onTop || onBottom
      }
      case 'ellipse': {
        const ecx = (startX + endX) / 2,
          ecy = (startY + endY) / 2
        const erx = Math.max(1, Math.abs(endX - startX) / 2)
        const ery = Math.max(1, Math.abs(endY - startY) / 2)
        const dx = lx - ecx,
          dy = ly - ecy
        const val = (dx * dx) / (erx * erx) + (dy * dy) / (ery * ery)
        return Math.abs(val - 1) < 0.25 * (20 / Math.max(erx, ery)) + 0.1
      }
      case 'line':
      case 'arrow': {
        return distToSegment(lx, ly, startX, startY, endX, endY) < threshold
      }
    }
  }

  // Freehand stroke: check distance to segments
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const p1 = stroke.points[i],
      p2 = stroke.points[i + 1]
    if (distToSegment(lx, ly, p1[0], p1[1], p2[0], p2[1]) < threshold) return true
  }
  return false
}
