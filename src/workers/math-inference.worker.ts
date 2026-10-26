/// <reference lib="webworker" />
// Route the .wasm through Vite's asset graph (`?url`) so dev and prod serve it
// with a hashed URL. Overriding only the `.wasm` (not the `.mjs` glue) makes
// ORT use the glue module embedded in the `onnxruntime-web/wasm` bundle and
// skip the dynamic `.mjs` import that Vite dev refuses to serve from /public.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import * as ort from 'onnxruntime-web/wasm'
import type { TokenVocab } from '../lib/math/ml-decode'
import {
  idsToLatex,
  shouldStopDecoding,
  topKTokensFromLogits,
} from '../lib/math/ml-decode'
import { cleanModelLatex, RASTER_SIZE } from '../lib/math/stroke-rasterizer'

if (typeof window === 'undefined') {
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }
  // Keep inference single-threaded: deterministic and avoids SharedArrayBuffer
  // requirements in browsers without COOP/COEP isolation.
  ort.env.wasm.numThreads = 1
}

interface RecognizeMessage {
  id: number
  pixels: Float32Array // 3*384*384 model input (already tiled RGB)
}

type InMessage = { type: 'prewarm' } | RecognizeMessage

type OutMessage =
  | { status: 'loading' | 'ready' }
  | { status: 'error'; error: string }
  | { id: number; latex: string }
  | { id: number; error: string }

const ctx = (typeof self !== 'undefined' ? self : undefined) as unknown as Worker

const post = (msg: OutMessage) => {
  if (typeof ctx !== 'undefined' && typeof ctx.postMessage === 'function') {
    ctx.postMessage(msg)
  }
}

let sessionsPromise: Promise<{
  enc: ort.InferenceSession
  dec: ort.InferenceSession
  vocab: TokenVocab
}> | null = null

const MODEL_BASE = `${import.meta.env.BASE_URL}models/`

function loadSessions() {
  if (!sessionsPromise) {
    post({ status: 'loading' })
    sessionsPromise = (async () => {
      const vocabRes = await fetch(`${MODEL_BASE}formulanet-tokens.json`)
      if (!vocabRes.ok) throw new Error(`vocab fetch failed: ${vocabRes.status}`)
      const vocab = (await vocabRes.json()) as TokenVocab

      const [encBuf, decBuf] = await Promise.all([
        fetch(`${MODEL_BASE}encoder.ort`).then((r) => {
          if (!r.ok) throw new Error(`encoder fetch failed: ${r.status}`)
          return r.arrayBuffer()
        }),
        fetch(`${MODEL_BASE}decoder.ort`).then((r) => {
          if (!r.ok) throw new Error(`decoder fetch failed: ${r.status}`)
          return r.arrayBuffer()
        }),
      ])

      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
      }
      const [enc, dec] = await Promise.all([
        ort.InferenceSession.create(encBuf, options),
        ort.InferenceSession.create(decBuf, options),
      ])
      post({ status: 'ready' })
      return { enc, dec, vocab }
    })()
    // M11: never cache a rejected load — one flaky fetch (offline, cold
    // cache) must not permanently disable recognition for the session.
    sessionsPromise = sessionsPromise.catch((err: unknown) => {
      sessionsPromise = null
      const message = err instanceof Error ? err.message : String(err)
      post({ status: 'error', error: message })
      throw err
    })
  }
  return sessionsPromise
}

async function recognize(pixels: Float32Array): Promise<string> {
  const { enc, dec, vocab } = await loadSessions()

  const input = new ort.Tensor('float32', pixels, [1, 3, RASTER_SIZE, RASTER_SIZE])
  const encOut = await enc.run({ pixel_values: input })
  const hidden = encOut.last_hidden_state

  // Beam Search Decoding (Width = 3) with mathematical syntax prior
  const BEAM_WIDTH = 3
  let beams: Array<{ ids: number[]; logProb: number; done: boolean }> = [
    { ids: [vocab.bosId], logProb: 0, done: false },
  ]

  let step = 0
  const maxSteps = vocab.maxLen || 64

  while (step < maxSteps && beams.some((b) => !b.done)) {
    const candidates: Array<{ ids: number[]; logProb: number; done: boolean }> = []

    for (const b of beams) {
      if (b.done) {
        candidates.push(b)
        continue
      }

      const inputIds = new ort.Tensor('int64', BigInt64Array.from(b.ids.map(BigInt)), [1, b.ids.length])
      const decOut = await dec.run({
        input_ids: inputIds,
        encoder_hidden_states: hidden,
      })
      const logits = decOut.logits.data as Float32Array
      const topK = topKTokensFromLogits(logits, b.ids.length, vocab.vocabSize, BEAM_WIDTH)

      for (const tok of topK) {
        const nextIds = [...b.ids, tok.id]
        const done = shouldStopDecoding(nextIds, vocab)
        candidates.push({
          ids: nextIds,
          logProb: b.logProb + tok.logProb,
          done,
        })
      }
    }

    // Sort all candidates by length-normalized log-probability
    candidates.sort((a, b) => {
      const scoreA = a.logProb / Math.max(1, a.ids.length)
      const scoreB = b.logProb / Math.max(1, b.ids.length)
      return scoreB - scoreA
    })

    beams = candidates.slice(0, BEAM_WIDTH)
    step++
  }

  // Pick the highest scoring completed beam
  const bestBeam = beams[0]?.ids ?? [vocab.bosId]
  return cleanModelLatex(idsToLatex(bestBeam, vocab))
}

if (typeof ctx !== 'undefined' && typeof ctx.addEventListener === 'function') {
  ctx.addEventListener('message', (event: MessageEvent<InMessage>) => {
    const data = event.data
    if (!data) return
    if ('type' in data && data.type === 'prewarm') {
      loadSessions().catch(() => {})
      return
    }
    if ('pixels' in data) {
      const { id, pixels } = data
      recognize(pixels)
        .then((latex) => {
          post({ id, latex })
        })
        .catch((err: unknown) => {
          post({ id, error: err instanceof Error ? err.message : String(err) })
        })
    }
  })
}

export default class MathInferenceWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  postMessage(_msg: unknown, _transfer?: Transferable[]) {}
  terminate() {}
}
