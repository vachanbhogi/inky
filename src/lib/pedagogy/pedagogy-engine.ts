import type { WorksheetMethod } from '../pdf/pdfCurriculum'

export interface PedagogyStep {
  number: number
  title: string
  detail: string
  latex?: string
}

export interface WorkedExample {
  problem: string
  solutionSteps: Array<{ description: string; latex: string }>
}

export interface PedagogyLesson {
  method: WorksheetMethod
  title: string
  summary: string
  steps: PedagogyStep[]
  workedExample: WorkedExample
}

export interface SessionReviewInput {
  topic?: string
  hintsUsed: string[]
  stepErrors: Array<'sign_error' | 'arithmetic_error' | 'division_error' | 'factor_error' | 'syntax_error' | 'unknown'>
  totalStamps: number
}

export interface SessionReview {
  headline: string
  metrics: {
    hintsRequested: number
    correctionsFlagged: number
    stampedSteps: number
  }
  observations: string[]
  ruleOfThumb: string
}

const LESSON_DATABASE: Record<WorksheetMethod, Omit<PedagogyLesson, 'method'>> = {
  'completing-the-square': {
    title: 'Completing the Square',
    summary: 'Transform a standard quadratic into a perfect square binomial to solve directly with square roots.',
    steps: [
      {
        number: 1,
        title: 'Isolate variable terms',
        detail: 'Move the constant term c to the right side of the equation.',
        latex: 'ax^2 + bx = -c',
      },
      {
        number: 2,
        title: 'Add square of half the linear coefficient',
        detail: 'Compute (b / 2)^2 and add this exact quantity to both sides to preserve balance.',
        latex: 'x^2 + bx + \\left(\\frac{b}{2}\\right)^2 = -c + \\left(\\frac{b}{2}\\right)^2',
      },
      {
        number: 3,
        title: 'Factor as a perfect square and solve',
        detail: 'Condense the left side into (x + b/2)^2 and take the square root of both sides.',
        latex: '\\left(x + \\frac{b}{2}\\right)^2 = d \\implies x + \\frac{b}{2} = \\pm\\sqrt{d}',
      },
    ],
    workedExample: {
      problem: 'x^2 + 6x - 7 = 0',
      solutionSteps: [
        { description: 'Add 7 to both sides', latex: 'x^2 + 6x = 7' },
        { description: 'Add (6 / 2)^2 = 9 to both sides', latex: 'x^2 + 6x + 9 = 16' },
        { description: 'Factor left side into a binomial square', latex: '(x + 3)^2 = 16' },
        { description: 'Take square root of both sides', latex: 'x + 3 = \\pm 4' },
        { description: 'Final roots', latex: 'x = 1 \\quad \\text{or} \\quad x = -7' },
      ],
    },
  },
  factoring: {
    title: 'Factoring Quadratics',
    summary: 'Rewrite quadratic trinomials as the product of two linear binomial factors to apply the zero product property.',
    steps: [
      {
        number: 1,
        title: 'Set equal to zero',
        detail: 'Transpose all terms to one side so the quadratic standard form is established.',
        latex: 'ax^2 + bx + c = 0',
      },
      {
        number: 2,
        title: 'Find factor pairs',
        detail: 'Identify two numbers that multiply to ac and add to the linear coefficient b.',
        latex: 'p \\cdot q = a \\cdot c, \\quad p + q = b',
      },
      {
        number: 3,
        title: 'Apply the Zero Product Property',
        detail: 'Set each binomial factor individually to zero and solve for the roots.',
        latex: '(x - p)(x - q) = 0 \\implies x = p \\quad \\text{or} \\quad x = q',
      },
    ],
    workedExample: {
      problem: 'x^2 - 5x + 6 = 0',
      solutionSteps: [
        { description: 'Find factors of 6 adding to -5', latex: '(-2) \\times (-3) = 6, \\; (-2) + (-3) = -5' },
        { description: 'Factor into binomials', latex: '(x - 2)(x - 3) = 0' },
        { description: 'Solve each factor', latex: 'x = 2, \\; x = 3' },
      ],
    },
  },
  'quadratic-formula': {
    title: 'Quadratic Formula',
    summary: 'Universal algebraic method to solve any degree-two polynomial using coefficients a, b, and c.',
    steps: [
      {
        number: 1,
        title: 'Standardize coefficients',
        detail: 'Arrange equation as ax^2 + bx + c = 0 and accurately extract signs for a, b, and c.',
        latex: 'ax^2 + bx + c = 0',
      },
      {
        number: 2,
        title: 'Calculate the discriminant',
        detail: 'Evaluate b^2 - 4ac to determine real root multiplicity before taking square roots.',
        latex: '\\Delta = b^2 - 4ac',
      },
      {
        number: 3,
        title: 'Evaluate formula',
        detail: 'Substitute into the quadratic formula and simplify the numerator radicals.',
        latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
      },
    ],
    workedExample: {
      problem: '2x^2 - 4x - 6 = 0',
      solutionSteps: [
        { description: 'Identify coefficients', latex: 'a = 2, \\; b = -4, \\; c = -6' },
        { description: 'Evaluate discriminant', latex: '(-4)^2 - 4(2)(-6) = 16 + 48 = 64' },
        { description: 'Apply formula', latex: 'x = \\frac{4 \\pm \\sqrt{64}}{4} = \\frac{4 \\pm 8}{4}' },
        { description: 'Final roots', latex: 'x = 3, \\; x = -1' },
      ],
    },
  },
  'linear-balancing': {
    title: 'Linear Balancing',
    summary: 'Maintain balance by applying inverse algebraic operations symmetrically across the equals sign.',
    steps: [
      {
        number: 1,
        title: 'Group like terms',
        detail: 'Collect all variable terms on one side and numerical constants on the other.',
        latex: 'ax + b = c \\implies ax = c - b',
      },
      {
        number: 2,
        title: 'Isolate the coefficient',
        detail: 'Divide or multiply both sides by the reciprocal of the leading variable coefficient.',
        latex: 'x = \\frac{c - b}{a}',
      },
      {
        number: 3,
        title: 'Verify substitution',
        detail: 'Substitute solution back into the original handwritten equation to confirm truth.',
        latex: 'a(x_{\\text{sol}}) + b = c',
      },
    ],
    workedExample: {
      problem: '3x + 7 = 22',
      solutionSteps: [
        { description: 'Subtract 7 from both sides', latex: '3x = 15' },
        { description: 'Divide both sides by 3', latex: 'x = 5' },
      ],
    },
  },
  systems: {
    title: 'Systems of Equations',
    summary: 'Solve simultaneous linear equations using systematic substitution or linear combination elimination.',
    steps: [
      {
        number: 1,
        title: 'Align or isolate',
        detail: 'Isolate one variable or scale rows so matching coefficients can cancel.',
        latex: 'a_1 x + b_1 y = c_1, \\quad a_2 x + b_2 y = c_2',
      },
      {
        number: 2,
        title: 'Eliminate one variable',
        detail: 'Add or subtract equations to produce a single-variable linear equation.',
        latex: '(a_1 - a_2)x = c_1 - c_2',
      },
      {
        number: 3,
        title: 'Back-substitute',
        detail: 'Substitute found coordinate into either original equation to obtain second coordinate.',
        latex: '(x^*, y^*)',
      },
    ],
    workedExample: {
      problem: 'x + y = 6, \\quad x - y = 2',
      solutionSteps: [
        { description: 'Add both equations to eliminate y', latex: '2x = 8 \\implies x = 4' },
        { description: 'Substitute x = 4 into first equation', latex: '4 + y = 6 \\implies y = 2' },
      ],
    },
  },
  auto: {
    title: 'General Mathematics',
    summary: 'Core algebraic problem-solving techniques for equations and expressions.',
    steps: [
      {
        number: 1,
        title: 'Inspect equation structure',
        detail: 'Identify degree, variable locations, and applicable factoring or balancing rules.',
        latex: 'f(x) = 0',
      },
      {
        number: 2,
        title: 'Step-by-step simplification',
        detail: 'Perform one algebraic operation per line, keeping equalities aligned.',
        latex: 'f_1(x) = f_2(x)',
      },
      {
        number: 3,
        title: 'Verify boundary solutions',
        detail: 'Check for extraneous roots when multiplying or squaring expressions.',
        latex: 'x \\in \\mathbb{R}',
      },
    ],
    workedExample: {
      problem: '2(x - 3) = 10',
      solutionSteps: [
        { description: 'Distribute or divide by 2', latex: 'x - 3 = 5' },
        { description: 'Add 3 to both sides', latex: 'x = 8' },
      ],
    },
  },
}

export function generatePedagogyLesson(
  method: WorksheetMethod = 'auto',
  overrideTitle?: string,
  _detectedProblems?: string[],
): PedagogyLesson {
  const base = LESSON_DATABASE[method] ?? LESSON_DATABASE.auto
  return {
    method,
    title: overrideTitle || base.title,
    summary: base.summary,
    steps: base.steps,
    workedExample: base.workedExample,
  }
}

export function generateSessionReview(input: SessionReviewInput): SessionReview {
  const topic = input.topic || 'Algebra Practice'
  const hintsCount = input.hintsUsed.length
  const errorsCount = input.stepErrors.length
  const stampsCount = input.totalStamps

  const observations: string[] = []

  if (input.stepErrors.includes('sign_error')) {
    observations.push('Sign error: Remember to invert the sign when moving a constant term across the equals sign (e.g., -7 becomes +7).')
  }
  if (input.stepErrors.includes('arithmetic_error')) {
    observations.push('Balance check: Remember to add (b/2)² to both sides of the equation to preserve equality.')
  }
  if (input.stepErrors.includes('division_error')) {
    observations.push('Coefficient division: Ensure all terms are divided equally when reducing the leading coefficient.')
  }
  if (input.stepErrors.includes('factor_error')) {
    observations.push('Factor verification: Ensure the product of the constant terms equals c and their sum equals b.')
  }
  if (input.stepErrors.includes('syntax_error')) {
    observations.push('Syntax alert: An incomplete equation or stray stroke interrupted derivation parsing.')
  }

  if (observations.length === 0) {
    if (hintsCount > 0) {
      observations.push('Derivation progression: Steps followed the standard balancing sequence cleanly.')
    } else {
      observations.push('Independent execution: Derivations completed without intermediate error flags.')
    }
  }

  let ruleOfThumb = 'Always perform identical operations to both sides of the equality to preserve balance.'
  if (topic.toLowerCase().includes('square')) {
    ruleOfThumb = 'When completing the square, remember to add (b / 2)^2 to BOTH sides of the equation.'
  } else if (topic.toLowerCase().includes('factor')) {
    ruleOfThumb = 'For trinomials ax^2 + bx + c, the product of factors must equal a·c and sum to b.'
  } else if (topic.toLowerCase().includes('formula')) {
    ruleOfThumb = 'Compute the discriminant b^2 - 4ac first to verify real roots before evaluating the fraction.'
  }

  return {
    headline: `${topic} Review`,
    metrics: {
      hintsRequested: hintsCount,
      correctionsFlagged: errorsCount,
      stampedSteps: stampsCount,
    },
    observations,
    ruleOfThumb,
  }
}
