import { evaluate, simplify } from 'mathjs'

export type MathAction = 'solve' | 'factor' | 'simplify'

/**
 * Which capsule actions make sense for a given formula: an action is
 * applicable only when it transforms the input into something different —
 * offering a no-op action stamps the question back as its own answer (final
 * review I2). `solve` iff the cleaned latex has `=` and solves, `factor` iff
 * it has `^2` and factors, `simplify` iff it has no `=` and evaluates.
 * Empty latex offers nothing.
 */
export function getAvailableActions(latex: string): MathAction[] {
  const clean = latex.replace(/\$/g, '').trim()
  if (!clean) return []
  const actions: MathAction[] = []
  if (clean.includes('=') && transformsInput(clean, 'solve')) actions.push('solve')
  if (!clean.includes('=') && transformsInput(clean, 'simplify')) actions.push('simplify')
  if (clean.includes('^2') && transformsInput(clean, 'factor')) actions.push('factor')
  return actions
}

/** The text an action would actually stamp (mirrors MathActionCapsule). */
export function stampedTextFor(
  solution: { resultLatex: string; plainText: string },
  action: MathAction,
): string {
  return action === 'solve' ? solution.plainText : solution.resultLatex
}

function transformsInput(latex: string, action: MathAction): boolean {
  const solution = solveMath(latex, action)
  if (!solution) return false
  const squash = (s: string) => s.replace(/\s+/g, '')
  return squash(stampedTextFor(solution, action)) !== squash(latex)
}

const quadRegex =
  /^([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])\^2(?:([+-]\d*(?:\.\d+)?)\*?[a-zA-Z])?(?:([+-]\d+(?:\.\d+)?))??$/

export interface MathSolution {
  latex: string
  action: 'solve' | 'factor' | 'simplify' | 'graph'
  resultLatex: string
  plainText: string
}

export function cleanEquationForMathjs(latex: string): string {
  return latex
    .replace(/\\times/g, '*')
    .replace(/\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\left|\\right/g, '')
    .replace(/\{([^{}]+)\}/g, '($1)')
    .replace(/([0-9])([a-zA-Z])/g, '$1*$2')
    .replace(/\)\(/g, ')*(')
    .replace(/\s+/g, '')
    .trim()
}

export function solveMath(
  rawLatex: string,
  action: 'solve' | 'factor' | 'simplify' | 'graph',
): MathSolution {
  const clean = rawLatex.replace(/\$/g, '').trim()

  // Case 1: Equation with '='
  if (clean.includes('=')) {
    const [leftRaw, rightRaw] = clean.split('=')
    const leftStr = cleanEquationForMathjs(leftRaw)
    const rightStr = cleanEquationForMathjs(rightRaw)

    try {
      const rVal = evaluate(rightStr)

      // Linear equation: ax + b = c
      const matchLinear = leftStr.match(
        /^([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])(?:\+([+-]?\d+(?:\.\d+)?))?$/,
      )
      if (matchLinear) {
        const aStr = matchLinear[1]
        const varName = matchLinear[2]
        const bStr = matchLinear[3]
        const a =
          aStr === '' || aStr === '+' || !aStr ? 1 : aStr === '-' ? -1 : Number.parseFloat(aStr)
        const b = bStr ? Number.parseFloat(bStr) : 0
        const root = (rVal - b) / a
        const cleanRoot = Number.isInteger(root) ? root.toString() : root.toFixed(2)
        return {
          latex: clean,
          action,
          resultLatex: `${varName} = ${cleanRoot}`,
          plainText: `${varName} = ${cleanRoot}`,
        }
      }

      // Quadratic: ax^2 + bx + c = 0 (support +/- signs)
      const matchQuad = leftStr.match(quadRegex)
      if (matchQuad) {
        const aStr = matchQuad[1]
        const varName = matchQuad[2]
        const bStr = matchQuad[3]
        const cStr = matchQuad[4]

        const a =
          aStr === '' || aStr === '+' || !aStr ? 1 : aStr === '-' ? -1 : Number.parseFloat(aStr)
        const b =
          !bStr || bStr === '+' ? (bStr ? 1 : 0) : bStr === '-' ? -1 : Number.parseFloat(bStr)
        const c = (cStr ? Number.parseFloat(cStr) : 0) - rVal

        const disc = b * b - 4 * a * c
        if (action === 'factor' && disc >= 0) {
          const rLo = (-b + Math.sqrt(disc)) / (2 * a)
          const rHi = (-b - Math.sqrt(disc)) / (2 * a)
          const r1 = Math.min(rLo, rHi)
          const r2 = Math.max(rLo, rHi)
          if (r1 === r2) {
            const sign = r1 >= 0 ? `- ${r1}` : `+ ${Math.abs(r1)}`
            return {
              latex: clean,
              action,
              resultLatex: `(${varName} ${sign})^2 = 0`,
              plainText: `(${varName} ${sign})^2 = 0`,
            }
          }
          const sign1 = r1 >= 0 ? `- ${r1}` : `+ ${Math.abs(r1)}`
          const sign2 = r2 >= 0 ? `- ${r2}` : `+ ${Math.abs(r2)}`
          return {
            latex: clean,
            action,
            resultLatex: `(${varName} ${sign1})(${varName} ${sign2}) = 0`,
            plainText: `(${varName} ${sign1})(${varName} ${sign2}) = 0`,
          }
        }

        if (disc > 0) {
          const r1 = (-b + Math.sqrt(disc)) / (2 * a)
          const r2 = (-b - Math.sqrt(disc)) / (2 * a)
          const cr1 = Number.isInteger(r1) ? r1.toString() : r1.toFixed(2)
          const cr2 = Number.isInteger(r2) ? r2.toString() : r2.toFixed(2)
          return {
            latex: clean,
            action,
            resultLatex: `${varName} = ${cr1}, ${cr2}`,
            plainText: `${varName} = ${cr1}, ${cr2}`,
          }
        }
        if (disc === 0) {
          const r = -b / (2 * a)
          const cr = Number.isInteger(r) ? r.toString() : r.toFixed(2)
          return {
            latex: clean,
            action,
            resultLatex: `${varName} = ${cr}`,
            plainText: `${varName} = ${cr}`,
          }
        }
        return {
          latex: clean,
          action,
          resultLatex: 'No real roots',
          plainText: 'No real roots',
        }
      }
    } catch {
      // Fall through
    }
  }

  // Case 2: Expression to evaluate or simplify
  const expr = cleanEquationForMathjs(clean)
  try {
    const val = evaluate(expr)
    if (typeof val === 'number') {
      const cleanVal = Number.isInteger(val) ? val.toString() : val.toFixed(2)
      return {
        latex: clean,
        action,
        resultLatex: `= ${cleanVal}`,
        plainText: `= ${cleanVal}`,
      }
    }
  } catch {
    // Not numeric — try symbolic transforms below.
  }

  const squash = (s: string) => s.replace(/\s+/g, '')

  // Symbolic simplify (mathjs): x + x -> 2x. Only when it changes the
  // expression — an identity result is what the applicability gate rejects.
  if (action === 'simplify') {
    try {
      const simplified = simplify(expr)
        .toString()
        .replace(/\s*\*\s*/g, '')
      if (squash(simplified) !== squash(clean)) {
        return { latex: clean, action, resultLatex: simplified, plainText: simplified }
      }
    } catch {
      // Not symbolically simplifiable — fall through.
    }
  }

  // Factor a quadratic expression (no '=' needed): x^2+2x+1 -> (x + 1)^2
  if (action === 'factor') {
    const m = expr.match(quadRegex)
    if (m) {
      const varName = m[2]
      const a = !m[1] || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number.parseFloat(m[1])
      const b = !m[3] || m[3] === '+' ? (m[3] ? 1 : 0) : m[3] === '-' ? -1 : Number.parseFloat(m[3])
      const c = m[4] ? Number.parseFloat(m[4]) : 0
      const disc = b * b - 4 * a * c
      if (disc >= 0) {
        const rLo = (-b + Math.sqrt(disc)) / (2 * a)
        const rHi = (-b - Math.sqrt(disc)) / (2 * a)
        const r1 = Math.min(rLo, rHi)
        const r2 = Math.max(rLo, rHi)
        const fmt = (r: number) => (r >= 0 ? `- ${r}` : `+ ${Math.abs(r)}`)
        const text =
          r1 === r2 ? `(${varName} ${fmt(r1)})^2` : `(${varName} ${fmt(r1)})(${varName} ${fmt(r2)})`
        if (squash(text) !== squash(clean)) {
          return { latex: clean, action, resultLatex: text, plainText: text }
        }
      }
    }
  }

  return {
    latex: clean,
    action,
    resultLatex: clean,
    plainText: clean,
  }
}
