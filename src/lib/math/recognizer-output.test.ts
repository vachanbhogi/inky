import { describe, expect, test } from 'bun:test'
import katex from 'katex'
import { getAvailableActions, type MathAction, solveMath, stampedTextFor } from './math-solver'
import { normalizeLatex } from './ml-decode'

/**
 * Corpus of latex the pipeline ACTUALLY emits — captured from the live app
 * (window.inkyStore.mathCapsule) and E2E latex logs. Every future shape bug
 * appends the exact captured string here: this file is the institutional
 * memory that was missing when brace-form quadratics shipped with dead
 * action buttons (all buttons dimmed for `x^{ 2 }-1=0`, 2026-10-21).
 */
const RECOGNIZER_CORPUS: { latex: string; from: string; expect: MathAction[] }[] = [
  {
    latex: 'v^{ 2 }=0',
    from: 'live capture: ML settle of a drawn quadratic (2026-10-21)',
    expect: ['solve'],
  },
  {
    latex: 'x^{ 2 }-1=0',
    from: 'dead-Solve report (user screenshot)',
    expect: ['solve', 'factor'],
  },
  { latex: 'x^{2}-1=0', from: 'brace form without inner spaces', expect: ['solve', 'factor'] },
  {
    latex: 'x^{ 2 }-5x+6=0',
    from: 'brace quadratic with a linear term',
    expect: ['solve', 'factor'],
  },
  { latex: '$x^{2}-5x+6=0$', from: '$-wrapped model output', expect: ['solve', 'factor'] },
  { latex: 'x^{2}+2x+1', from: 'brace expression (no equals)', expect: ['factor'] },
  { latex: '2x+1=7', from: 'E2E latex.log (linear baseline)', expect: ['solve'] },
  { latex: '7x+7=2', from: 'E2E latex.log (linear baseline)', expect: ['solve'] },
  {
    latex: 'x^2-5x+6=0',
    from: 'ASCII baseline (previously tested form)',
    expect: ['solve', 'factor'],
  },
]

/** Raw tokenizer joins atoms with spaces — these flow through normalizeLatex
 * before anything else sees them; the full chain was never tested. */
const RAW_TOKENIZER_INPUTS = ['x ^ { 2 } - 1 = 0', '2 X + 1 = 7', '7 x + 7 = 2']

describe('recognizer output corpus', () => {
  test('every corpus entry offers its applicable actions (no dead buttons)', () => {
    const dead = RECOGNIZER_CORPUS.filter((entry) => {
      const actions = getAvailableActions(entry.latex)
      return entry.expect.some((a) => !actions.includes(a))
    })
    expect(dead.map((e) => ({ latex: e.latex, actual: getAvailableActions(e.latex) }))).toEqual([])
  })

  test('raw tokenizer output classifies after normalizeLatex (the untested seam)', () => {
    const dead = RAW_TOKENIZER_INPUTS.filter(
      (raw) => !getAvailableActions(normalizeLatex(raw)).includes('solve'),
    )
    expect(dead.map((raw) => ({ raw, normalized: normalizeLatex(raw) }))).toEqual([])
  })

  test('corpus renders in KaTeX with throwOnError (display keeps braces)', () => {
    // `$` is stripped first, mirroring renderFormula's display boundary —
    // KaTeX throws on `$` delimiters, which would force the raw-text fallback.
    const broken = RECOGNIZER_CORPUS.filter((entry) => {
      try {
        katex.renderToString(entry.latex.replace(/\$/g, ''), {
          throwOnError: true,
          displayMode: false,
        })
        return false
      } catch {
        return true
      }
    })
    expect(broken.map((e) => e.latex)).toEqual([])
  })
})

function quadraticTerms(a: number, b: number, c: number) {
  const x2 = a === 1 ? 'x^2' : a === -1 ? '-x^2' : `${a}x^2`
  const bx = b === 0 ? '' : b > 0 ? `+${b}x` : `${b}x`
  const cst = c === 0 ? '' : c > 0 ? `+${c}` : `${c}`
  return `${x2}${bx}${cst}=0`
}

/** The three shapes a recognizer can plausibly emit for the same math. */
function shapesOf(equation: string) {
  return [equation, equation.replace('^2', '^{2}'), equation.replace('^2', '^{ 2 }')]
}

describe('shape sweep (generated quadratics, oracle-checked)', () => {
  test('solve is offered and its roots satisfy the polynomial in every shape', () => {
    const failures: string[] = []
    for (const a of [1, 2, -1])
      for (const b of [-5, 0, 4])
        for (const c of [-6, 0, 4]) {
          const disc = b * b - 4 * a * c
          for (const shape of shapesOf(quadraticTerms(a, b, c))) {
            if (!getAvailableActions(shape).includes('solve')) {
              failures.push(`no solve: ${shape}`)
              continue
            }
            const plain = solveMath(shape, 'solve').plainText
            if (disc < 0) {
              if (plain !== 'No real roots') {
                failures.push(`expected "No real roots" for ${shape}, got "${plain}"`)
              }
              continue
            }
            // `x = r1, r2` (or `x = r` for a double root).
            const roots = plain.replace(/^x = /, '').split(', ').map(Number)
            for (const r of roots) {
              if (Number.isNaN(r)) {
                failures.push(`unparsable roots for ${shape}: "${plain}"`)
                continue
              }
              // Roots are rendered to 2 decimals — allow rounding residual.
              const residual = a * r * r + b * r + c
              if (Math.abs(residual) > 0.15) {
                failures.push(`root ${r} fails ${shape} (residual ${residual})`)
              }
            }
          }
        }
    expect(failures).toEqual([])
  })

  test('factor is offered for every factorable shape (disc >= 0)', () => {
    const failures: string[] = []
    for (const a of [1, 2, -1])
      for (const b of [-5, 0, 4])
        for (const c of [-6, 0, 4]) {
          if (b * b - 4 * a * c < 0) continue
          for (const shape of shapesOf(quadraticTerms(a, b, c))) {
            if (!getAvailableActions(shape).includes('factor')) {
              failures.push(`no factor: ${shape}`)
            }
          }
        }
    expect(failures).toEqual([])
  })
})

describe('gate ↔ executor consistency (a half-fixed parser must go red)', () => {
  test('offered ⟺ the action genuinely transforms the input', () => {
    const squash = (s: string) => s.replace(/\s+/g, '')
    const failures: string[] = []
    for (const entry of RECOGNIZER_CORPUS) {
      for (const action of ['solve', 'factor', 'simplify'] as const) {
        const offered = getAvailableActions(entry.latex).includes(action)
        const solution = solveMath(entry.latex, action)
        // Baseline is solution.latex — the solver's own normalized input —
        // so a no-op return compares equal regardless of input canonical form.
        const transforms =
          !!solution && squash(stampedTextFor(solution, action)) !== squash(solution.latex)
        if (offered !== transforms) {
          failures.push(`${entry.latex} [${action}]: offered=${offered} transforms=${transforms}`)
        }
      }
    }
    expect(failures).toEqual([])
  })
})
