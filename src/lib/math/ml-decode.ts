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

/**
 * Beam candidate for decoding.
 */
export interface BeamCandidate {
  ids: number[]
  logProb: number
  done: boolean
}

/**
 * Top-K token candidates with log-probabilities from the last position's logits.
 */
export function topKTokensFromLogits(
  logits: Float32Array,
  seqLength: number,
  vocabSize: number,
  k = 3,
): { id: number; logProb: number }[] {
  const start = (seqLength - 1) * vocabSize

  // Numerically stable log-softmax
  let maxLogit = -Infinity
  for (let i = 0; i < vocabSize; i++) {
    const v = logits[start + i]
    if (v > maxLogit) maxLogit = v
  }

  let sumExp = 0
  for (let i = 0; i < vocabSize; i++) {
    sumExp += Math.exp(logits[start + i] - maxLogit)
  }
  const logSumExp = maxLogit + Math.log(sumExp)

  const items: { id: number; logProb: number }[] = []
  for (let i = 0; i < vocabSize; i++) {
    const logProb = logits[start + i] - logSumExp
    items.push({ id: i, logProb })
  }

  items.sort((a, b) => b.logProb - a.logProb)
  return items.slice(0, k)
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
 * Disambiguates common visual OCR slips based on mathematical grammar:
 * - Duplicate exponents from proximity: `(x - 2^3)^3` -> `(x - 2)^3`
 * - `z` / `Z` in coefficient position immediately preceding `x` or `y`: `zx` -> `2x`
 * - `l` / `I` in operator context: `+ l` -> `+ 1`
 * - `q` in constant term position when working with `x`: `+ q` -> `+ 9`
 * - `o` / `O` immediately after digits: `1o` -> `10`
 */
export function disambiguateMathTokens(latex: string): string {
  let s = latex

  // 1. Duplicate exponent where handwritten exponent was captured twice
  // (e.g. both inside the paren and on the closing paren): (x - 2^3)^3 -> (x - 2)^3
  s = s.replace(
    /\(([a-zA-Z]\s*[+\-]\s*\d+)\^\{?(\d+)\}?\)\^\{?(\d+)\}?/g,
    (_match, inner, exp1, exp2) => {
      if (exp1 === exp2) return `(${inner})^${exp2}`
      return _match
    },
  )

  // 2. 'z' or 'Z' right in front of another variable (e.g. 'zx' -> '2x')
  s = s.replace(/\b[zZ]([xyXY])\b/g, (_m, v) => `2${v}`)

  // 3. Isolated 'l' or 'I' after an operator (+, -, =)
  s = s.replace(/([+\-=])\s*[lI]\b/g, (_m, op) => `${op} 1`)

  // 4. 'q' after an operator when equation already contains 'x'
  if (/\b[xX]\b/.test(s) || /x\^/.test(s)) {
    s = s.replace(/([+\-=])\s*q\b/g, (_m, op) => `${op} 9`)
  }

  // 5. Letter 'o' or 'O' immediately after digits: e.g. '1o' -> '10'
  s = s.replace(/(\d+)[oO]\b/g, (_m, d) => `${d}0`)

  return s
}

/**
 * Tighten decoded latex for display: the tokenizer joins atoms with single
 * spaces and the model emits capitalized single-letter variables — both read
 * as placeholder noise in the capsule, so the formula lands clean.
 */
export function normalizeLatex(latex: string): string {
  const disambiguated = disambiguateMathTokens(latex)
  return disambiguated
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
