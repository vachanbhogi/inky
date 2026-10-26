import { describe, expect, test } from 'bun:test'
import type { TokenVocab } from './ml-decode'
import { argmaxLastPosition, idsToLatex, normalizeLatex, shouldStopDecoding } from './ml-decode'

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
    expect(idsToLatex([0, 9, 6, 4, 2], vocab)).toBe('A+2')
    expect(idsToLatex([0, 2], vocab)).toBe('')
    expect(idsToLatex([3, 3, 4], vocab)).toBe('2') // unk dropped
  })
})

describe('normalizeLatex (placeholder cleanup)', () => {
  test('lowercases model variables and tightens operator spacing', () => {
    expect(normalizeLatex('2 X + 1 = 7')).toBe('2x+1=7')
    expect(normalizeLatex('7x + 7 = 2')).toBe('7x+7=2')
    expect(normalizeLatex('( x - 2 ) ^ 2 = 0')).toBe('(x-2)^2=0')
    expect(normalizeLatex('x = 2.00, -1.00')).toBe('x=2.00,-1.00')
  })

  test('keeps braces in superscripts (KaTeX needs x^{10}, not x^10)', () => {
    // The solver canonicalizes braces on its side; normalizeLatex must NOT —
    // display renders multi-digit exponents correctly only while braces
    // survive. (Spaces next to { } survive tightening; `1 0` collapses.)
    expect(normalizeLatex('x ^ { 1 0 } = 0')).toBe('x^{ 10 }=0')
    expect(normalizeLatex('x ^ { 2 } - 1 = 0')).toBe('x^{ 2 }-1=0')
  })

  test('disambiguates visual confusions (z->2 before x, q->9, l->1, duplicate exponents)', () => {
    expect(normalizeLatex('(x - 2^3)^3')).toBe('(x-2)^3')
    expect(normalizeLatex('(x - 4^5)^5')).toBe('(x-4)^5')
    expect(normalizeLatex('zx + 5 = 15')).toBe('2x+5=15')
    expect(normalizeLatex('x^2 + 6x + q = 16')).toBe('x^2+6x+9=16')
    expect(normalizeLatex('x - 2 = 1o')).toBe('x-2=10')
    expect(normalizeLatex('x + l = 5')).toBe('x+1=5')
    expect(normalizeLatex('\\int _ { ( X - \\sum ) } ^ { q }')).toBe('(x-3)^{9}')
    expect(normalizeLatex('(x - \\sum)^q')).toBe('(x-3)^9')
    expect(normalizeLatex('[ \\frac { 2 \\pi - \\beta } { 2 } ] ^ { \\beta }')).toBe('(2x-3)^{5}')
  })

  test('idsToLatex emits normalized latex end to end', () => {
    const v: TokenVocab = {
      model: 't',
      vocabSize: 10,
      bosId: 0,
      eosId: 2,
      padId: 1,
      unkId: 3,
      maxLen: 32,
      id2token: ['<s>', '<pad>', '</s>', '<unk>', '2', 'X', '+', '=', '7', '1'],
    }
    expect(idsToLatex([4, 5, 6, 9, 7, 8], v)).toBe('2x+1=7')
  })
})
