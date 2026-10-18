import { getStroke } from 'perfect-freehand'
import { getSvgPathFromStroke } from '../lib/canvas/svg-utils'

// Web Worker context
const ctx: Worker = self as any

ctx.addEventListener('message', (event) => {
  const { id, points, options } = event.data

  try {
    // Generate the polygon points from the raw input points
    const strokePoints = getStroke(points, options)

    // Convert the polygon points to an SVG path string for easy Canvas rendering
    // (We use Path2D(pathData) in the canvas render loop)
    const pathData = getSvgPathFromStroke(strokePoints)

    // Send back to main thread
    ctx.postMessage({ id, pathData, status: 'success' })
  } catch (error) {
    ctx.postMessage({ id, error: String(error), status: 'error' })
  }
})
