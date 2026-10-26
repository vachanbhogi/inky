import { describe, expect, it } from 'bun:test'
import {
  checkEquationEquivalence,
  generateSocraticHint,
  suggestNextStep,
  verifyDerivation,
  verifyDerivationChain,
} from './step-checker'

describe('Step Checker & Socratic Engine', () => {
  describe('Linear Equation Equivalence Checks', () => {
    it('validates correct linear balance steps', () => {
      // 2x + 5 = 15 -> 2x = 10
      const step1 = checkEquationEquivalence('2x + 5 = 15', '2x = 10')
      expect(step1.isValid).toBe(true)
      expect(step1.confidence).toBe(1)

      // 2x = 10 -> x = 5
      const step2 = checkEquationEquivalence('2x = 10', 'x = 5')
      expect(step2.isValid).toBe(true)
      expect(step2.confidence).toBe(1)
    })

    it('handles negative constants and coefficients', () => {
      // 3x - 6 = 12 -> 3x = 18
      const step1 = checkEquationEquivalence('3x - 6 = 12', '3x = 18')
      expect(step1.isValid).toBe(true)

      // 3x = 18 -> x = 6
      const step2 = checkEquationEquivalence('3x = 18', 'x = 6')
      expect(step2.isValid).toBe(true)

      // -2x + 4 = 10 -> -2x = 6
      const step3 = checkEquationEquivalence('-2x + 4 = 10', '-2x = 6')
      expect(step3.isValid).toBe(true)

      // -2x = 6 -> x = -3
      const step4 = checkEquationEquivalence('-2x = 6', 'x = -3')
      expect(step4.isValid).toBe(true)
    })

    it('supports LaTeX formatted equations', () => {
      const res = checkEquationEquivalence('$2x + 5 = 15$', '$2x = 10$')
      expect(res.isValid).toBe(true)
      expect(res.confidence).toBe(1)
    })

    it('detects sign errors when adding instead of subtracting', () => {
      // 2x + 5 = 15 -> 2x = 20 (added 5 instead of subtracting 5)
      const res = checkEquationEquivalence('2x + 5 = 15', '2x = 20')
      expect(res.isValid).toBe(false)
      expect(res.reason).toBe('sign_error')
      expect(res.hint).toContain('subtracted')
      expect(res.confidence).toBeGreaterThanOrEqual(0.9)
    })

    it('detects sign errors when subtracting instead of adding', () => {
      // 2x - 5 = 15 -> 2x = 10 (subtracted 5 instead of adding 5)
      const res = checkEquationEquivalence('2x - 5 = 15', '2x = 10')
      expect(res.isValid).toBe(false)
      expect(res.reason).toBe('sign_error')
      expect(res.hint).toContain('added')
    })

    it('detects arithmetic errors when operation is attempted but math is wrong', () => {
      // 2x + 5 = 15 -> 2x = 11 (15 - 5 != 11)
      const res = checkEquationEquivalence('2x + 5 = 15', '2x = 11')
      expect(res.isValid).toBe(false)
      expect(res.reason).toBe('arithmetic_error')
      expect(res.hint).toContain('calculation')
      expect(res.confidence).toBeGreaterThanOrEqual(0.9)
    })

    it('detects division errors when isolating variable', () => {
      // 2x = 10 -> x = 4 (10 / 2 != 4)
      const res = checkEquationEquivalence('2x = 10', 'x = 4')
      expect(res.isValid).toBe(false)
      expect(res.reason).toBe('division_error')
      expect(res.hint).toContain('division')
      expect(res.confidence).toBeGreaterThanOrEqual(0.9)
    })

    it('detects variable mismatches', () => {
      const res = checkEquationEquivalence('2x = 10', 'y = 5')
      expect(res.isValid).toBe(false)
    })
  })

  describe('Quadratic Factoring Checks', () => {
    it('validates perfect square quadratic factoring: x^2 - 4x + 4 = 0 -> (x - 2)^2 = 0', () => {
      const res = checkEquationEquivalence('x^2 - 4x + 4 = 0', '(x - 2)^2 = 0')
      expect(res.isValid).toBe(true)
      expect(res.confidence).toBe(1)
    })

    it('detects factoring sign error: x^2 - 4x + 4 = 0 -> (x + 2)^2 = 0', () => {
      const res = checkEquationEquivalence('x^2 - 4x + 4 = 0', '(x + 2)^2 = 0')
      expect(res.isValid).toBe(false)
      expect(res.reason).toBe('factor_error')
      expect(res.hint).toBeDefined()
    })

    it('validates difference of squares factoring: x^2 - 4 = 0 -> (x - 2)(x + 2) = 0', () => {
      const res = checkEquationEquivalence('x^2 - 4 = 0', '(x - 2)(x + 2) = 0')
      expect(res.isValid).toBe(true)
      expect(res.confidence).toBe(1)
    })

    it('detects incorrect factors: (x - 2)(x + 2) = 0 vs (x - 4)(x + 1) = 0', () => {
      const res = checkEquationEquivalence('(x - 2)(x + 2) = 0', '(x - 4)(x + 1) = 0')
      expect(res.isValid).toBe(false)
      expect(res.reason).toBe('factor_error')
      expect(res.hint).toBeDefined()
    })

    it('validates trinomial factoring: x^2 - 5x + 6 = 0 -> (x - 2)(x - 3) = 0', () => {
      const res = checkEquationEquivalence('x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0')
      expect(res.isValid).toBe(true)
    })

    it('detects sign flip in trinomial factors: x^2 - 5x + 6 = 0 -> (x + 2)(x + 3) = 0', () => {
      const res = checkEquationEquivalence('x^2 - 5x + 6 = 0', '(x + 2)(x + 3) = 0')
      expect(res.isValid).toBe(false)
      expect(res.reason).toBe('factor_error')
    })

    it('validates step from factored quadratic to zero product root: (x - 2)^2 = 0 -> x - 2 = 0', () => {
      const res = checkEquationEquivalence('(x - 2)^2 = 0', 'x - 2 = 0')
      expect(res.isValid).toBe(true)
    })
  })

  describe('Syntax & Malformed Input Handling', () => {
    it('identifies syntax errors for empty or invalid equations', () => {
      const emptyCheck = checkEquationEquivalence('', '2x = 10')
      expect(emptyCheck.isValid).toBe(false)
      expect(emptyCheck.reason).toBe('syntax_error')

      const noEquals = checkEquationEquivalence('2x + 5', '2x = 10')
      expect(noEquals.isValid).toBe(false)
      expect(noEquals.reason).toBe('syntax_error')

      const invalidTokens = checkEquationEquivalence('2x ++ 5 = 15', '2x = 10')
      expect(invalidTokens.isValid).toBe(false)
      expect(invalidTokens.reason).toBe('syntax_error')
    })

    it('handles identical steps gracefully', () => {
      const res = checkEquationEquivalence('2x = 10', '2x = 10')
      expect(res.isValid).toBe(true)
      expect(res.confidence).toBe(1)
    })
  })

  describe('Socratic Hint Generation', () => {
    it('suggests subtraction when constant is positive', () => {
      const hint = generateSocraticHint('2x + 5 = 15')
      expect(hint).not.toBeNull()
      expect(hint?.operation).toContain('Subtract 5')
      expect(hint?.expectedNextForm).toBe('2x = 10')
      expect(hint?.socraticPrompt).toBeTruthy()
    })

    it('suggests addition when constant is negative', () => {
      const hint = generateSocraticHint('2x - 5 = 15')
      expect(hint).not.toBeNull()
      expect(hint?.operation).toContain('Add 5')
      expect(hint?.expectedNextForm).toBe('2x = 20')
    })

    it('suggests division when only coefficient remains', () => {
      const hint = generateSocraticHint('2x = 10')
      expect(hint).not.toBeNull()
      expect(hint?.operation).toContain('Divide both sides by 2')
      expect(hint?.expectedNextForm).toBe('x = 5')
    })

    it('suggests factoring for quadratics in standard form', () => {
      const hint = generateSocraticHint('x^2 - 4x + 4 = 0')
      expect(hint).not.toBeNull()
      expect(hint?.operation.toLowerCase()).toContain('factor')
      expect(hint?.expectedNextForm).toBe('(x - 2)^2 = 0')
    })

    it('returns null when equation is already solved', () => {
      const hint = generateSocraticHint('x = 5')
      expect(hint).toBeNull()
    })

    it('suggestNextStep alias works identically', () => {
      const hint = suggestNextStep('2x + 5 = 15')
      expect(hint).not.toBeNull()
      expect(hint?.expectedNextForm).toBe('2x = 10')
    })
  })

  describe('Derivation Chain Verification', () => {
    it('verifies a completely valid derivation sequence', () => {
      const steps = ['2x + 5 = 15', '2x = 10', 'x = 5']
      const report = verifyDerivation(steps)
      expect(report.allValid).toBe(true)
      expect(report.firstErrorIndex).toBeUndefined()
      expect(report.stepResults.length).toBe(2)
      expect(report.stepResults.every((r) => r.isValid)).toBe(true)
    })

    it('identifies sign error at exact index in derivation', () => {
      const steps = ['2x + 5 = 15', '2x = 20', 'x = 10']
      const report = verifyDerivation(steps)
      expect(report.allValid).toBe(false)
      expect(report.firstErrorIndex).toBe(1)
      expect(report.stepResults[0].reason).toBe('sign_error')
    })

    it('identifies arithmetic error at exact index in derivation', () => {
      const steps = ['2x + 5 = 15', '2x = 11', 'x = 5.5']
      const report = verifyDerivation(steps)
      expect(report.allValid).toBe(false)
      expect(report.firstErrorIndex).toBe(1)
      expect(report.stepResults[0].reason).toBe('arithmetic_error')
    })

    it('identifies division error at exact index in derivation', () => {
      const steps = ['2x + 5 = 15', '2x = 10', 'x = 4']
      const report = verifyDerivation(steps)
      expect(report.allValid).toBe(false)
      expect(report.firstErrorIndex).toBe(2)
      expect(report.stepResults[1].reason).toBe('division_error')
    })

    it('handles empty and single-step derivations', () => {
      const empty = verifyDerivation([])
      expect(empty.allValid).toBe(true)
      expect(empty.stepResults).toHaveLength(0)

      const single = verifyDerivation(['2x + 5 = 15'])
      expect(single.allValid).toBe(true)
      expect(single.stepResults).toHaveLength(0)
    })

    it('verifies a quadratic derivation sequence', () => {
      const steps = ['x^2 - 4x + 4 = 0', '(x - 2)^2 = 0', 'x - 2 = 0', 'x = 2']
      const report = verifyDerivation(steps)
      expect(report.allValid).toBe(true)
      expect(report.firstErrorIndex).toBeUndefined()
    })

    it('supports verifyDerivationChain alias', () => {
      const steps = ['2x + 5 = 15', '2x = 10', 'x = 5']
      const report = verifyDerivationChain(steps)
      expect(report.allValid).toBe(true)
    })
  })

  describe('Completing the Square Socratic Coaching & Step Equivalence', () => {
    it('coaches Step 1 (isolate constant) when method is completing-the-square', () => {
      const hint = generateSocraticHint('x^2 + 6x - 7 = 0', {
        method: 'completing-the-square',
      })
      expect(hint).not.toBeNull()
      expect(hint?.operation).toContain('Add 7')
      expect(hint?.expectedNextForm).toBe('x^2 + 6x = 7')
      expect(hint?.socraticPrompt.toLowerCase()).toContain('constant')
    })

    it('coaches Step 2 (add (b/2)^2 to both sides) even in default auto mode when constant is isolated', () => {
      const hint = generateSocraticHint('x^2 + 6x = 7')
      expect(hint).not.toBeNull()
      expect(hint?.operation).toContain('9')
      expect(hint?.expectedNextForm).toBe('x^2 + 6x + 9 = 16')
    })

    it('coaches Step 3 (rewrite left side as squared binomial) when LHS is a perfect square trinomial equal to non-zero RHS', () => {
      const hint = generateSocraticHint('x^2 + 6x + 9 = 16')
      expect(hint).not.toBeNull()
      expect(hint?.operation.toLowerCase()).toContain('binomial')
      expect(hint?.expectedNextForm).toBe('(x + 3)^2 = 16')
    })

    it('coaches Step 4 (take square root of both sides) when equation is in squared binomial form (x + h)^2 = k', () => {
      const hint = generateSocraticHint('(x + 3)^2 = 16')
      expect(hint).not.toBeNull()
      expect(hint?.operation.toLowerCase()).toContain('square root')
      expect(hint?.expectedNextForm).toBe('x + 3 = ±4')
    })

    it('falls back to Completing the Square in default auto mode for irrational quadratics (x^2 + 4x + 1 = 0)', () => {
      const hint = generateSocraticHint('x^2 + 4x + 1 = 0')
      expect(hint).not.toBeNull()
      expect(hint?.expectedNextForm).toBe('x^2 + 4x = -1')
      expect(hint?.operation).toContain('Subtract 1')
    })

    it('catches the classic Completing the Square mistake of forgetting to add (b/2)^2 to the right-hand side', () => {
      const res = checkEquationEquivalence('x^2 + 6x = 7', '(x + 3)^2 = 7')
      expect(res.isValid).toBe(false)
      expect(res.reason).toBe('arithmetic_error')
      expect(res.hint).toContain('add 9 to the right side')
      expect(res.hint).toContain('16')
    })

    it('validates a full Completing the Square derivation chain', () => {
      const steps = [
        'x^2 + 6x - 7 = 0',
        'x^2 + 6x = 7',
        'x^2 + 6x + 9 = 16',
        '(x + 3)^2 = 16',
        'x = 1, -7',
      ]
      const report = verifyDerivation(steps)
      expect(report.allValid).toBe(true)
      expect(report.firstErrorIndex).toBeUndefined()
    })
  })
})
