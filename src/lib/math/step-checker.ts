import { rationalize } from 'mathjs'
import { cleanEquationForMathjs, solveMath } from './math-solver'

export type CoachingMethod =
  | 'auto'
  | 'completing-the-square'
  | 'factoring'
  | 'quadratic-formula'
  | 'linear-balancing'
  | 'systems'

export interface StepCheckResult {
  isValid: boolean
  confidence: number
  reason?:
    | 'sign_error'
    | 'arithmetic_error'
    | 'division_error'
    | 'factor_error'
    | 'syntax_error'
    | 'unknown'
  hint?: string
}

export interface DerivationReport {
  allValid: boolean
  firstErrorIndex?: number
  stepResults: StepCheckResult[]
}

export interface SocraticHint {
  operation: string
  socraticPrompt: string
  expectedNextForm: string
}

interface ParsedLinear {
  varName: string
  a: number
  b: number
  c: number
}

interface FactoredQuadratic {
  varName: string
  roots: [number, number]
}

interface SquaredBinomialEquation {
  varName: string
  h: number
  k: number
}

function parseSquaredBinomialEquation(equation: string): SquaredBinomialEquation | null {
  const clean = canonicalize(equation).replace(/\s+/g, '')
  const m = clean.match(/^\(([a-zA-Z])([+-]\d+(?:\.\d+)?)\)\^\{?2\}?=([+-]?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const varName = m[1]
  const h = Number.parseFloat(m[2])
  const k = Number.parseFloat(m[3])
  if (Number.isNaN(h) || Number.isNaN(k)) return null
  return { varName, h, k }
}

function canonicalize(raw: string): string {
  return raw
    .replace(/\$/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\^\s*\{\s*([^{}]+?)\s*\}/g, '^$1')
    .replace(/\\times/g, '*')
    .replace(/\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .trim()
}

function hasSyntaxError(raw: string): boolean {
  if (!raw?.trim()) return true
  const clean = canonicalize(raw)
  if (!clean.includes('=')) return true
  const parts = clean.split('=')
  if (parts.length !== 2) return true
  if (!parts[0].trim() || !parts[1].trim()) return true

  // Check invalid operator repetitions like ++, +*, *+, etc.
  if (/[+\-*/]{2,}/.test(clean.replace(/\+-|-\+/g, '-'))) return true

  // Check balanced parentheses
  let depth = 0
  for (const ch of clean) {
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth < 0) return true
    }
  }
  return depth !== 0
}

function parseSide(
  sideStr: string,
): { coeff: number; constant: number; varName: string | null } | null {
  const clean = sideStr.replace(/\s+/g, '')
  if (!clean) return null

  // Replace subtraction with '+-' except at start or after operator
  const normalized = clean.replace(/(?<!^|[+*/])-+/g, '+-')
  const terms = normalized.split('+').filter((t) => t.length > 0)
  let coeff = 0
  let constant = 0
  let varName: string | null = null

  for (const term of terms) {
    const m = term.match(/^([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])$/)
    if (m) {
      const cStr = m[1]
      const v = m[2]
      if (varName && varName !== v) {
        return null // Multiple different variables in one side
      }
      varName = v
      const c = !cStr || cStr === '+' ? 1 : cStr === '-' ? -1 : Number.parseFloat(cStr)
      coeff += c
    } else {
      const val = Number.parseFloat(term)
      if (!Number.isNaN(val)) {
        constant += val
      } else {
        return null
      }
    }
  }

  return { coeff, constant, varName }
}

function parseLinear(equation: string): ParsedLinear | null {
  const clean = canonicalize(equation)
  if (!clean.includes('=')) return null
  const [leftRaw, rightRaw] = clean.split('=')
  if (!leftRaw || !rightRaw) return null

  // Quadratic forms with ^2 are not pure linear
  if (clean.includes('^2')) return null

  const left = parseSide(leftRaw)
  const right = parseSide(rightRaw)
  if (!left || !right) return null

  // Standard case 1: Variable on left, constant on right
  if (left.varName && !right.varName) {
    return {
      varName: left.varName,
      a: left.coeff,
      b: left.constant,
      c: right.constant,
    }
  }

  // Standard case 2: Variable on right, constant on left (flipped)
  if (!left.varName && right.varName) {
    return {
      varName: right.varName,
      a: right.coeff,
      b: right.constant,
      c: left.constant,
    }
  }

  // Case 3: Variable on both sides (e.g. 2x + 5 = x + 10)
  if (left.varName && right.varName && left.varName === right.varName) {
    return {
      varName: left.varName,
      a: left.coeff - right.coeff,
      b: left.constant,
      c: right.constant,
    }
  }

  return null
}

function parseFactoredQuadratic(equation: string): FactoredQuadratic | null {
  const clean = canonicalize(equation).replace(/\s+/g, '')
  if (!clean.endsWith('=0')) return null

  // Case 1: (ax + b)^2 = 0 or (ax + b)^{2} = 0
  const sqMatch = clean.match(
    /^\(([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])([+-]\d+(?:\.\d+)?)\)\^\{?2\}?=0$/,
  )
  if (sqMatch) {
    const aStr = sqMatch[1]
    const a = !aStr || aStr === '+' ? 1 : aStr === '-' ? -1 : Number.parseFloat(aStr)
    const varName = sqMatch[2]
    const b = Number.parseFloat(sqMatch[3])
    const r = -b / a
    return { varName, roots: [r, r] }
  }

  // Case 2: (a1 x + b1)(a2 x + b2) = 0 (optional * between)
  const biMatch = clean.match(
    /^\(([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])([+-]\d+(?:\.\d+)?)\)\*?\(([+-]?\d*(?:\.\d+)?)?\*?([a-zA-Z])([+-]\d+(?:\.\d+)?)\)=0$/,
  )
  if (biMatch) {
    const a1Str = biMatch[1]
    const a1 = !a1Str || a1Str === '+' ? 1 : a1Str === '-' ? -1 : Number.parseFloat(a1Str)
    const var1 = biMatch[2]
    const b1 = Number.parseFloat(biMatch[3])

    const a2Str = biMatch[4]
    const a2 = !a2Str || a2Str === '+' ? 1 : a2Str === '-' ? -1 : Number.parseFloat(a2Str)
    const var2 = biMatch[5]
    const b2 = Number.parseFloat(biMatch[6])

    if (var1 !== var2) return null
    const r1 = -b1 / a1
    const r2 = -b2 / a2
    return {
      varName: var1,
      roots: [Math.min(r1, r2), Math.max(r1, r2)],
    }
  }

  return null
}

function parseExpandedRoots(equation: string): [number, number] | null {
  const clean = canonicalize(equation)
  const sol = solveMath(clean, 'solve')
  if (!sol?.resultLatex) return null
  const m = sol.resultLatex.match(
    /^[a-zA-Z]\s*=\s*([+-]?\d+(?:\.\d+)?)(?:,\s*([+-]?\d+(?:\.\d+)?))?$/,
  )
  if (!m) return null
  const r1 = Number.parseFloat(m[1])
  const r2 = m[2] ? Number.parseFloat(m[2]) : r1
  return [Math.min(r1, r2), Math.max(r1, r2)]
}

/**
 * Checks whether eq2 is a valid, mathematically sound next step following eq1.
 */
export function checkEquationEquivalence(eq1: string, eq2: string): StepCheckResult {
  if (hasSyntaxError(eq1) || hasSyntaxError(eq2)) {
    return {
      isValid: false,
      confidence: 0.95,
      reason: 'syntax_error',
      hint: 'Please check the mathematical syntax of your equation.',
    }
  }

  const clean1 = canonicalize(eq1)
  const clean2 = canonicalize(eq2)

  // Identical equation
  if (clean1.replace(/\s+/g, '') === clean2.replace(/\s+/g, '')) {
    return { isValid: true, confidence: 1 }
  }

  const p1 = parseLinear(clean1)
  const p2 = parseLinear(clean2)

  // Both equations are linear forms
  if (p1 && p2) {
    if (p1.varName !== p2.varName) {
      return {
        isValid: false,
        confidence: 0.95,
        reason: 'unknown',
        hint: `Variable changed from ${p1.varName} to ${p2.varName}.`,
      }
    }

    // Step 1: Isolating variable term by eliminating constant (e.g. 2x + 5 = 15 -> 2x = 10)
    if (p1.b !== 0 && p2.b === 0 && p1.a === p2.a) {
      const correctRhs = p1.c - p1.b
      if (p2.c === correctRhs) {
        return { isValid: true, confidence: 1 }
      }

      // Sign error check: added constant instead of subtracting (or vice versa)
      if (p2.c === p1.c + p1.b) {
        const signWord = p1.b > 0 ? 'subtracted' : 'added'
        const oppositeWord = p1.b > 0 ? 'added' : 'subtracted'
        return {
          isValid: false,
          confidence: 0.95,
          reason: 'sign_error',
          hint: `Check if you ${oppositeWord} instead of ${signWord} ${Math.abs(p1.b)} from both sides.`,
        }
      }

      // Arithmetic error: correct operation attempted but wrong arithmetic
      return {
        isValid: false,
        confidence: 0.9,
        reason: 'arithmetic_error',
        hint: `Check your calculation on the right side: ${p1.c} ${p1.b >= 0 ? '-' : '+'} ${Math.abs(p1.b)} = ${correctRhs}.`,
      }
    }

    // Step 2: Isolating variable by dividing coefficient (e.g. 2x = 10 -> x = 5)
    if (p1.b === 0 && p2.b === 0 && p1.a !== 1 && p2.a === 1) {
      const correctRhs = p1.c / p1.a
      if (p2.c === correctRhs) {
        return { isValid: true, confidence: 1 }
      }

      // Sign error on division (e.g. -2x = 10 -> x = 5)
      if (Math.abs(p2.c) === Math.abs(correctRhs) && p2.c === -correctRhs) {
        return {
          isValid: false,
          confidence: 0.95,
          reason: 'sign_error',
          hint: `Check the sign when dividing by ${p1.a}.`,
        }
      }

      // Division error
      return {
        isValid: false,
        confidence: 0.95,
        reason: 'division_error',
        hint: `Check your division: ${p1.c} / ${p1.a} = ${correctRhs}.`,
      }
    }

    // General linear root comparison (e.g. student did combined operations or 1-step solve)
    const root1 = (p1.c - p1.b) / p1.a
    const root2 = (p2.c - p2.b) / p2.a
    if (Math.abs(root1 - root2) < 1e-6) {
      return { isValid: true, confidence: 1 }
    }

    // Direct solve sign error (e.g. x + 5 = 15 -> x = 20)
    if (p1.a === 1 && p2.a === 1 && p1.b !== 0 && p2.b === 0) {
      if (p2.c === p1.c + p1.b) {
        const signWord = p1.b > 0 ? 'subtracted' : 'added'
        const oppositeWord = p1.b > 0 ? 'added' : 'subtracted'
        return {
          isValid: false,
          confidence: 0.95,
          reason: 'sign_error',
          hint: `Check if you ${oppositeWord} instead of ${signWord} ${Math.abs(p1.b)} from both sides.`,
        }
      }
    }
  }

  // Quadratic factoring & expansion check
  const factoredQuadratic1 = parseFactoredQuadratic(clean1)
  const factoredQuadratic2 = parseFactoredQuadratic(clean2)
  const expandedRoots1 = parseExpandedRoots(clean1)
  const expandedRoots2 = parseExpandedRoots(clean2)

  // Case 1: Factored form to factored form comparison (e.g. (x - 2)(x + 2) = 0 vs (x - 4)(x + 1) = 0)
  if (factoredQuadratic1 && factoredQuadratic2) {
    if (
      Math.abs(factoredQuadratic1.roots[0] - factoredQuadratic2.roots[0]) < 1e-6 &&
      Math.abs(factoredQuadratic1.roots[1] - factoredQuadratic2.roots[1]) < 1e-6
    ) {
      return { isValid: true, confidence: 1 }
    }
    return {
      isValid: false,
      confidence: 0.95,
      reason: 'factor_error',
      hint: 'Check the signs and constants in your factored binomials.',
    }
  }

  // Case 2: Expanded form to factored form (e.g. x^2 - 4x + 4 = 0 -> (x - 2)^2 = 0)
  if (expandedRoots1 && factoredQuadratic2) {
    const [e1, e2] = expandedRoots1
    const [f1, f2] = factoredQuadratic2.roots
    if (Math.abs(e1 - f1) < 1e-6 && Math.abs(e2 - f2) < 1e-6) {
      return { isValid: true, confidence: 1 }
    }
    return {
      isValid: false,
      confidence: 0.95,
      reason: 'factor_error',
      hint: 'Check the signs and constants in your factored binomials.',
    }
  }

  // Case 3: Both expanded forms (e.g. x^2 - 4x + 4 = 0 vs x^2 - 4x = -4)
  if (expandedRoots1 && expandedRoots2) {
    if (
      Math.abs(expandedRoots1[0] - expandedRoots2[0]) < 1e-6 &&
      Math.abs(expandedRoots1[1] - expandedRoots2[1]) < 1e-6
    ) {
      return { isValid: true, confidence: 1 }
    }
  }

  // Case 4: Factored form to linear root step (e.g. (x - 2)^2 = 0 -> x - 2 = 0)
  if (factoredQuadratic1 && p2) {
    const root2 = (p2.c - p2.b) / p2.a
    const matchesRoot =
      Math.abs(factoredQuadratic1.roots[0] - root2) < 1e-6 ||
      Math.abs(factoredQuadratic1.roots[1] - root2) < 1e-6
    if (matchesRoot) {
      return { isValid: true, confidence: 1 }
    }
  }

  // Completing the Square diagnostic & step checks
  const sqBin1 = parseSquaredBinomialEquation(clean1)
  const sqBin2 = parseSquaredBinomialEquation(clean2)

  // Check if eq1 is x^2 + bx = d and eq2 is (x + h)^2 = k (where student forgot to add h^2 to RHS)
  if (sqBin2 && clean1.includes('=')) {
    const [l1, r1] = clean1.replace(/\s+/g, '').split('=')
    try {
      const l1Rat = rationalize(cleanEquationForMathjs(l1), {}, true)
      const r1Val = Number.parseFloat(r1)
      if (
        !Number.isNaN(r1Val) &&
        l1Rat.variables?.length === 1 &&
        l1Rat.coefficients?.length === 3
      ) {
        const cLeft = Number(l1Rat.coefficients[0])
        const bLeft = Number(l1Rat.coefficients[1])
        const aLeft = Number(l1Rat.coefficients[2])
        const halfB = bLeft / 2
        const sq = halfB * halfB
        // Student had x^2 + bx = d (cLeft === 0) and wrote (x + b/2)^2 = d instead of d + (b/2)^2
        if (
          aLeft === 1 &&
          Math.abs(cLeft) < 1e-9 &&
          Math.abs(sqBin2.h - halfB) < 1e-6 &&
          Math.abs(sqBin2.k - r1Val) < 1e-6 &&
          Math.abs(sq) > 1e-9
        ) {
          const expectedRhs = r1Val + sq
          return {
            isValid: false,
            confidence: 0.95,
            reason: 'arithmetic_error',
            hint: `Remember to add ${sq} to the right side as well to keep the equation balanced (${r1Val} + ${sq} = ${expectedRhs}).`,
          }
        }
      }
    } catch {
      // Ignore parse failures and continue
    }
  }

  // Check if eq1 is (x + h)^2 = k (k > 0) and eq2 is x + h = ±sqrt(k) or linear branch x + h = sqrt(k) / -sqrt(k)
  if (sqBin1 && sqBin1.k > 0) {
    const rootK = Math.sqrt(sqBin1.k)
    const noSpace2 = clean2.replace(/\s+/g, '').replace(/\\pm/g, '±')
    const hSign = sqBin1.h >= 0 ? `+${sqBin1.h}` : `${sqBin1.h}`
    if (noSpace2 === `${sqBin1.varName}${hSign}=±${rootK}`) {
      return { isValid: true, confidence: 1 }
    }
    if (p2 && p2.varName === sqBin1.varName) {
      const root2 = (p2.c - p2.b) / p2.a
      const rPos = -sqBin1.h + rootK
      const rNeg = -sqBin1.h - rootK
      if (Math.abs(root2 - rPos) < 1e-6 || Math.abs(root2 - rNeg) < 1e-6) {
        return { isValid: true, confidence: 1 }
      }
    }
  }

  // General solver comparison
  const sol1 = solveMath(clean1, 'solve')
  const sol2 = solveMath(clean2, 'solve')

  if (sol1?.resultLatex && sol2?.resultLatex) {
    if (sol1.resultLatex === sol2.resultLatex) {
      return { isValid: true, confidence: 1 }
    }

    if (clean2.includes('(') && clean2.includes(')')) {
      return {
        isValid: false,
        confidence: 0.9,
        reason: 'factor_error',
        hint: 'Check the signs of your factored terms.',
      }
    }
  }

  return {
    isValid: false,
    confidence: 0.7,
    reason: 'unknown',
    hint: 'This step does not appear to follow from the previous line.',
  }
}

/**
 * Generates a Socratic hint suggesting what operation to perform next.
 */
export function generateSocraticHint(
  equation: string,
  options?: { method?: CoachingMethod },
): SocraticHint | null {
  if (hasSyntaxError(equation)) return null

  const method = options?.method ?? 'auto'
  const clean = canonicalize(equation)
  const p = parseLinear(clean)

  if (p) {
    // Case 1: Constant needs to be balanced
    if (p.b !== 0) {
      const op = p.b > 0 ? `Subtract ${p.b}` : `Add ${Math.abs(p.b)}`
      const nextC = p.c - p.b
      const coeffStr = p.a === 1 ? '' : p.a === -1 ? '-' : `${p.a}`
      return {
        operation: `${op} from both sides`,
        socraticPrompt: 'How can you isolate the variable term by balancing the constant?',
        expectedNextForm: `${coeffStr}${p.varName} = ${nextC}`,
      }
    }

    // Case 2: Coefficient needs to be divided
    if (p.a !== 1) {
      const nextC = p.c / p.a
      return {
        operation: `Divide both sides by ${p.a}`,
        socraticPrompt: 'What operation undoes multiplication by the coefficient?',
        expectedNextForm: `${p.varName} = ${nextC}`,
      }
    }

    // Already solved (e.g. x = 5)
    return null
  }

  // Case 3: Factored quadratic (= 0)
  const factored = parseFactoredQuadratic(clean)
  if (factored) {
    const r = factored.roots[0]
    const sign = -r >= 0 ? `+ ${-r}` : `- ${r}`
    return {
      operation: 'Apply the zero product property',
      socraticPrompt: 'If a product of terms equals zero, what must be true about each factor?',
      expectedNextForm: `${factored.varName} ${sign} = 0`,
    }
  }

  // Case 3b: Squared binomial equation (x + h)^2 = k (Completing the Square Step 4)
  const sqBin = parseSquaredBinomialEquation(clean)
  if (sqBin && sqBin.k > 0) {
    const rootK = Math.sqrt(sqBin.k)
    const cleanRoot = Number.isInteger(rootK) ? `${rootK}` : rootK.toFixed(2)
    const hSign = sqBin.h >= 0 ? `+ ${sqBin.h}` : `- ${Math.abs(sqBin.h)}`
    return {
      operation: 'Take the square root of both sides',
      socraticPrompt:
        'Take the positive and negative square root of both sides to undo the square.',
      expectedNextForm: `${sqBin.varName} ${hSign} = ±${cleanRoot}`,
    }
  }

  // Case 4: Quadratic equations (ax^2 + bx + c = 0 or partial completing-the-square forms)
  if (clean.includes('=')) {
    const [l, r] = clean.replace(/\s+/g, '').split('=')
    try {
      const lClean = cleanEquationForMathjs(l)
      const rClean = cleanEquationForMathjs(r)
      const rat = rationalize(`(${lClean}) - (${rClean})`, {}, true)
      if (
        rat.variables &&
        rat.variables.length === 1 &&
        rat.coefficients &&
        rat.coefficients.length === 3
      ) {
        const cVal = Number(rat.coefficients[0])
        const bVal = Number(rat.coefficients[1])
        const aVal = Number(rat.coefficients[2])
        const varName = String(rat.variables[0])

        // If b === 0 (pure quadratic like 2x^2 - 2 = 0 or 2x^2 = 2):
        if (bVal === 0) {
          const lHasConstant = l.includes('+') || l.includes('-')
          const rIsZero = r === '0'

          // Step 1: 2x^2 - 2 = 0 -> balance constant to RHS: 2x^2 = 2
          if (lHasConstant && rIsZero && cVal !== 0) {
            const targetRhs = -cVal
            const op = cVal < 0 ? `Add ${Math.abs(cVal)}` : `Subtract ${cVal}`
            if (aVal === 1) {
              return {
                operation: `${op} to both sides`,
                socraticPrompt: 'How can you isolate the squared term?',
                expectedNextForm: `${varName}^2 = ${targetRhs}`,
              }
            }
            return {
              operation: `${op} to both sides`,
              socraticPrompt: 'How can you isolate the variable term by moving the constant?',
              expectedNextForm: `${aVal}${varName}^2 = ${targetRhs}`,
            }
          }

          // Step 2: 2x^2 = 2 -> divide by leading coefficient: x^2 = 1
          if (aVal !== 1 && aVal > 0) {
            const rhsVal = -cVal / aVal
            return {
              operation: `Divide both sides by ${aVal}`,
              socraticPrompt: 'What operation isolates the squared variable?',
              expectedNextForm: `${varName}^2 = ${rhsVal}`,
            }
          }

          // Step 3: x^2 = 1 or x^2 - 1 = 0 -> take square root of both sides
          if (aVal === 1) {
            const rhsVal = -cVal
            if (rhsVal > 0) {
              const root = Math.sqrt(rhsVal)
              const cleanRoot = Number.isInteger(root) ? root : root.toFixed(2)
              return {
                operation: 'Take the square root of both sides',
                socraticPrompt: 'What operation undoes squaring the variable?',
                expectedNextForm: `${varName} = ±${cleanRoot}`,
              }
            }
          }
        }

        // If common factor across all coefficients: e.g. 2x^2 - 4x + 2 = 0 -> divide by 2
        if (aVal !== 1 && aVal > 0) {
          if (bVal % aVal === 0 && cVal % aVal === 0) {
            const newB = bVal / aVal
            const newC = cVal / aVal
            const bSign = newB > 0 ? `+ ${newB}` : newB < 0 ? `- ${Math.abs(newB)}` : ''
            const cSign = newC > 0 ? `+ ${newC}` : newC < 0 ? `- ${Math.abs(newC)}` : ''
            const bPart = bSign ? ` ${bSign}${varName}` : ''
            const cPart = cSign ? ` ${cSign}` : ''
            return {
              operation: `Divide both sides by ${aVal}`,
              socraticPrompt:
                'Notice all terms share a common factor. What happens if you divide by it?',
              expectedNextForm: `${varName}^2${bPart}${cPart} = 0`,
            }
          }
        }

        // Completing the Square step detection when a === 1 and b !== 0
        if (aVal === 1 && bVal !== 0) {
          const lRat = rationalize(lClean, {}, true)
          const rNum = Number.parseFloat(r)
          if (
            !Number.isNaN(rNum) &&
            lRat.variables?.length === 1 &&
            lRat.coefficients?.length === 3
          ) {
            const cLeft = Number(lRat.coefficients[0])
            const bLeft = Number(lRat.coefficients[1])
            const aLeft = Number(lRat.coefficients[2])

            if (aLeft === 1 && bLeft === bVal) {
              const halfB = bVal / 2
              const sq = halfB * halfB
              const bSignStr = bVal > 0 ? `+ ${bVal}` : `- ${Math.abs(bVal)}`

              // Step 2 of CTS: Constant is already isolated on RHS (e.g. x^2 + 6x = 7)
              if (Math.abs(cLeft) < 1e-9 && r !== '0') {
                const newRhs = rNum + sq
                return {
                  operation: `Add (${Math.abs(bVal)}/2)² = ${sq} to both sides`,
                  socraticPrompt: `Take half of the x-coefficient (${halfB}), square it (${sq}), and add ${sq} to both sides to complete the square.`,
                  expectedNextForm: `${varName}^2 ${bSignStr}${varName} + ${sq} = ${newRhs}`,
                }
              }

              // Step 3 of CTS: LHS is already a perfect square trinomial equal to a non-zero RHS (e.g. x^2 + 6x + 9 = 16)
              if (Math.abs(cLeft - sq) < 1e-9 && rNum !== 0) {
                const hSignStr = halfB >= 0 ? `+ ${halfB}` : `- ${Math.abs(halfB)}`
                return {
                  operation: 'Rewrite the left side as a squared binomial',
                  socraticPrompt: `Factor the perfect square trinomial on the left into (${varName} ${hSignStr})².`,
                  expectedNextForm: `(${varName} ${hSignStr})^2 = ${rNum}`,
                }
              }

              // Step 1 of CTS: Explicit completing-the-square mode OR irrational roots fallback in auto mode
              const disc = bVal * bVal - 4 * aVal * cVal
              const sqrtDisc = disc >= 0 ? Math.sqrt(disc) : -1
              const hasIntegerRoots =
                disc >= 0 &&
                Math.abs(sqrtDisc - Math.round(sqrtDisc)) < 1e-6 &&
                Math.abs((-bVal + Math.round(sqrtDisc)) % (2 * aVal)) < 1e-6

              if (
                cLeft !== 0 &&
                (method === 'completing-the-square' || (method === 'auto' && !hasIntegerRoots))
              ) {
                const targetRhs = rNum - cLeft
                const op =
                  cLeft < 0
                    ? `Add ${Math.abs(cLeft)} to both sides to isolate the ${varName} terms`
                    : `Subtract ${cLeft} from both sides to isolate the ${varName} terms`
                return {
                  operation: op,
                  socraticPrompt:
                    'To complete the square, first move the constant term to the right side.',
                  expectedNextForm: `${varName}^2 ${bSignStr}${varName} = ${targetRhs}`,
                }
              }
            }
          }
        }
      }
    } catch {
      // Fall through to standard factoring
    }
  }

  // Case 4b: General quadratic in standard form: factor
  const roots = parseExpandedRoots(clean)
  if (roots) {
    const [r1, r2] = roots
    const cleanNoSpaces = clean.replace(/\s+/g, '')
    const varMatch = cleanNoSpaces.match(/([a-zA-Z])\^2/)
    const varName = varMatch ? varMatch[1] : 'x'

    if (Math.abs(r1 - r2) < 1e-6) {
      const sign = -r1 >= 0 ? `+ ${-r1}` : `- ${r1}`
      return {
        operation: 'Factor the quadratic expression',
        socraticPrompt:
          'Notice this is a perfect square trinomial. What binomial squared produces this?',
        expectedNextForm: `(${varName} ${sign})^2 = 0`,
      }
    }

    const sign1 = -r1 >= 0 ? `+ ${-r1}` : `- ${r1}`
    const sign2 = -r2 >= 0 ? `+ ${-r2}` : `- ${r2}`
    return {
      operation: 'Factor the quadratic expression',
      socraticPrompt:
        'What two numbers multiply to the constant term and add up to the middle coefficient?',
      expectedNextForm: `(${varName} ${sign1})(${varName} ${sign2}) = 0`,
    }
  }

  return null
}

/** Alias for generateSocraticHint */
export const suggestNextStep = generateSocraticHint

/**
 * Verifies a sequential chain of mathematical steps (e.g. lines written down a page).
 */
export function verifyDerivation(steps: string[]): DerivationReport {
  const stepResults: StepCheckResult[] = []
  let allValid = true
  let firstErrorIndex: number | undefined

  for (let i = 0; i < steps.length - 1; i++) {
    const res = checkEquationEquivalence(steps[i], steps[i + 1])
    stepResults.push(res)
    if (!res.isValid && firstErrorIndex === undefined) {
      allValid = false
      firstErrorIndex = i + 1
    }
  }

  return {
    allValid,
    firstErrorIndex,
    stepResults,
  }
}

/** Alias for verifyDerivation */
export const verifyDerivationChain = verifyDerivation
