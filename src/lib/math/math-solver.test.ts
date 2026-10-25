import { describe, expect, test } from 'bun:test'
import { cleanEquationForMathjs, getAvailableActions, solveMath } from './math-solver'

describe('math-solver', () => {
  test('cleanEquationForMathjs converts latex syntax cleanly', () => {
    expect(cleanEquationForMathjs('2x + 1')).toBe('2*x+1')
    expect(cleanEquationForMathjs('\\frac{10}{2}')).toBe('(10)/(2)')
    expect(cleanEquationForMathjs('3 \\times 4')).toBe('3*4')
  })

  test('solves linear equation: 2x + 1 = 7', () => {
    const res = solveMath('2x + 1 = 7', 'solve')
    expect(res.resultLatex).toBe('x = 3')
  })

  test('solves quadratic equation: x^2 - 4x + 4 = 0', () => {
    const resSolve = solveMath('x^2 - 4x + 4 = 0', 'solve')
    expect(resSolve.resultLatex).toBe('x = 2')

    const resFactor = solveMath('x^2 - 4x + 4 = 0', 'factor')
    expect(resFactor.resultLatex).toBe('(x - 2)^2 = 0')
  })

  test('evaluates arithmetic expression: 15 * 4 + 2', () => {
    const res = solveMath('15 * 4 + 2', 'simplify')
    expect(res.resultLatex).toBe('= 62')
  })
})

describe('getAvailableActions', () => {
  test('equation without ^2 offers solve only', () => {
    expect(getAvailableActions('2x+1=7')).toEqual(['solve'])
  })

  test('quadratic equation offers solve and factor', () => {
    expect(getAvailableActions('x^2-5x+6=0')).toEqual(['solve', 'factor'])
  })

  test('plain expression offers simplify only', () => {
    expect(getAvailableActions('3(2+4)')).toEqual(['simplify'])
  })

  test('quadratic expression (no =) offers factor — it genuinely factors (user pass)', () => {
    expect(getAvailableActions('x^2+2x+1')).toEqual(['factor'])
  })

  test('empty latex offers nothing', () => {
    expect(getAvailableActions('')).toEqual([])
  })

  test('ignores $ delimiters when classifying', () => {
    expect(getAvailableActions('$2x+1=7$')).toEqual(['solve'])
  })
})

describe('action applicability (final review I2)', () => {
  test('does not offer actions that would stamp the input back unchanged', () => {
    expect(getAvailableActions('y+1')).toEqual([])
  })

  test('keeps actions that genuinely transform the input', () => {
    expect(getAvailableActions('x^2-5x+6=0')).toEqual(['solve', 'factor'])
    expect(getAvailableActions('3(2+4)')).toEqual(['simplify'])
  })
})

describe('emitted latex shapes (brace superscripts — dead-Solve regression)', () => {
  test('brace forms offer the same actions as ASCII', () => {
    expect(getAvailableActions('x^{2}-1=0')).toEqual(['solve', 'factor'])
    expect(getAvailableActions('x^{ 2 }-1=0')).toEqual(['solve', 'factor'])
    expect(getAvailableActions('x^{2}-5x+6=0')).toEqual(['solve', 'factor'])
  })

  test('brace quadratic expression offers factor — not the bogus simplify', () => {
    expect(getAvailableActions('x^{2}+2x+1')).toEqual(['factor'])
  })

  test('solveMath stamps real answers for brace inputs', () => {
    expect(solveMath('x^{ 2 }-1=0', 'solve').plainText).toBe('x = 1, -1')
    expect(solveMath('x^{2}-5x+6=0', 'solve').plainText).toBe('x = 3, 2')
    expect(solveMath('x^{2}+2x+1', 'factor').plainText).toBe('(x + 1)^2')
  })

  test('equations with an empty or garbage side offer nothing (no NaN stamps)', () => {
    // A recognizer slip like `x^2-1=` (missing RHS) made c/disc NaN; the
    // solve branch fell through to 'No real roots' — which *transformed* the
    // input, so the capsule offered a Solve that stamped nonsense.
    expect(getAvailableActions('x^{ 2 }-1=')).toEqual([])
    expect(getAvailableActions('x^2-1=')).toEqual([])
    expect(getAvailableActions('x^2-1=abc')).toEqual([])
    expect(getAvailableActions('2x+1=')).toEqual([])
  })
})

describe('real transformations for factor/simplify (user pass)', () => {
  test('simplify collapses symbolic sums', () => {
    expect(solveMath('x+x', 'simplify').plainText).toBe('2x')
  })

  test('factor factors quadratic expressions without an equals', () => {
    expect(solveMath('x^2+2x+1', 'factor').plainText).toBe('(x + 1)^2')
    expect(solveMath('x^2-5x+6', 'factor').plainText).toBe('(x - 2)(x - 3)')
  })

  test('unfactorable quadratics stay off the action list', () => {
    expect(getAvailableActions('x^2+1')).toEqual([])
    expect(getAvailableActions('x+x')).toEqual(['simplify'])
  })
})

describe('real homework solver coverage', () => {
  test('solves equations with variables on both sides', () => {
    expect(getAvailableActions('3x + 2 = x + 10')).toEqual(['solve'])
    const res = solveMath('3x + 2 = x + 10', 'solve')
    expect(res.resultLatex).toBe('x = 4')
    expect(res.plainText).toBe('x = 4')
  })

  test('solves equations with parentheses and distributive property', () => {
    expect(getAvailableActions('2(x + 3) = 14')).toEqual(['solve'])
    const res = solveMath('2(x + 3) = 14', 'solve')
    expect(res.resultLatex).toBe('x = 4')
    expect(res.plainText).toBe('x = 4')
  })

  test('solves equations with negative coefficients and subtraction', () => {
    expect(getAvailableActions('5 - 2x = 1')).toEqual(['solve'])
    const res1 = solveMath('5 - 2x = 1', 'solve')
    expect(res1.resultLatex).toBe('x = 2')
    expect(res1.plainText).toBe('x = 2')

    expect(getAvailableActions('-x + 4 = 1')).toEqual(['solve'])
    const res2 = solveMath('-x + 4 = 1', 'solve')
    expect(res2.resultLatex).toBe('x = 3')
    expect(res2.plainText).toBe('x = 3')
  })

  test('solves equations with fractions (LaTeX and slash form)', () => {
    expect(getAvailableActions('\\frac{x}{2} + 3 = 7')).toEqual(['solve'])
    const resFrac = solveMath('\\frac{x}{2} + 3 = 7', 'solve')
    expect(resFrac.resultLatex).toBe('x = 8')
    expect(resFrac.plainText).toBe('x = 8')

    expect(getAvailableActions('x/2 + 3 = 7')).toEqual(['solve'])
    const resSlash = solveMath('x/2 + 3 = 7', 'solve')
    expect(resSlash.resultLatex).toBe('x = 8')
    expect(resSlash.plainText).toBe('x = 8')
  })

  test('solves linear systems of 2 equations', () => {
    // Comma-separated format
    expect(getAvailableActions('x + y = 5, x - y = 1')).toEqual(['solve'])
    const resComma = solveMath('x + y = 5, x - y = 1', 'solve')
    expect(resComma.resultLatex).toBe('x = 3, y = 2')
    expect(resComma.plainText).toBe('x = 3, y = 2')

    // Newline-separated format
    const resNewline = solveMath('x + y = 5\nx - y = 1', 'solve')
    expect(resNewline.resultLatex).toBe('x = 3, y = 2')
    expect(resNewline.plainText).toBe('x = 3, y = 2')

    // LaTeX cases environment format
    const resCases = solveMath('\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}', 'solve')
    expect(resCases.resultLatex).toBe('x = 3, y = 2')
    expect(resCases.plainText).toBe('x = 3, y = 2')
  })
})
