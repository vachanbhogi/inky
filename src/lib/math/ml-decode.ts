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
 * repetition (e.g. model emitting `~` forever or repeating 2-token cycles like `{}`). */
export function shouldStopDecoding(ids: number[], vocab: TokenVocab): boolean {
  const n = ids.length
  if (n === 0) return false
  const last = ids[n - 1]
  if (last === vocab.eosId || last === vocab.padId) return true
  if (n >= vocab.maxLen) return true

  // Single-token runaway repetition: ≥6 identical tokens in a row
  if (n >= 6) {
    let run = 1
    for (let i = n - 2; i >= 0 && ids[i] === last; i--) run++
    if (run >= 6) return true
  }

  // Runaway empty brace cycle: e.g. { } { } { } (repeating 3+ times)
  if (n >= 6) {
    const p0 = ids[n - 2]
    const p1 = ids[n - 1]
    const tok0 = vocab.id2token[p0]
    const tok1 = vocab.id2token[p1]
    if (tok0 === '{' && tok1 === '}') {
      let cycle = 1
      for (let i = n - 4; i >= 0; i -= 2) {
        if (ids[i] === p0 && ids[i + 1] === p1) cycle++
        else break
      }
      if (cycle >= 3) return true
    }
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
 * Disambiguates common visual OCR slips and model layout biases based on mathematical grammar:
 * - \int misclassification of large opening parentheses: `\int_{(...)}^q` -> `(...)^9`
 * - `\sum` misclassification of sharp handwritten 3: `x - \sum` -> `x - 3`
 * - Greek letter confusions for handwriting: `2\pi` -> `2x`, `\beta` -> `3`/`5`
 * - Spurious fraction hallucinations: `[\frac{2x - 3}{2}]^5` -> `(2x - 3)^5`
 * - Exponent `q` -> `9`: `^{q}` -> `^{9}`
 * - Exponent `o` / `O` -> `0`: `^{o}` -> `^{0}`
 * - Exponent `z` / `Z` -> `2`: `^{z}` -> `^{2}`
 * - Duplicate exponents from proximity: `(x - 2^3)^3` -> `(x - 2)^3`
 * - `z` / `Z` in coefficient position immediately preceding `x` or `y`: `zx` -> `2x`
 * - `l` / `I` in operator context: `+ l` -> `+ 1`
 * - `q` in constant term position when working with `x`: `+ q` -> `+ 9`
 * - `o` / `O` immediately after digits: `1o` -> `10`
 */
export function disambiguateMathTokens(latex: string): string {
  let s = latex

  // 1. Tall parenthesis misclassified as \int subscript/superscript
  // e.g. \int_{(x-3)}^9 or \int _ { ( X - \sum ) } ^ { q }
  s = s.replace(
    /\\int\s*_\s*\{\s*([([][^}]+[)\]])\s*\}\s*\^\s*\{?([^}]+)\}?/g,
    '$1^{$2}',
  )
  s = s.replace(
    /\\int\s*_\s*([([][^ \^]+[)\]])\s*\^\s*\{?([^}]+)\}?/g,
    '$1^{$2}',
  )

  // 2. Greek letters misclassified for Latin variables or digits:
  // \pi -> x when in coefficient position: e.g. 2\pi -> 2x
  s = s.replace(/(\d+)\s*\\pi\b/g, '$1x')
  s = s.replace(/([+\-=*/])\s*\\pi\b/g, '$1 x')
  s = s.replace(/\b\\pi\s*([+\-=*/^])/g, 'x $1')

  // \beta (Greek beta) in exponent position -> 5 (or 3): e.g. ^{\beta} -> ^{5}
  s = s.replace(/\^\s*\{\s*\\beta\s*\}/gi, '^{5}')
  s = s.replace(/\^\s*\\beta\b/gi, '^5')
  // \beta after operator in binomial -> 3
  s = s.replace(/([+\-=*/])\s*\\beta\b/g, '$1 3')

  // 3. Spurious fraction hallucinations inside parenthesized/bracketed powers:
  // e.g. [ \frac { 2x - 3 } { 2 } ] ^ 5 -> (2x - 3)^5
  s = s.replace(
    /[(\[]\s*\\frac\s*\{\s*([^}]+)\s*\}\s*\{\s*\d+\s*\}\s*[)\]]\s*\^\s*\{?([^}]+)\}?/g,
    '($1)^{$2}',
  )
  s = s.replace(/^\[(.*)\]\s*\^\s*\{?([^}]+)\}?$/g, '($1)^{$2}')

  // 4. Sharp handwritten '3' misclassified as \sum (capital Sigma) in arithmetic contexts
  s = s.replace(/([+\-=*/(,])\s*\\sum\b/g, '$1 3')
  s = s.replace(/\b\\sum\s*([+\-=*/),^])/g, '3 $1')

  // 5. Exponent digit confusions: ^{q} -> ^{9}, ^{o} -> ^{0}, ^{z} -> ^{2}
  s = s.replace(/\^\s*\{\s*q\s*\}/gi, '^{9}')
  s = s.replace(/\^\s*q\b/gi, '^9')
  s = s.replace(/\^\s*\{\s*o\s*\}/gi, '^{0}')
  s = s.replace(/\^\s*\{\s*z\s*\}/gi, '^{2}')

  // 6. Duplicate exponent where handwritten exponent was captured twice
  // (e.g. both inside the paren and on the closing paren): (x - 2^3)^3 -> (x - 2)^3
  s = s.replace(
    /\(([a-zA-Z]\s*[+\-]\s*\d+)\^\{?(\d+)\}?\)\^\{?(\d+)\}?/g,
    (_match, inner, exp1, exp2) => {
      if (exp1 === exp2) return `(${inner})^${exp2}`
      return _match
    },
  )

  // 7. 'z' or 'Z' right in front of another variable (e.g. 'zx' -> '2x')
  s = s.replace(/\b[zZ]([xyXY])\b/g, (_m, v) => `2${v}`)

  // 8. Isolated 'l' or 'I' after an operator (+, -, =)
  s = s.replace(/([+\-=])\s*[lI]\b/g, (_m, op) => `${op} 1`)

  // 9. 'q' after an operator when equation already contains 'x'
  if (/\b[xX]\b/.test(s) || /x\^/.test(s)) {
    s = s.replace(/([+\-=])\s*q\b/g, (_m, op) => `${op} 9`)
  }

  // 10. Letter 'o' or 'O' immediately after digits: e.g. '1o' -> '10'
  s = s.replace(/(\d+)[oO]\b/g, (_m, d) => `${d}0`)

  // 11. Spurious superscript minus from hyphen/minus at baseline:
  // e.g. x^2 + 6x^- 7 -> x^2 + 6x - 7, or x^{-} 7 -> x - 7
  s = s.replace(/([a-zA-Z0-9])\s*\^\s*\{\s*[-–—]\s*\}\s*/g, '$1 - ')
  s = s.replace(/([a-zA-Z0-9])\s*\^\s*[-–—]\s*/g, '$1 - ')

  // 12. Accidental double minus or minus dash repetition:
  // e.g. x^2 + 6x - - 7 -> x^2 + 6x - 7
  s = s.replace(/\s*[-–—]\s*[-–—]\s*/g, ' - ')

  // 13. Empty brace hallucinations or trailing bracket spam:
  // e.g. {}{}{}{}{} or { } { } { }
  s = s.replace(/(?:\{\s*\}\s*){2,}/g, ' ')

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
