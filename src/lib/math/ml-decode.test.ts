import { describe, expect, test } from 'bun:test'
import type { TokenVocab } from './ml-decode'
import { argmaxLastPosition, idsToLatex, shouldStopDecoding } from './ml-decode'

const vocab: TokenVocab = {
  model: 'test',
  vocabSize: 10,
  bosId: 0,
  eosId: 2,
  padId: 1,
  unkId: 3,
  maxLen: 128,
  id2token: ['<s>', '<pad>', '</s>', '<unk>', '2', 'x', '+', '=', '7', 'A'],
}

describe('ml-decode', () => {
  test('shouldStopDecoding stops on eos and pad', () => {
    expect(shouldStopDecoding([4, 5, 2], vocab)).toBe(true)
    expect(shouldStopDecoding([4, 5, 1], vocab)).toBe(true)
    expect(shouldStopDecoding([4, 5, 6], vocab)).toBe(false)
  })

  test('shouldStopDecoding stops at length cap', () => {
    const ids = Array.from({ length: 128 }, (_, i) => (i % 2 === 0 ? 4 : 8))
    expect(shouldStopDecoding(ids, vocab)).toBe(true)
    const under = Array.from({ length: 127 }, (_, i) => (i % 2 === 0 ? 4 : 8))
    expect(shouldStopDecoding(under, vocab)).toBe(false)
  })

  test('shouldStopDecoding guards runaway repetition', () => {
    // 6 identical tail tokens → stop
    expect(shouldStopDecoding([8, 4, 4, 4, 4, 4, 4], vocab)).toBe(true)
    // 5 identical → still allowed (valid sequences can repeat, e.g. "!!!!")
    expect(shouldStopDecoding([8, 4, 4, 4, 4, 4], vocab)).toBe(false)
    // repetition not at the tail → no stop
    expect(shouldStopDecoding([4, 4, 4, 4, 4, 4, 8], vocab)).toBe(false)
    // empty ids → no stop
    expect(shouldStopDecoding([], vocab)).toBe(false)
  })

  test('argmaxLastPosition picks the max of the last row', () => {
    // 2 positions × 4 vocab: row0 = [0, 1, 3, 2], row1 = [5, 9, 7, 8]
    const logits = Float32Array.from([0, 1, 3, 2, 5, 9, 7, 8])
    expect(argmaxLastPosition(logits, 2, 4)).toBe(1)
    expect(argmaxLastPosition(logits, 1, 4)).toBe(2)
  })

  test('idsToLatex skips specials and joins with single spaces', () => {
    expect(idsToLatex([0, 9, 6, 4, 2], vocab)).toBe('A + 2')
    expect(idsToLatex([0, 2], vocab)).toBe('')
    expect(idsToLatex([3, 3, 4], vocab)).toBe('2') // unk dropped
  })
})
