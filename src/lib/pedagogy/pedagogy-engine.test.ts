import { describe, expect, it } from 'bun:test'
import { generatePedagogyLesson, generateSessionReview } from './pedagogy-engine'

describe('pedagogy-engine', () => {
  it('generates a clean 3-step lesson for completing-the-square', () => {
    const lesson = generatePedagogyLesson('completing-the-square', 'Completing the Square', [
      'Solve x^2 + 6x - 7 = 0 by completing the square.',
    ])
    expect(lesson.title).toBe('Completing the Square')
    expect(lesson.summary).toBeDefined()
    expect(lesson.steps.length).toBeGreaterThanOrEqual(3)
    expect(lesson.workedExample).toBeDefined()
    expect(lesson.workedExample.problem).toContain('x^2')
  })

  it('generates a clean lesson for factoring and quadratic formula', () => {
    const factoring = generatePedagogyLesson('factoring')
    expect(factoring.title).toContain('Factoring')
    expect(factoring.steps.length).toBeGreaterThanOrEqual(3)

    const quad = generatePedagogyLesson('quadratic-formula')
    expect(quad.title).toContain('Quadratic Formula')
    expect(quad.steps.length).toBeGreaterThanOrEqual(3)
  })

  it('generates an objective session review based on student hints and derivations', () => {
    const review = generateSessionReview({
      topic: 'Completing the Square',
      hintsUsed: ['Move constant term: Add 7 to both sides', 'Add (b/2)^2 = 9 to both sides'],
      stepErrors: ['sign_error'],
      totalStamps: 4,
    })

    expect(review.headline).toBeDefined()
    expect(review.metrics.hintsRequested).toBe(2)
    expect(review.metrics.correctionsFlagged).toBe(1)
    expect(review.observations.length).toBeGreaterThan(0)
    expect(review.observations[0].toLowerCase()).toContain('sign')
    expect(review.ruleOfThumb).toBeDefined()
  })
})
