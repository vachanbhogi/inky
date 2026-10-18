import { useEffect, useRef, useState } from 'react'
import type { Point } from '../../lib/canvas/coordinates'
import { toWorld } from '../../lib/canvas/coordinates'
import {
  checkBoundingBoxOverlap,
  detectHandle,
  getBoundingBox,
  isPointOnStroke,
} from '../../lib/canvas/spatial-index'
import { inkyStore } from '../../lib/canvas/store'
import { generateStrokePath } from '../../lib/canvas/svg-utils'
import { computeTouchGesture, type TouchPoint } from '../../lib/canvas/touch-gesture'
import type { Stroke } from '../../lib/canvas/types'
import PerfectFreehandWorker from '../../workers/perfect-freehand.worker?worker'
import { CanvasLayer } from './CanvasLayer'
import { Toolbar } from './Toolbar'

export function InkyBoard() {
  const containerRef = useRef<HTMLDivElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const currentStrokeRef = useRef<{ id: string; points: Point[] } | null>(null)
  const isPointerDownRef = useRef(false)
  const lastPanPointRef = useRef<{ x: number; y: number } | null>(null)
  const dragStartWorldRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingSelectionRef = useRef(false)
  const previousToolRef = useRef<typeof inkyStore.activeTool | null>(null)
  const isSpaceDownRef = useRef(false)
  const activePointersRef = useRef<Map<number, TouchPoint>>(new Map())
  const isPinchingRef = useRef(false)

  const [activeTool, setActiveTool] = useState(inkyStore.activeTool)
  const [camera, setCamera] = useState(inkyStore.camera)

  useEffect(() => {
    const unsub = inkyStore.subscribe(() => {
      setActiveTool(inkyStore.activeTool)
      setCamera({ ...inkyStore.camera })
    })

    const worker = new PerfectFreehandWorker()
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent) => {
      const { id, pathData, status } = event.data
      if (status !== 'success') return

      if (currentStrokeRef.current && currentStrokeRef.current.id === id) {
        if (inkyStore.currentStroke) {
          inkyStore.setCurrentStroke({
            ...inkyStore.currentStroke,
            pathData,
          })
        }
      } else {
        const idx = inkyStore.strokes.findIndex((s) => s.id === id)
        if (idx !== -1) {
          inkyStore.strokes[idx].pathData = pathData
          inkyStore.notify()
        }
      }
    }

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) inkyStore.redo()
        else inkyStore.undo()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        inkyStore.selectAll()
        return
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        inkyStore.setCamera({ z: inkyStore.camera.z + 0.1 })
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        inkyStore.setCamera({ z: inkyStore.camera.z - 0.1 })
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        inkyStore.setCamera({ z: 1 })
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        inkyStore.clearSelection()
        return
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (inkyStore.selectedStrokeIds.length > 0) {
          e.preventDefault()
          inkyStore.deleteSelected()
          return
        }
      }

      if (e.key === ' ' && !isSpaceDownRef.current) {
        isSpaceDownRef.current = true
        previousToolRef.current = inkyStore.activeTool
        inkyStore.setActiveTool('pan')
        e.preventDefault()
        return
      }

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
        case 'e':
        case '0':
          inkyStore.setActiveTool('eraser')
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
      unsub()
      worker.terminate()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.inky-ui')) return
    const container = containerRef.current
    if (!container) return

    container.setPointerCapture(e.pointerId)
    isPointerDownRef.current = true

    const rect = container.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Register touch pointer for multi-touch gesture detection
    if (e.pointerType === 'touch') {
      activePointersRef.current.set(e.pointerId, { id: e.pointerId, x: screenX, y: screenY })
      if (activePointersRef.current.size >= 2) {
        // Cancel active stroke if second finger lands
        isPinchingRef.current = true
        if (currentStrokeRef.current) {
          inkyStore.setCurrentStroke(null)
          currentStrokeRef.current = null
        }
        return
      }
    }

    if (e.button === 1 || activeTool === 'pan') {
      lastPanPointRef.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (activeTool === 'draw') {
      const pressure = e.pointerType === 'pen' ? e.pressure : undefined
      const worldPoint = toWorld(screenX, screenY, inkyStore.camera, pressure)
      const strokeId = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const points = [worldPoint]

      currentStrokeRef.current = { id: strokeId, points }

      const newStroke: Stroke = {
        id: strokeId,
        points,
        color: inkyStore.strokeColor,
        size: inkyStore.strokeSize,
        boundingBox: getBoundingBox(points),
      }

      inkyStore.setCurrentStroke(newStroke)
      workerRef.current?.postMessage({
        id: strokeId,
        points,
        options: { size: inkyStore.strokeSize },
      })
    } else if (activeTool === 'select') {
      const [worldX, worldY] = toWorld(screenX, screenY, inkyStore.camera)
      const currentBox = inkyStore.getSelectionBoundingBox()

      // Check if clicking a resize or rotate handle first
      const hitHandle = currentBox
        ? detectHandle(
            worldX,
            worldY,
            { box: currentBox },
            inkyStore.camera.z,
            e.pointerType === 'touch',
          )
        : null

      if (currentBox && hitHandle) {
        inkyStore.setActiveHandle(hitHandle)
        const selected = inkyStore.strokes.filter((s) => inkyStore.selectedStrokeIds.includes(s.id))
        inkyStore.transformInitialState = {
          strokes: selected.map((s) => ({
            id: s.id,
            points: s.points.map(([px, py]) => [px, py]),
            boundingBox: { ...s.boundingBox },
            pathData: s.pathData,
            angle: s.angle,
          })),
          selectionBox: { ...currentBox },
        }
        return
      }

      // If clicking inside existing selection bounding box, start translating
      const isInsideSelection =
        currentBox &&
        worldX >= currentBox.minX - 4 &&
        worldX <= currentBox.maxX + 4 &&
        worldY >= currentBox.minY - 4 &&
        worldY <= currentBox.maxY + 4

      // Test reverse order so top-most stroke is clicked first
      let clickedStroke: Stroke | null = null
      for (let i = inkyStore.strokes.length - 1; i >= 0; i--) {
        const s = inkyStore.strokes[i]
        if (isPointOnStroke(worldX, worldY, s)) {
          clickedStroke = s
          break
        }
      }

      if (
        isInsideSelection &&
        (!clickedStroke || inkyStore.selectedStrokeIds.includes(clickedStroke.id))
      ) {
        // Dragging existing selection
        isDraggingSelectionRef.current = true
        dragStartWorldRef.current = { x: worldX, y: worldY }
        const selected = inkyStore.strokes.filter((s) => inkyStore.selectedStrokeIds.includes(s.id))
        inkyStore.transformInitialState = {
          strokes: selected.map((s) => ({
            id: s.id,
            points: s.points.map(([px, py]) => [px, py]),
            boundingBox: { ...s.boundingBox },
            pathData: s.pathData,
            angle: s.angle,
          })),
          selectionBox: { ...currentBox },
        }
      } else if (clickedStroke) {
        inkyStore.selectStroke(clickedStroke.id, e.shiftKey)
        const updatedBox = inkyStore.getSelectionBoundingBox()
        if (updatedBox) {
          isDraggingSelectionRef.current = true
          dragStartWorldRef.current = { x: worldX, y: worldY }
          const selected = inkyStore.strokes.filter((s) =>
            inkyStore.selectedStrokeIds.includes(s.id),
          )
          inkyStore.transformInitialState = {
            strokes: selected.map((s) => ({
              id: s.id,
              points: s.points.map(([px, py]) => [px, py]),
              boundingBox: { ...s.boundingBox },
              pathData: s.pathData,
              angle: s.angle,
            })),
            selectionBox: { ...updatedBox },
          }
        }
      } else {
        if (!e.shiftKey) {
          inkyStore.clearSelection()
        }
        inkyStore.setMarquee({ startX: worldX, startY: worldY, endX: worldX, endY: worldY })
      }
    } else if (activeTool === 'eraser') {
      eraseAtScreenPoint(screenX, screenY)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Multi-touch pinch-to-zoom & pan handling
    if (e.pointerType === 'touch' && activePointersRef.current.has(e.pointerId)) {
      const prevTouches = Array.from(activePointersRef.current.values())
      activePointersRef.current.set(e.pointerId, { id: e.pointerId, x: screenX, y: screenY })
      const nextTouches = Array.from(activePointersRef.current.values())

      if (activePointersRef.current.size >= 2) {
        const gestureResult = computeTouchGesture(prevTouches, nextTouches, inkyStore.camera)
        if (gestureResult) {
          inkyStore.setCamera(gestureResult.camera)
        }
        return
      }
    }

    if (isPinchingRef.current) return

    // When in eraser mode, update hovered stroke for visual bounding box feedback
    if (activeTool === 'eraser') {
      const [worldX, worldY] = toWorld(screenX, screenY, inkyStore.camera)
      let hitId: string | null = null
      for (let i = inkyStore.strokes.length - 1; i >= 0; i--) {
        const s = inkyStore.strokes[i]
        if (isPointOnStroke(worldX, worldY, s, 20 / inkyStore.camera.z)) {
          hitId = s.id
          break
        }
      }
      inkyStore.setHoveredStrokeId(hitId)
    }

    if (!isPointerDownRef.current) return

    if (lastPanPointRef.current) {
      const dx = e.clientX - lastPanPointRef.current.x
      const dy = e.clientY - lastPanPointRef.current.y
      lastPanPointRef.current = { x: e.clientX, y: e.clientY }
      inkyStore.setCamera({
        x: inkyStore.camera.x + dx,
        y: inkyStore.camera.y + dy,
      })
      return
    }

    if (activeTool === 'draw' && currentStrokeRef.current) {
      const pressure = e.pointerType === 'pen' ? e.pressure : undefined
      const worldPoint = toWorld(screenX, screenY, inkyStore.camera, pressure)
      currentStrokeRef.current.points.push(worldPoint)
      const points = currentStrokeRef.current.points

      // Compute immediate path synchronously for 60fps responsiveness
      const immediatePath = generateStrokePath(points, inkyStore.strokeSize)

      if (inkyStore.currentStroke) {
        inkyStore.setCurrentStroke({
          ...inkyStore.currentStroke,
          points,
          pathData: immediatePath,
          boundingBox: getBoundingBox(points),
        })
      }

      // Delegate final polygon optimization to web worker asynchronously
      workerRef.current?.postMessage({
        id: currentStrokeRef.current.id,
        points,
        options: { size: inkyStore.strokeSize },
      })
    } else if (activeTool === 'select') {
      const [worldX, worldY] = toWorld(screenX, screenY, inkyStore.camera)

      if (inkyStore.activeHandle === 'rotate') {
        inkyStore.rotateSelected(worldX, worldY)
      } else if (inkyStore.activeHandle) {
        inkyStore.scaleSelected(inkyStore.activeHandle, worldX, worldY)
      } else if (isDraggingSelectionRef.current && dragStartWorldRef.current) {
        const dx = worldX - dragStartWorldRef.current.x
        const dy = worldY - dragStartWorldRef.current.y
        inkyStore.translateSelected(dx, dy)
      } else if (inkyStore.marquee) {
        inkyStore.setMarquee({
          startX: inkyStore.marquee.startX,
          startY: inkyStore.marquee.startY,
          endX: worldX,
          endY: worldY,
        })
      }
    } else if (activeTool === 'eraser') {
      eraseAtScreenPoint(screenX, screenY)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      activePointersRef.current.delete(e.pointerId)
      if (activePointersRef.current.size < 2) {
        isPinchingRef.current = false
      }
    }

    if (!isPointerDownRef.current) return
    isPointerDownRef.current = false
    lastPanPointRef.current = null

    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId)
    }

    if (activeTool === 'draw' && inkyStore.currentStroke) {
      const finalStroke = inkyStore.currentStroke
      inkyStore.setCurrentStroke(null)
      currentStrokeRef.current = null
      inkyStore.addStroke(finalStroke)
    } else if (activeTool === 'select') {
      if (inkyStore.activeHandle) {
        inkyStore.setActiveHandle(null)
        inkyStore.commitTransform()
      } else if (isDraggingSelectionRef.current) {
        isDraggingSelectionRef.current = false
        dragStartWorldRef.current = null
        inkyStore.commitTransform()
      } else if (inkyStore.marquee) {
        const m = inkyStore.marquee
        const marqueeBox = {
          minX: Math.min(m.startX, m.endX),
          minY: Math.min(m.startY, m.endY),
          maxX: Math.max(m.startX, m.endX),
          maxY: Math.max(m.startY, m.endY),
        }

        // Check if marquee has non-trivial drag (e.g. at least 3px)
        const width = marqueeBox.maxX - marqueeBox.minX
        const height = marqueeBox.maxY - marqueeBox.minY

        if (width > 3 || height > 3) {
          const selectedIds = inkyStore.strokes
            .filter((s) => checkBoundingBoxOverlap(marqueeBox, s.boundingBox))
            .map((s) => s.id)
          inkyStore.selectStrokes(selectedIds)
        }

        inkyStore.setMarquee(null)
      }
    }
  }

  const eraseAtScreenPoint = (screenX: number, screenY: number) => {
    const worldPoint = toWorld(screenX, screenY, inkyStore.camera)
    const eraserRadius = 16 / inkyStore.camera.z

    const toDeleteId =
      inkyStore.hoveredStrokeId ||
      inkyStore.strokes.find((s) => isPointOnStroke(worldPoint[0], worldPoint[1], s, eraserRadius))
        ?.id

    if (toDeleteId) {
      inkyStore.deleteStroke(toDeleteId)
      inkyStore.setHoveredStrokeId(null)
      return
    }

    const remainingStrokes = inkyStore.strokes.filter((stroke) => {
      return !stroke.points.some(([px, py]) => {
        const dist = Math.hypot(px - worldPoint[0], py - worldPoint[1])
        return dist <= eraserRadius
      })
    })

    if (remainingStrokes.length !== inkyStore.strokes.length) {
      inkyStore.strokes = remainingStrokes
      inkyStore.notify()
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.inky-ui')) return
    e.preventDefault()

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    if (e.ctrlKey || e.metaKey) {
      const [worldX, worldY] = toWorld(screenX, screenY, inkyStore.camera)
      const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95
      const newZ = Math.min(Math.max(inkyStore.camera.z * zoomFactor, 0.1), 5)

      inkyStore.setCamera({
        x: screenX - worldX * newZ,
        y: screenY - worldY * newZ,
        z: newZ,
      })
    } else {
      inkyStore.setCamera({
        x: inkyStore.camera.x - e.deltaX,
        y: inkyStore.camera.y - e.deltaY,
      })
    }
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Inky Math Canvas"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      className={`inky-canvas-root relative w-full h-full touch-none select-none overflow-hidden ${
        activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
      }`}
      style={{
        backgroundColor: '#fbfbfa',
        backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.08) 1px, transparent 1px)',
        backgroundSize: `${24 * camera.z}px ${24 * camera.z}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
    >
      <CanvasLayer />
      <Toolbar />
    </div>
  )
}
