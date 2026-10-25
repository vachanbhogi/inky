import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getModelStatus,
  type ModelStatus,
  onModelStatusChange,
  prewarmModel,
  setWorkerFactoryForTest,
} from './ml-recognizer'

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  messages: unknown[] = []
  terminated = false

  postMessage(msg: unknown) {
    this.messages.push(msg)
  }

  terminate() {
    this.terminated = true
  }

  dispatchMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }

  dispatchError(err: unknown) {
    this.onerror?.(err)
  }
}

describe('ml-recognizer model loading state', () => {
  let mockWorker: MockWorker

  beforeEach(() => {
    mockWorker = new MockWorker()
    setWorkerFactoryForTest(() => mockWorker as unknown as Worker)
  })

  afterEach(() => {
    setWorkerFactoryForTest(null)
  })

  test('initial model status is idle', () => {
    expect(getModelStatus()).toBe('idle')
  })

  test('onModelStatusChange notifies subscribers when status transitions', () => {
    const statuses: ModelStatus[] = []
    const unsubscribe = onModelStatusChange((s) => statuses.push(s))

    prewarmModel()
    mockWorker.dispatchMessage({ status: 'loading' })
    expect(getModelStatus()).toBe('loading')

    mockWorker.dispatchMessage({ status: 'ready' })
    expect(getModelStatus()).toBe('ready')

    expect(statuses).toEqual(['loading', 'ready'])
    unsubscribe()
  })

  test('unsubscribing removes the callback', () => {
    const statuses: ModelStatus[] = []
    const unsubscribe = onModelStatusChange((s) => statuses.push(s))

    prewarmModel()
    mockWorker.dispatchMessage({ status: 'loading' })
    unsubscribe()

    mockWorker.dispatchMessage({ status: 'ready' })
    expect(statuses).toEqual(['loading'])
    expect(getModelStatus()).toBe('ready')
  })

  test('prewarmModel posts prewarm message and avoids redundant calls', () => {
    prewarmModel()
    expect(mockWorker.messages).toEqual([{ type: 'prewarm' }])

    // While loading, prewarmModel should be a no-op
    mockWorker.dispatchMessage({ status: 'loading' })
    prewarmModel()
    expect(mockWorker.messages).toHaveLength(1)

    // While ready, prewarmModel should be a no-op
    mockWorker.dispatchMessage({ status: 'ready' })
    prewarmModel()
    expect(mockWorker.messages).toHaveLength(1)
  })

  test('handles worker error status message', () => {
    const statuses: ModelStatus[] = []
    onModelStatusChange((s) => statuses.push(s))

    prewarmModel()
    mockWorker.dispatchMessage({ status: 'loading' })
    mockWorker.dispatchMessage({ status: 'error', error: 'weights download failed' })

    expect(getModelStatus()).toBe('error')
    expect(statuses).toEqual(['loading', 'error'])
  })

  test('handles worker.onerror by setting status to error', () => {
    const statuses: ModelStatus[] = []
    onModelStatusChange((s) => statuses.push(s))

    prewarmModel()
    mockWorker.dispatchMessage({ status: 'loading' })
    mockWorker.dispatchError(new Error('worker crashed'))

    expect(getModelStatus()).toBe('error')
    expect(statuses).toEqual(['loading', 'error'])
  })
})
