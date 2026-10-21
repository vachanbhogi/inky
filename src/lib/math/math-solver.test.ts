import { describe, expect, test } from 'bun:test'
import { cleanEquationForMathjs, solveMath } from './math-solver'

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
