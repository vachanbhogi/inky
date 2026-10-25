import { evaluate, isSymbolNode, type MathNode, parse, rationalize, simplify } from 'mathjs'

export type MathAction = 'solve' | 'factor' | 'simplify'

/** Canonicalize `^{ ... }` superscripts to bare form at the math boundary
 * only: the recognizer emits LaTeX braces (`x^{ 2 }`), which the parse regexes
 * never see through, while display must keep them (`x^{10}` renders as x¹⁰
 * when the braces are stripped). Applied inside getAvailableActions and
 * solveMath — never to the stored/displayed latex. */
function canonicalizeSuperscripts(latex: string): string {
  return latex.replace(/\^\s*\{\s*([^{}]+?)\s*\}/g, '^$1')
}

/**
 * Which capsule actions make sense for a given formula: an action is
 * applicable only when it transforms the input into something different —
 * offering a no-op action stamps the question back as its own answer (final
 * review I2). `solve` iff the cleaned latex has `=` and solves, `factor` iff
 * it has `^2` and factors, `simplify` iff it has no `=` and evaluates.
 * Empty latex offers nothing.
 */
export function getAvailableActions(latex: string): MathAction[] {
  const clean = canonicalizeSuperscripts(latex.replace(/\$/g, '')).trim()
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

export interface MathSolution {
  latex: string
  action: 'solve' | 'factor' | 'simplify' | 'graph'
  resultLatex: string
  plainText: string
}

function formatNumber(n: number): string {
  if (Math.abs(n) < 1e-9) return '0'
  if (Math.abs(n - Math.round(n)) < 1e-9) {
    return Math.round(n).toString()
  }
  const fixed = n.toFixed(2)
  return fixed.endsWith('.00') ? n.toFixed(0) : fixed.replace(/\.?0+$/, '')
}

export function cleanEquationForMathjs(latex: string): string {
  let cleaned = latex
    .replace(/\\times/g, '*')
    .replace(/\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\left|\\right/g, '')

  while (/\\frac\{([^{}]+)\}\{([^{}]+)\}/.test(cleaned)) {
    cleaned = cleaned.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
  }

  cleaned = cleaned
    .replace(/\{([^{}]+)\}/g, '($1)')
    .replace(/([0-9])([a-zA-Z])/g, '$1*$2')
    .replace(/([0-9])\(/g, '$1*(')
    .replace(/\)([0-9a-zA-Z])/g, ')*$1')
    .replace(/\)\(/g, ')*(')
    .replace(/\s+/g, '')
    .trim()

  while (/(^|[(+\-*/])-([a-zA-Z(])/.test(cleaned)) {
    cleaned = cleaned.replace(/(^|[(+\-*/])-([a-zA-Z(])/g, (_, p1, p2) => `${p1}-1*${p2}`)
  }

  return cleaned
}

function extractSystemEquations(latex: string): string[] | null {
  const text = latex
    .replace(/\\begin\{cases\}|\\end\{cases\}/g, '')
    .replace(/\\{2,}/g, '\n')
    .replace(/\\newline/g, '\n')
  const parts = text
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes('='))
  return parts.length === 2 ? parts : null
}

function getVariables(node: MathNode): string[] {
  const vars = new Set<string>()
  node.traverse((n, _path, parent) => {
    if (
      isSymbolNode(n) &&
      !(
        parent &&
        (parent as unknown as { type?: string; name?: string }).type === 'FunctionNode' &&
        (parent as unknown as { type?: string; name?: string }).name === n.name
      )
    ) {
      if (/^[a-zA-Z]$/.test(n.name) && !['e', 'i'].includes(n.name)) {
        vars.add(n.name)
      }
    }
  })
  return Array.from(vars).sort()
}

function solveLinearSystem(
  equations: string[],
  clean: string,
  action: 'solve' | 'factor' | 'simplify' | 'graph',
): MathSolution | null {
  if (equations.length !== 2 || action !== 'solve') return null

  try {
    const parsedDiffs: MathNode[] = []
    const allVars = new Set<string>()

    for (const eq of equations) {
      const parts = eq.split('=')
      if (parts.length !== 2) return null
      const leftStr = cleanEquationForMathjs(parts[0])
      const rightStr = cleanEquationForMathjs(parts[1])
      if (!leftStr || !rightStr) return null
      const diffStr = `(${leftStr}) - (${rightStr})`
      const node = parse(diffStr)
      parsedDiffs.push(node)
      for (const v of getVariables(node)) {
        allVars.add(v)
      }
    }

    const varList = Array.from(allVars).sort()
    if (varList.length !== 2) return null
    const [v1, v2] = varList

    const c1 = parsedDiffs[0].compile()
    const c2 = parsedDiffs[1].compile()

    const const1 = Number(c1.evaluate({ [v1]: 0, [v2]: 0 }))
    const a1 = Number(c1.evaluate({ [v1]: 1, [v2]: 0 })) - const1
    const b1 = Number(c1.evaluate({ [v1]: 0, [v2]: 1 })) - const1
    const check1 = Number(c1.evaluate({ [v1]: 1, [v2]: 1 }))
    if (Math.abs(check1 - (a1 + b1 + const1)) > 1e-6) return null
    const k1 = -const1

    const const2 = Number(c2.evaluate({ [v1]: 0, [v2]: 0 }))
    const a2 = Number(c2.evaluate({ [v1]: 1, [v2]: 0 })) - const2
    const b2 = Number(c2.evaluate({ [v1]: 0, [v2]: 1 })) - const2
    const check2 = Number(c2.evaluate({ [v1]: 1, [v2]: 1 }))
    if (Math.abs(check2 - (a2 + b2 + const2)) > 1e-6) return null
    const k2 = -const2

    const det = a1 * b2 - a2 * b1
    if (Math.abs(det) < 1e-12) return null

    const val1 = (k1 * b2 - k2 * b1) / det
    const val2 = (a1 * k2 - a2 * k1) / det

    if (
      Number.isNaN(val1) ||
      Number.isNaN(val2) ||
      !Number.isFinite(val1) ||
      !Number.isFinite(val2)
    ) {
      return null
    }

    const resStr = `${v1} = ${formatNumber(val1)}, ${v2} = ${formatNumber(val2)}`
    return {
      latex: clean,
      action,
      resultLatex: resStr,
      plainText: resStr,
    }
  } catch {
    return null
  }
}

function solveSingleEquation(
  leftRaw: string,
  rightRaw: string,
  clean: string,
  action: 'solve' | 'factor' | 'simplify' | 'graph',
): MathSolution | null {
  const leftStr = cleanEquationForMathjs(leftRaw)
  const rightStr = cleanEquationForMathjs(rightRaw)
  if (!leftStr || !rightStr) return null

  try {
    const diffStr = `(${leftStr}) - (${rightStr})`
    const rat = rationalize(diffStr, {}, true)
    if (rat?.variables?.length !== 1) return null

    const varName = rat.variables[0]
    if (!/^[a-zA-Z]$/.test(varName) || ['e', 'i'].includes(varName)) return null

    const rawCoeffs = rat.coefficients
    if (!rawCoeffs || rawCoeffs.length === 0) return null
    const coeffs: number[] = rawCoeffs.map((x) => Number(x))

    let deg = coeffs.length - 1
    while (deg > 0 && Math.abs(coeffs[deg]) < 1e-12) {
      deg--
    }

    // Linear: c0 + c1 * x = 0 => x = -c0 / c1
    if (deg === 1) {
      if (action !== 'solve') return null
      const c0 = coeffs[0]
      const c1 = coeffs[1]
      if (Math.abs(c1) < 1e-12) return null
      const root = -c0 / c1
      if (Number.isNaN(root) || !Number.isFinite(root)) return null
      const cleanRoot = formatNumber(root)
      return {
        latex: clean,
        action,
        resultLatex: `${varName} = ${cleanRoot}`,
        plainText: `${varName} = ${cleanRoot}`,
      }
    }

    // Quadratic: c0 + c1 * x + c2 * x^2 = 0
    if (deg === 2) {
      const c = coeffs[0]
      const b = coeffs[1]
      const a = coeffs[2]

      const disc = b * b - 4 * a * c
      if (Number.isNaN(disc)) return null

      if (action === 'factor') {
        if (disc >= 0) {
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
        return null
      }

      if (action === 'solve') {
        if (disc > 0) {
          const r1 = (-b + Math.sqrt(disc)) / (2 * a)
          const r2 = (-b - Math.sqrt(disc)) / (2 * a)
          const cr1 = formatNumber(r1)
          const cr2 = formatNumber(r2)
          return {
            latex: clean,
            action,
            resultLatex: `${varName} = ${cr1}, ${cr2}`,
            plainText: `${varName} = ${cr1}, ${cr2}`,
          }
        }
        if (disc === 0) {
          const r = -b / (2 * a)
          const cr = formatNumber(r)
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
    }
  } catch {
    return null
  }

  return null
}

export function solveMath(
  rawLatex: string,
  action: 'solve' | 'factor' | 'simplify' | 'graph',
): MathSolution {
  const clean = canonicalizeSuperscripts(rawLatex.replace(/\$/g, '')).trim()
  if (!clean) {
    return { latex: clean, action, resultLatex: clean, plainText: clean }
  }

  // Case 1: Equation or system with '='
  if (clean.includes('=')) {
    // 1. Linear system of 2 equations
    const systemEquations = extractSystemEquations(clean)
    if (systemEquations && systemEquations.length === 2 && action === 'solve') {
      const systemSol = solveLinearSystem(systemEquations, clean, action)
      if (systemSol) return systemSol
    }

    // 2. Single equation
    const eqParts = clean.split('=')
    if (eqParts.length === 2) {
      const leftRaw = eqParts[0].trim()
      const rightRaw = eqParts[1].trim()
      if (leftRaw && rightRaw) {
        const singleSol = solveSingleEquation(leftRaw, rightRaw, clean, action)
        if (singleSol) return singleSol
      }
    }

    // Any other action on an equation with '=' that didn't solve is a no-op
    return {
      latex: clean,
      action,
      resultLatex: clean,
      plainText: clean,
    }
  }

  // Case 2: Expression to evaluate or simplify
  const expr = cleanEquationForMathjs(clean)
  try {
    const val = evaluate(expr)
    if (typeof val === 'number' && action === 'simplify') {
      const cleanVal = formatNumber(val)
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

  // Symbolic simplify (mathjs): x + x -> 2x. Only when it changes the expression.
  if (action === 'simplify') {
    try {
      const simplified = simplify(expr)
        .toString()
        .replace(/\s*\*\s*/g, '')
      if (squash(simplified) !== squash(clean)) {
        return { latex: clean, action, resultLatex: simplified, plainText: simplified }
      }
    } catch {
      // Not symbolically simplifiable
    }
  }

  // Factor a quadratic expression (no '=' needed): x^2+2x+1 -> (x + 1)^2
  if (action === 'factor') {
    try {
      const rat = rationalize(expr, {}, true)
      if (rat?.variables?.length === 1) {
        const varName = rat.variables[0]
        const rawCoeffs = rat.coefficients
        if (rawCoeffs && rawCoeffs.length === 3) {
          const coeffs: number[] = rawCoeffs.map((x) => Number(x))
          const c = coeffs[0]
          const b = coeffs[1]
          const a = coeffs[2]
          if (a === 1) {
            const disc = b * b - 4 * a * c
            if (disc >= 0) {
              const rLo = (-b + Math.sqrt(disc)) / (2 * a)
              const rHi = (-b - Math.sqrt(disc)) / (2 * a)
              const r1 = Math.min(rLo, rHi)
              const r2 = Math.max(rLo, rHi)
              const fmt = (r: number) => (r >= 0 ? `- ${r}` : `+ ${Math.abs(r)}`)
              const text =
                r1 === r2
                  ? `(${varName} ${fmt(r1)})^2`
                  : `(${varName} ${fmt(r1)})(${varName} ${fmt(r2)})`
              if (squash(text) !== squash(clean)) {
                return { latex: clean, action, resultLatex: text, plainText: text }
              }
            }
          }
        }
      }
    } catch {
      // Fall through
    }
  }

  return {
    latex: clean,
    action,
    resultLatex: clean,
    plainText: clean,
  }
}
