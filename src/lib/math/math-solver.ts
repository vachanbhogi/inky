import { evaluate } from 'mathjs'

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
      const quadRegex =
        /^([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])\^2(?:([+-]\d*(?:\.\d+)?)\*?[a-zA-Z])?(?:([+-]\d+(?:\.\d+)?))?$/
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
          const r1 = (-b + Math.sqrt(disc)) / (2 * a)
          const r2 = (-b - Math.sqrt(disc)) / (2 * a)
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
  try {
    const expr = cleanEquationForMathjs(clean)
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
    // If evaluation fails, return as simplified identity
  }

  return {
    latex: clean,
    action,
    resultLatex: clean,
    plainText: clean,
  }
}
