import { evaluate, isSymbolNode, type MathNode, parse, rationalize, simplify } from 'mathjs'

export type MathAction = 'solve' | 'factor' | 'simplify' | 'expand'

/** Combinations nCr */
function comb(n: number, r: number): number {
  let val = 1
  for (let i = 1; i <= r; i++) {
    val = (val * (n - i + 1)) / i
  }
  return val
}

/** Factor binomial power: e.g. x^8 - 16x^7 + ... + 256 -> (x - 2)^8 */
export function factorBinomialPower(clean: string): string | null {
  const squash = (s: string) => s.replace(/\s+/g, '')
  const squashed = squash(clean)

  // Match leading term: e.g. x^8 or 16x^4
  const leadMatch = squashed.match(/^([+-]?\d*)?([a-zA-Z])\^\{?(\d+)\}?/)
  if (!leadMatch) return null
  const leadCoeffStr = leadMatch[1]
  const varName = leadMatch[2]
  const n = Number.parseInt(leadMatch[3], 10)
  if (n < 2 || n > 10) return null

  const leadCoeff =
    !leadCoeffStr || leadCoeffStr === '+'
      ? 1
      : leadCoeffStr === '-'
        ? -1
        : Number.parseFloat(leadCoeffStr)
  if (leadCoeff <= 0) return null
  const a = Math.round(Math.pow(leadCoeff, 1 / n))
  if (Math.pow(a, n) !== leadCoeff) return null

  // Match constant term at the end: e.g. + 256 or - 256
  const constMatch = squashed.match(/([+\-])(\d+(?:\.\d+)?)$/)
  if (!constMatch) return null
  const sign = constMatch[1]
  const constVal = Number.parseFloat(constMatch[2])
  const signedConst = sign === '-' ? -constVal : constVal

  if (n % 2 === 0 && signedConst < 0) return null

  const absB = Math.round(Math.pow(constVal, 1 / n))
  const candidates: number[] = []
  if (n % 2 === 1) {
    const b = signedConst < 0 ? -absB : absB
    candidates.push(b)
  } else {
    candidates.push(absB, -absB)
  }

  for (const b of candidates) {
    if (Math.pow(Math.abs(b), n) !== constVal) continue
    const axStr = a === 1 ? varName : `${a}${varName}`
    const bStr = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`
    const candidateExpr = `(${axStr} ${bStr})^${n}`
    const expanded = expandBinomialPower(candidateExpr)
    if (expanded && squash(expanded) === squashed) {
      return candidateExpr
    }
  }
  return null
}

/** Expand binomial power: (ax + b)^n for n in [1, 10] */
export function expandBinomialPower(clean: string): string | null {
  let targetClean = clean.replace(/\s+/g, '')

  // Preprocess any numeric sub-expressions in the constant term: e.g. (x - 2^3)^3 -> (x - 8)^3
  const innerSubExpr = targetClean.match(
    /^\(([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])([+-].*)\)\^\{?(\d+)\}?$/,
  )
  if (innerSubExpr) {
    const aLead = innerSubExpr[1]
    const vName = innerSubExpr[2]
    const constSub = innerSubExpr[3]
    const nPow = innerSubExpr[4]
    try {
      const val = evaluate(cleanEquationForMathjs(constSub))
      if (typeof val === 'number' && Number.isFinite(val)) {
        const sign = val >= 0 ? '+' : '-'
        targetClean = `(${aLead ?? ''}${vName}${sign}${Math.abs(val)})^${nPow}`
      }
    } catch {}
  }

  const m = targetClean
    .match(
      /^\(([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])([+-]\d+(?:\.\d+)?)\)\^\{?(\d+)\}?$/,
    )
  if (!m) return null
  const aStr = m[1]
  const a = !aStr || aStr === '+' ? 1 : aStr === '-' ? -1 : Number.parseFloat(aStr)
  const v = m[2]
  const b = Number.parseFloat(m[3])
  const n = Number.parseInt(m[4], 10)
  if (n < 1 || n > 10) return null

  if (n === 1) {
    const aCoeff = a === 1 ? '' : a === -1 ? '-' : `${a}`
    const bSign = b >= 0 ? '+ ' : '- '
    return `${aCoeff}${v} ${bSign}${Math.abs(b)}`
  }

  const terms: { coeff: number; powerV: number }[] = []
  for (let k = 0; k <= n; k++) {
    const powerV = n - k
    const coeff = comb(n, k) * Math.pow(a, powerV) * Math.pow(b, k)
    if (Math.abs(coeff) < 1e-9) continue
    terms.push({ coeff, powerV })
  }

  let out = ''
  for (let i = 0; i < terms.length; i++) {
    const { coeff, powerV } = terms[i]
    const sign = coeff < 0 ? '-' : '+'
    const absCoeff = Math.abs(coeff)
    const coeffStr = absCoeff === 1 && powerV > 0 ? '' : absCoeff.toString()
    const varPart = powerV === 0 ? '' : powerV === 1 ? v : `${v}^${powerV}`
    const termStr = `${coeffStr}${varPart}`

    if (i === 0) {
      out += (coeff < 0 ? '-' : '') + termStr
    } else {
      out += ` ${sign} ${termStr}`
    }
  }
  return out
}

/** Expand binomial product: (a1*x + b1)(a2*x + b2) */
export function expandBinomialProduct(clean: string): string | null {
  const m = clean
    .replace(/\s+/g, '')
    .match(
      /^\(([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])([+-]\d+(?:\.\d+)?)\)\*?\(([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])([+-]\d+(?:\.\d+)?)\)$/,
    )
  if (!m) return null
  const a1 = !m[1] || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number.parseFloat(m[1])
  const v1 = m[2]
  const b1 = Number.parseFloat(m[3])
  const a2 = !m[4] || m[4] === '+' ? 1 : m[4] === '-' ? -1 : Number.parseFloat(m[4])
  const v2 = m[5]
  const b2 = Number.parseFloat(m[6])
  if (v1 !== v2) return null

  const a = a1 * a2
  const b = a1 * b2 + a2 * b1
  const c = b1 * b2

  const aStr = a === 1 ? '' : a === -1 ? '-' : `${a}`
  const bSign = b > 0 ? '+ ' : '- '
  const bAbs = Math.abs(b)
  const bStr = bAbs === 1 ? '' : `${bAbs}`
  const bPart = b !== 0 ? ` ${bSign}${bStr}${v1}` : ''
  const cSign = c > 0 ? '+ ' : '- '
  const cPart = c !== 0 ? ` ${cSign}${Math.abs(c)}` : ''

  return `${aStr}${v1}^2${bPart}${cPart}`
}

/** Expand monomial distribution: a*x^p1(b*x^p2 + c) */
export function expandMonomialDistribution(clean: string): string | null {
  const m = clean
    .replace(/\s+/g, '')
    .match(
      /^([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])(?:\^\{?(\d+)\}?)?\*?\(([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])(?:\^\{?(\d+)\}?)?([+-]\d+(?:\.\d+)?)\)$/,
    )
  if (!m) return null
  const a1 = !m[1] || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number.parseFloat(m[1])
  const v1 = m[2]
  const p1 = m[3] ? Number.parseInt(m[3], 10) : 1
  const a2 = !m[4] || m[4] === '+' ? 1 : m[4] === '-' ? -1 : Number.parseFloat(m[4])
  const v2 = m[5]
  const p2 = m[6] ? Number.parseInt(m[6], 10) : 1
  const c = Number.parseFloat(m[7])
  if (v1 !== v2) return null

  const coeff1 = a1 * a2
  const pow1 = p1 + p2
  const coeff2 = a1 * c
  const pow2 = p1

  const fmtTerm = (coeff: number, pow: number) => {
    if (coeff === 0) return ''
    const cStr = Math.abs(coeff) === 1 && pow > 0 ? '' : `${Math.abs(coeff)}`
    const vStr = pow === 0 ? '' : pow === 1 ? v1 : `${v1}^${pow}`
    return `${cStr}${vStr}`
  }

  const t1 = (coeff1 < 0 ? '-' : '') + fmtTerm(coeff1, pow1)
  const sign2 = coeff2 >= 0 ? '+ ' : '- '
  const t2 = fmtTerm(coeff2, pow2)
  return `${t1} ${sign2}${t2}`
}

/** Expand algebraic expressions: power of binomial, product of binomials, distribution */
export function expandExpression(clean: string): string | null {
  return (
    expandBinomialPower(clean) ??
    expandBinomialProduct(clean) ??
    expandMonomialDistribution(clean)
  )
}

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
  if (!clean.includes('=') && transformsInput(clean, 'expand')) actions.push('expand')
  if (!clean.includes('=') && transformsInput(clean, 'simplify')) actions.push('simplify')
  if (
    (clean.includes('^2') || clean.includes('^') || factorBinomialPower(clean) !== null) &&
    transformsInput(clean, 'factor')
  ) {
    actions.push('factor')
  }
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
  action: 'solve' | 'factor' | 'simplify' | 'expand' | 'graph'
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
  action: 'solve' | 'factor' | 'simplify' | 'expand' | 'graph',
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
  action: 'solve' | 'factor' | 'simplify' | 'expand' | 'graph',
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

  const squash = (s: string) => s.replace(/\s+/g, '')

  // Case 1b: Expand algebraic expression (powers of binomials, products of binomials, distribution)
  if (action === 'expand') {
    const expanded = expandExpression(clean)
    if (expanded && squash(expanded) !== squash(clean)) {
      return { latex: clean, action, resultLatex: expanded, plainText: expanded }
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

  // Factor a quadratic or higher-degree binomial power expression:
  // e.g. x^2+2x+1 -> (x + 1)^2 or x^8 - 16x^7 + ... + 256 -> (x - 2)^8
  if (action === 'factor') {
    const binomialFactored = factorBinomialPower(clean)
    if (binomialFactored && squash(binomialFactored) !== squash(clean)) {
      return {
        latex: clean,
        action,
        resultLatex: binomialFactored,
        plainText: binomialFactored,
      }
    }

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
