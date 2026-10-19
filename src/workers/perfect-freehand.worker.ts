import { getStroke } from 'perfect-freehand'
import { getSvgPathFromStroke } from '../lib/canvas/svg-utils'

const ctx: Worker = self as unknown as Worker

ctx.onmessage = (event) => {
  const { id, points, options } = event.data
  try {
    const strokeOptions = {
      size: options?.size || 4,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      easing: (t: number) => t,
      simulatePressure: options?.simulatePressure ?? false,
    }

    const outlinePoints = getStroke(points, strokeOptions)
    const pathData = getSvgPathFromStroke(outlinePoints)

    ctx.postMessage({ id, pathData, status: 'success' })
  } catch (error: unknown) {
    ctx.postMessage({
      id,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
