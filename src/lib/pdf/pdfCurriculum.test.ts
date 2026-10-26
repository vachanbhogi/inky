import { describe, expect, test } from 'bun:test'
import { detectCurriculumFromText } from './pdfCurriculum'
import { extractCurriculumFromPages } from './pdfImporter'

describe('pdfCurriculum - detectCurriculumFromText', () => {
  test('detects completing-the-square from worksheet text and extracts instructions & equations', () => {
    const text = `
      Algebra II - Period 3
      Name: _______________ Date: ________
      Solve each equation by completing the square.
      1) x^2 + 6x - 7 = 0
      2) x^2 - 10x + 21 = 0
    `
    const result = detectCurriculumFromText(text, 'Worksheet 4.pdf')
    expect(result.method).toBe('completing-the-square')
    expect(result.topicLabel).toBe('Completing the Square')
    expect(result.instructionsSummary).toContain('Solve each equation by completing the square')
    expect(result.detectedProblems).toContain('x^2 + 6x - 7 = 0')
    expect(result.detectedProblems).toContain('x^2 - 10x + 21 = 0')
  })

  test('detects completing-the-square via vertex form keyword in title', () => {
    const result = detectCurriculumFromText('1) y = x^2 + 4x + 1', 'Converting_to_Vertex_Form.pdf')
    expect(result.method).toBe('completing-the-square')
    expect(result.topicLabel).toBe('Completing the Square')
    expect(result.detectedProblems).toContain('y = x^2 + 4x + 1')
  })

  test('detects quadratic-formula from text or discriminant keyword', () => {
    const text = 'Use the quadratic formula to find the roots. 1) 2x^2 + 5x - 3 = 0'
    const result = detectCurriculumFromText(text)
    expect(result.method).toBe('quadratic-formula')
    expect(result.topicLabel).toBe('Quadratic Formula')
    expect(result.instructionsSummary).toContain('Use the quadratic formula to find the roots')
    expect(result.detectedProblems).toContain('2x^2 + 5x - 3 = 0')
  })

  test('detects factoring from text', () => {
    const text = 'Solve by factoring each quadratic equation. 1) x^2 + 5x + 6 = 0'
    const result = detectCurriculumFromText(text)
    expect(result.method).toBe('factoring')
    expect(result.topicLabel).toBe('Factoring Quadratics')
    expect(result.instructionsSummary).toContain('Solve by factoring')
    expect(result.detectedProblems).toContain('x^2 + 5x + 6 = 0')
  })

  test('detects systems of equations from text', () => {
    const text = 'Solve each system of equations by substitution. 1) 2x + y = 5'
    const result = detectCurriculumFromText(text)
    expect(result.method).toBe('systems')
    expect(result.topicLabel).toBe('Systems of Equations')
    expect(result.instructionsSummary).toContain('Solve each system of equations by substitution')
    expect(result.detectedProblems).toContain('2x + y = 5')
  })

  test('detects linear-balancing from text', () => {
    const text = 'Multi-Step Equations: Solve for x in each equation below. 1) 3x + 4 = 19'
    const result = detectCurriculumFromText(text)
    expect(result.method).toBe('linear-balancing')
    expect(result.topicLabel).toBe('Linear Equations')
    expect(result.instructionsSummary).toContain('Solve for x')
    expect(result.detectedProblems).toContain('3x + 4 = 19')
  })

  test('falls back to auto and General Math when no specific curriculum matches', () => {
    const text = 'Warm up problems:\n1) 4x - 8 = 12'
    const result = detectCurriculumFromText(text, 'Warmup.pdf')
    expect(result.method).toBe('auto')
    expect(result.topicLabel).toBe('General Math')
    expect(result.detectedProblems).toContain('4x - 8 = 12')
  })

  test('extractCurriculumFromPages aggregates textContent across multiple pages', () => {
    const pages = [
      { textContent: 'Algebra 1 Homework\nSolve each equation by completing the square.' },
      { textContent: '1) x^2 + 8x - 9 = 0\n2) x^2 - 4x - 5 = 0' },
    ]
    const result = extractCurriculumFromPages(pages, 'hw.pdf')
    expect(result.method).toBe('completing-the-square')
    expect(result.topicLabel).toBe('Completing the Square')
    expect(result.detectedProblems).toEqual(['x^2 + 8x - 9 = 0', 'x^2 - 4x - 5 = 0'])
  })
})
