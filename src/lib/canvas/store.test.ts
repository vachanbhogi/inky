import { describe, expect, it } from 'vitest'
import { inkyStore } from './store'

describe('inkyStore', () => {
  it('manages camera position and zoom limits', () => {
    inkyStore.setCamera({ x: 100, y: 200, z: 2 })
    expect(inkyStore.camera).toEqual({ x: 100, y: 200, z: 2 })

    // clamp zoom between 0.1 and 5
    inkyStore.setCamera({ z: 10 })
    expect(inkyStore.camera.z).toBe(5)

    inkyStore.setCamera({ z: 0.01 })
    expect(inkyStore.camera.z).toBe(0.1)
  })

  it('adds and undoes strokes', () => {
    inkyStore.strokes = []
    const stroke = {
      id: 'stroke-1',
      points: [
        [0, 0],
        [10, 10],
      ] as [number, number][],
      color: '#111111',
      size: 4,
      boundingBox: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    }

    inkyStore.addStroke(stroke)
    expect(inkyStore.strokes.length).toBe(1)
    expect(inkyStore.canUndo).toBe(true)

    inkyStore.undo()
    expect(inkyStore.strokes.length).toBe(0)
    expect(inkyStore.canRedo).toBe(true)

    inkyStore.redo()
    expect(inkyStore.strokes.length).toBe(1)
  })

  it('notifies listeners on state change', () => {
    let callCount = 0
    const unsub = inkyStore.subscribe(() => {
      callCount++
    })

    inkyStore.setActiveTool('eraser')
    expect(callCount).toBe(1)
    expect(inkyStore.activeTool).toBe('eraser')

    unsub()
    inkyStore.setActiveTool('draw')
    expect(callCount).toBe(1) // no new call after unsubscribe
  })

  it('updates stroke color and tool switching correctly', () => {
    inkyStore.setStrokeColor('#2563eb')
    expect(inkyStore.strokeColor).toBe('#2563eb')

    inkyStore.setStrokeSize(6)
    expect(inkyStore.strokeSize).toBe(6)
  })

  it('manages stroke selection and marquee state', () => {
    inkyStore.strokes = [
      {
        id: 's1',
        points: [[0, 0]],
        color: '#111',
        size: 4,
        boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      },
      {
        id: 's2',
        points: [[50, 50]],
        color: '#111',
        size: 4,
        boundingBox: { minX: 50, minY: 50, maxX: 50, maxY: 50 },
      },
    ]

    inkyStore.selectStroke('s1')
    expect(inkyStore.selectedStrokeIds).toEqual(['s1'])

    // Multi-select toggle
    inkyStore.selectStroke('s2', true)
    expect(inkyStore.selectedStrokeIds).toEqual(['s1', 's2'])

    // Clear selection
    inkyStore.clearSelection()
    expect(inkyStore.selectedStrokeIds).toEqual([])

    // Set Marquee
    inkyStore.setMarquee({ startX: 0, startY: 0, endX: 100, endY: 100 })
    expect(inkyStore.marquee).toEqual({ startX: 0, startY: 0, endX: 100, endY: 100 })
  })

  it('translates selected strokes and commits transform to undo stack', () => {
    inkyStore.strokes = [
      {
        id: 's1',
        points: [
          [10, 10],
          [20, 20],
        ],
        color: '#111',
        size: 4,
        boundingBox: { minX: 10, minY: 10, maxX: 20, maxY: 20 },
      },
    ]
    inkyStore.selectStroke('s1')
    inkyStore.transformInitialState = {
      strokes: [
        {
          id: 's1',
          points: [
            [10, 10],
            [20, 20],
          ],
          boundingBox: { minX: 10, minY: 10, maxX: 20, maxY: 20 },
        },
      ],
      chars: [],
      selectionBox: { minX: 10, minY: 10, maxX: 20, maxY: 20 },
    }

    inkyStore.translateSelected(15, 25)

    expect(inkyStore.strokes[0].points).toEqual([
      [25, 35],
      [35, 45],
    ])
    expect(inkyStore.strokes[0].boundingBox).toEqual({
      minX: 25,
      minY: 35,
      maxX: 35,
      maxY: 45,
    })

    inkyStore.commitTransform()
    expect(inkyStore.transformInitialState).toBeNull()
    expect(inkyStore.canUndo).toBe(true)

    // Undo should restore original points
    inkyStore.undo()
    expect(inkyStore.strokes[0].points).toEqual([
      [10, 10],
      [20, 20],
    ])
  })

  it('scales selected strokes via corner handles correctly', () => {
    inkyStore.strokes = [
      {
        id: 's1',
        points: [
          [100, 100],
          [200, 200],
        ],
        color: '#111',
        size: 4,
        boundingBox: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
      },
    ]
    inkyStore.selectStroke('s1')
    inkyStore.transformInitialState = {
      strokes: [
        {
          id: 's1',
          points: [
            [100, 100],
            [200, 200],
          ],
          boundingBox: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
        },
      ],
      chars: [],
      selectionBox: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
    }

    // Drag SE handle from (200, 200) to (250, 250) (1.5x scale from anchor (100, 100))
    inkyStore.scaleSelected('se', 250, 250)

    expect(inkyStore.strokes[0].points[0]).toEqual([100, 100])
    expect(inkyStore.strokes[0].points[1]).toEqual([250, 250])
  })

  it('rotates selected strokes accurately around selection center', () => {
    inkyStore.strokes = [
      {
        id: 's1',
        points: [
          [100, 100],
          [200, 200],
        ],
        color: '#111',
        size: 4,
        boundingBox: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
      },
    ]
    inkyStore.selectStroke('s1')
    inkyStore.transformInitialState = {
      strokes: [
        {
          id: 's1',
          points: [
            [100, 100],
            [200, 200],
          ],
          boundingBox: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
          angle: 0,
        },
      ],
      chars: [],
      selectionBox: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
    }

    // Center is (150, 150). Drag handle from top (150, 50) to right (250, 150) (+90 deg or PI/2)
    inkyStore.rotateSelected(250, 150)
    expect(inkyStore.strokes[0].angle).toBeCloseTo(Math.PI / 2, 4)
  })

  it('deletes selected strokes and restores them on undo', () => {
    inkyStore.strokes = [
      {
        id: 's1',
        points: [[0, 0]],
        color: '#111',
        size: 4,
        boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      },
      {
        id: 's2',
        points: [[10, 10]],
        color: '#111',
        size: 4,
        boundingBox: { minX: 10, minY: 10, maxX: 10, maxY: 10 },
      },
    ]

    inkyStore.selectStroke('s1')
    expect(inkyStore.selectedStrokeIds).toEqual(['s1'])

    inkyStore.deleteSelected()
    expect(inkyStore.strokes.length).toBe(1)
    expect(inkyStore.strokes[0].id).toBe('s2')
    expect(inkyStore.selectedStrokeIds).toEqual([])
    expect(inkyStore.canUndo).toBe(true)

    // Undo restores the deleted stroke
    inkyStore.undo()
    expect(inkyStore.strokes.length).toBe(2)
    expect(inkyStore.strokes.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('manages hoveredStrokeId state and clears on tool switch', () => {
    inkyStore.setHoveredStrokeId('stroke-abc')
    expect(inkyStore.hoveredStrokeId).toBe('stroke-abc')

    inkyStore.setActiveTool('draw')
    expect(inkyStore.hoveredStrokeId).toBeNull()
  })

  it('selects all strokes and switches active tool to select', () => {
    inkyStore.strokes = [
      {
        id: 's1',
        points: [[0, 0]],
        color: '#111',
        size: 4,
        boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      },
      {
        id: 's2',
        points: [[10, 10]],
        color: '#111',
        size: 4,
        boundingBox: { minX: 10, minY: 10, maxX: 10, maxY: 10 },
      },
    ]
    inkyStore.selectedStrokeIds = []
    inkyStore.setActiveTool('draw')

    inkyStore.selectAll()
    expect(inkyStore.selectedStrokeIds).toEqual(['s1', 's2'])
    expect(inkyStore.activeTool).toBe('select')
  })

  it('tracks dynamic eraserPoint contact position and radius', () => {
    inkyStore.setEraserPoint({ x: 50, y: 75, radius: 28 })
    expect(inkyStore.eraserPoint).toEqual({ x: 50, y: 75, radius: 28 })

    inkyStore.setEraserPoint(null)
    expect(inkyStore.eraserPoint).toBeNull()
  })

  it('manages graphSidebar state and notifies subscribers', () => {
    inkyStore.closeGraphSidebar()
    let callCount = 0
    const unsub = inkyStore.subscribe(() => {
      callCount++
    })

    expect(inkyStore.graphSidebar).toEqual({ isOpen: false, equation: '' })

    inkyStore.openGraphSidebar()
    expect(inkyStore.graphSidebar).toEqual({ isOpen: true, equation: '' })
    expect(callCount).toBe(1)

    // Replacing with another equation
    inkyStore.openGraphSidebar('3x = y')
    expect(inkyStore.graphSidebar).toEqual({ isOpen: true, equation: '3x = y' })
    expect(callCount).toBe(2)

    // Updating equation directly (e.g. user typed in sidebar)
    inkyStore.updateGraphedEquation('y = 2x + 1')
    expect(inkyStore.graphSidebar).toEqual({ isOpen: true, equation: 'y = 2x + 1' })
    expect(callCount).toBe(3)

    // Closing sidebar
    inkyStore.closeGraphSidebar()
    expect(inkyStore.graphSidebar.isOpen).toBe(false)
    expect(callCount).toBe(4)

    unsub()
  })
})
