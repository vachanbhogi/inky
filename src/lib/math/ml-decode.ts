/** Vocab bundle produced by training/export_tokenizer.py. */
export interface TokenVocab {
  model: string
  vocabSize: number
  bosId: number
  eosId: number
  padId: number
  unkId: number
  maxLen: number
  id2token: string[]
}

/** True when decoding should stop, given `ids` *including* the token just
 * appended. Guards: end-of-sequence, pad, length cap, and runaway
 * repetition (the observed failure mode where the model emits `~`
 * forever). The run guard counts identical tokens at the tail — ≥6 is
 * never valid LaTeX output. */
export function shouldStopDecoding(ids: number[], vocab: TokenVocab): boolean {
  const n = ids.length
  if (n === 0) return false
  const last = ids[n - 1]
  if (last === vocab.eosId || last === vocab.padId) return true
  if (n >= vocab.maxLen) return true
  if (n >= 6) {
    let run = 1
    for (let i = n - 2; i >= 0 && ids[i] === last; i--) run++
    if (run >= 6) return true
  }
  return false
}

/** Greedy argmax over the last position's logits. */
export function argmaxLastPosition(
  logits: Float32Array,
  seqLength: number,
  vocabSize: number,
): number {
  const start = (seqLength - 1) * vocabSize
  let best = 0
  let bestVal = -Infinity
  for (let i = 0; i < vocabSize; i++) {
    const v = logits[start + i]
    if (v > bestVal) {
      bestVal = v
      best = i
    }
  }
  return best
}

/**
 * Tighten decoded latex for display: the tokenizer joins atoms with single
 * spaces and the model emits capitalized single-letter variables — both read
 * as placeholder noise in the capsule, so the formula lands clean.
 */
export function normalizeLatex(latex: string): string {
  return latex
    .replace(/(?<!\\)\b[XY]\b/g, (m) => m.toLowerCase())
    .replace(/\s*([+\-^=(),])\s*/g, '$1')
    .replace(/([0-9a-zA-Z])\s+([0-9a-zA-Z])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Ids → LaTeX. The tokenizer uses WhitespaceSplit with no decoder, so
 * training joined atoms with single spaces; we mirror that then collapse.
 * Special tokens are dropped like HuggingFace skip_special_tokens=True. */
export function idsToLatex(ids: number[], vocab: TokenVocab): string {
  const specials = new Set([vocab.bosId, vocab.eosId, vocab.padId, vocab.unkId])
  const parts: string[] = []
  for (const id of ids) {
    if (specials.has(id)) continue
    const tok = vocab.id2token[id]
    if (tok) parts.push(tok)
  }
  return normalizeLatex(parts.join(' '))
}
