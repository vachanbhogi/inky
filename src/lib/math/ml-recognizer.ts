import MathInferenceWorker from '../../workers/math-inference.worker?worker'
import type { Stroke } from '../canvas/types'
import { rasterizeToModelInput } from './stroke-rasterizer'

// Generous enough for first-run model fetch (77MB local) + WASM inference,
// short enough that a stuck worker falls back to rule-based latex fast.
const RECOGNIZE_TIMEOUT_MS = 8000

let worker: Worker | null = null
let nextId = 0
const pending = new Map<
  number,
  { resolve: (latex: string | null) => void; timer: ReturnType<typeof setTimeout> }
>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new MathInferenceWorker()
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as
      | { status: 'loading' | 'ready' }
      | { id: number; latex?: string; error?: string }
    if ('status' in data) return
    const entry = pending.get(data.id)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.delete(data.id)
    entry.resolve(data.error ? null : (data.latex ?? null))
  }
  worker.onerror = () => {
    // Fail all in-flight requests; capsule keeps rule-based latex.
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.resolve(null)
    }
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

/** Run the ONNX FormulaNet pipeline on ink strokes. Resolves `null` on
 * timeout, worker error, or empty model output — callers keep the
 * rule-based fallback in that case. */
export function recognizeInkML(strokes: Stroke[]): Promise<string | null> {
  if (strokes.length === 0) return Promise.resolve(null)

  let pixels: Float32Array
  try {
    pixels = rasterizeToModelInput(strokes)
  } catch {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve(null)
    }, RECOGNIZE_TIMEOUT_MS)
    pending.set(id, { resolve, timer })
    try {
      ensureWorker().postMessage({ id, pixels }, [pixels.buffer])
    } catch {
      clearTimeout(timer)
      pending.delete(id)
      resolve(null)
    }
  })
}
