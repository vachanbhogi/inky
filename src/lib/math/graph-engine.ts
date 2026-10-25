import { derivative, type MathNode, parse, simplify } from 'mathjs'

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface PlotOptions {
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
  samples?: number
  width?: number
  height?: number
}

export interface FunctionPlot {
  expression: string
  variable: string
  bounds: Bounds
  segments: Point[][]
  pathData: string
  xIntercepts: Point[]
  yIntercept: Point | null
  vertex: Point | null
}

const KNOWN_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'sec',
  'csc',
  'cot',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'sqrt',
  'cbrt',
  'abs',
  'log',
  'ln',
  'log10',
  'log2',
  'exp',
  'floor',
  'ceil',
  'round',
  'sign',
])

const KNOWN_CONSTANTS = new Set(['pi', 'e', 'tau', 'i', 'PI', 'E'])
const VALID_VARIABLES = new Set(['x', 't', 'u', 'v', 'r', 'theta'])

function sanitizeLatexAndImplicitMath(expr: string): string {
  return expr
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿˣ]+/g, (match) => {
      const mapped = Array.from(match)
        .map((ch) => {
          switch (ch) {
            case '⁰':
              return '0'
            case '¹':
              return '1'
            case '²':
              return '2'
            case '³':
              return '3'
            case '⁴':
              return '4'
            case '⁵':
              return '5'
            case '⁶':
              return '6'
            case '⁷':
              return '7'
            case '⁸':
              return '8'
            case '⁹':
              return '9'
            case '⁺':
              return '+'
            case '⁻':
              return '-'
            case 'ⁿ':
              return 'n'
            case 'ˣ':
              return 'x'
            default:
              return ch
          }
        })
        .join('')
      return `^(${mapped})`
    })
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/√\s*([0-9a-zA-Z]+|\([^)]+\))/g, 'sqrt($1)')
    .replace(/√/g, 'sqrt')
    .replace(/\\times/g, '*')
    .replace(/\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '(($1)/($2))')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\left|\\right/g, '')
    .replace(/\^\s*\{([^{}]+)\}/g, '^($1)')
    .replace(/\\(sin|cos|tan|sec|csc|cot|asin|acos|atan|sinh|cosh|tanh|exp|abs|pi)/g, '$1')
    .replace(/\\ln/g, 'log')
    .replace(/\\log/g, 'log10')
    .replace(/\{([^{}]+)\}/g, '($1)')
    .replace(/([0-9])([a-zA-Z])/g, '$1*$2')
    .replace(/([0-9])\(/g, '$1*(')
    .replace(/\)([0-9a-zA-Z])/g, ')*$1')
    .replace(/\)\s*\(/g, ')*(')
    .trim()
}

interface ParsedExpression {
  clean: string
  variable: string
  node: MathNode
}

function parseGraphableInput(input: string): ParsedExpression | null {
  let raw = input.trim()
  if (raw.startsWith('$') && raw.endsWith('$')) {
    raw = raw.slice(1, -1).trim()
  }
  if (!raw) return null

  let specifiedVar: string | null = null
  let dependentVar: string | null = null
  let exprStr = raw

  if (raw.includes('=')) {
    const parts = raw.split('=')
    if (parts.length !== 2) return null
    const left = parts[0].trim()
    const right = parts[1].trim()
    if (!left || !right) return null

    const fnMatch = left.match(/^([a-zA-Z])\s*\(\s*([a-zA-Z])\s*\)$/)
    if (fnMatch) {
      specifiedVar = fnMatch[2]
      exprStr = right
    } else if (/^y$/i.test(left)) {
      dependentVar = 'y'
      exprStr = right
    } else if (/^y$/i.test(right)) {
      dependentVar = 'y'
      exprStr = left
    } else {
      return null
    }
  }

  const clean = sanitizeLatexAndImplicitMath(exprStr)
  if (!clean) return null

  let node: MathNode
  try {
    node = parse(clean)
  } catch {
    return null
  }

  const foundVars = new Set<string>()
  let hasInvalidSymbol = false

  node.traverse((n, path, parent) => {
    if (n.type === 'SymbolNode') {
      const name = (n as unknown as { name?: string }).name ?? ''
      if (parent?.type === 'FunctionNode' && path === 'fn') {
        if (!KNOWN_FUNCTIONS.has(name)) {
          hasInvalidSymbol = true
        }
        return
      }
      if (KNOWN_CONSTANTS.has(name)) return
      if (dependentVar && name.toLowerCase() === dependentVar.toLowerCase()) {
        hasInvalidSymbol = true
        return
      }
      if (VALID_VARIABLES.has(name)) {
        foundVars.add(name)
      } else {
        hasInvalidSymbol = true
      }
    }
  })

  if (hasInvalidSymbol) return null
  if (foundVars.size > 1) return null

  let variable = specifiedVar ?? 'x'
  if (foundVars.size === 1) {
    const found = Array.from(foundVars)[0]
    if (specifiedVar && specifiedVar !== found) return null
    variable = found
  }

  return { clean, variable, node }
}

export function isGraphableExpression(input: string): boolean {
  return parseGraphableInput(input) !== null
}

function getQuadraticVertex(
  node: MathNode,
  v: string,
  evaluateAt: (x: number) => number | null,
): Point | null {
  try {
    const d1 = derivative(node, v)
    const d2 = derivative(d1, v)
    const d2Simp = simplify(d2)

    let hasVar = false
    d2Simp.traverse((n) => {
      if (n.type === 'SymbolNode' && (n as unknown as { name?: string }).name === v) {
        hasVar = true
      }
    })
    if (hasVar) return null

    const d2Val = Number(d2Simp.toString())
    if (!Number.isFinite(d2Val) || Math.abs(d2Val) < 1e-9) return null

    const d1Compiled = d1.compile()
    const bVal = d1Compiled.evaluate({ [v]: 0 })
    if (typeof bVal !== 'number' || !Number.isFinite(bVal)) return null

    const xVert = -bVal / d2Val
    const normX = Math.abs(xVert) < 1e-9 ? 0 : Number(xVert.toFixed(6))
    const yVert = evaluateAt(normX)
    if (yVert === null) return null
    const normY = Math.abs(yVert) < 1e-9 ? 0 : Number(yVert.toFixed(6))
    return { x: normX, y: normY }
  } catch {
    return null
  }
}

function findRoots(
  f: (x: number) => number | null,
  xMin: number,
  xMax: number,
  vertex: Point | null,
  steps = 800,
): Point[] {
  const roots: number[] = []

  const addRoot = (r: number) => {
    const rounded = Number(r.toFixed(5))
    if (!roots.some((existing) => Math.abs(existing - rounded) < 1e-4)) {
      roots.push(rounded)
    }
  }

  if (vertex && Math.abs(vertex.y) < 1e-6 && vertex.x >= xMin && vertex.x <= xMax) {
    addRoot(vertex.x)
  }

  const dx = (xMax - xMin) / steps
  let prevX = xMin
  let prevY = f(prevX)
  if (prevY !== null && Math.abs(prevY) < 1e-6) addRoot(prevX)

  for (let i = 1; i <= steps; i++) {
    const currX = xMin + i * dx
    const currY = f(currX)
    if (currY === null) {
      prevX = currX
      prevY = currY
      continue
    }

    if (Math.abs(currY) < 1e-6) {
      addRoot(currX)
    } else if (prevY !== null && prevY * currY < 0) {
      // Bisection
      let a = prevX
      let b = currX
      let fa = prevY
      let foundRoot: number | null = null

      for (let it = 0; it < 50; it++) {
        const mid = (a + b) / 2
        const fmid = f(mid)
        if (fmid === null) break
        if (Math.abs(fmid) < 1e-9) {
          foundRoot = mid
          break
        }
        if (fa * fmid < 0) {
          b = mid
        } else {
          a = mid
          fa = fmid
        }
      }

      if (foundRoot === null) {
        const mid = (a + b) / 2
        const fmid = f(mid)
        if (fmid !== null && Math.abs(fmid) < 1e-4) {
          foundRoot = mid
        }
      }

      if (foundRoot !== null) {
        addRoot(foundRoot)
      }
    }

    prevX = currX
    prevY = currY
  }

  roots.sort((a, b) => a - b)
  return roots.map((rx) => ({ x: rx === 0 ? 0 : rx, y: 0 }))
}

function toCanvasPoint(
  x: number,
  y: number,
  bounds: Bounds,
  width: number,
  height: number,
): [number, number] {
  const xSpan = bounds.xMax - bounds.xMin
  const ySpan = bounds.yMax - bounds.yMin
  const cx = xSpan === 0 ? width / 2 : ((x - bounds.xMin) / xSpan) * width
  const cy = ySpan === 0 ? height / 2 : ((bounds.yMax - y) / ySpan) * height
  const round2 = (n: number) => {
    const r = Math.round(n * 100) / 100
    return r === 0 ? 0 : r
  }
  return [round2(cx), round2(cy)]
}

export function plotFunction(input: string, options?: PlotOptions): FunctionPlot | null {
  const parsed = parseGraphableInput(input)
  if (!parsed) return null

  const { clean, variable, node } = parsed

  const xMin = options?.xMin ?? -10
  const xMax = options?.xMax ?? 10
  if (xMin >= xMax) return null

  const samples = options?.samples && options.samples > 0 ? options.samples : 200
  const width = options?.width && options.width > 0 ? options.width : 400
  const height = options?.height && options.height > 0 ? options.height : 400

  let compiled: { evaluate: (scope?: Record<string, unknown>) => unknown }
  try {
    compiled = node.compile()
  } catch {
    return null
  }

  const evaluateAt = (x: number): number | null => {
    try {
      const val = compiled.evaluate({ [variable]: x })
      if (typeof val === 'number' && Number.isFinite(val)) {
        return val
      }
      return null
    } catch {
      return null
    }
  }

  const segments: Point[][] = []
  let currentSegment: Point[] = []
  const dx = (xMax - xMin) / samples

  for (let i = 0; i <= samples; i++) {
    const x = xMin + i * dx
    const y = evaluateAt(x)

    // Check extreme magnitude or undefined (asymptotes)
    if (y === null || Math.abs(y) > 1000) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment)
        currentSegment = []
      }
      continue
    }

    if (currentSegment.length > 0) {
      const prev = currentSegment[currentSegment.length - 1]
      const xMid = (prev.x + x) / 2
      const yMid = evaluateAt(xMid)

      // Asymptote / jump discontinuity check
      const isDiscontinuous =
        yMid === null ||
        Math.abs(yMid) > 1000 ||
        (prev.y * y < 0 && Math.abs(y - prev.y) > 20 && Math.abs(yMid - (prev.y + y) / 2) > 10)

      if (isDiscontinuous) {
        segments.push(currentSegment)
        currentSegment = []
      }
    }

    currentSegment.push({ x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) })
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment)
  }

  if (segments.length === 0 || segments.every((s) => s.length === 0)) {
    return null
  }

  // Compute bounding box
  const allY: number[] = []
  for (const seg of segments) {
    for (const p of seg) {
      allY.push(p.y)
    }
  }

  let yMin = options?.yMin ?? Math.min(...allY)
  let yMax = options?.yMax ?? Math.max(...allY)

  if (yMin === yMax) {
    yMin -= 1
    yMax += 1
  }

  const bounds: Bounds = {
    xMin,
    xMax,
    yMin,
    yMax,
  }

  // Detect y-intercept (x = 0)
  let yIntercept: Point | null = null
  if (xMin <= 0 && xMax >= 0) {
    const valAt0 = evaluateAt(0)
    if (valAt0 !== null) {
      yIntercept = { x: 0, y: Number(valAt0.toFixed(6)) }
    }
  }

  // Detect vertex for quadratic functions
  const vertex = getQuadraticVertex(node, variable, evaluateAt)

  // Detect real x-intercepts
  const xIntercepts = findRoots(evaluateAt, xMin, xMax, vertex)

  // Generate SVG pathData
  const pathCommands: string[] = []
  for (const seg of segments) {
    if (seg.length === 0) continue
    const [startX, startY] = toCanvasPoint(seg[0].x, seg[0].y, bounds, width, height)
    const segCommands = [`M ${startX} ${startY}`]
    for (let i = 1; i < seg.length; i++) {
      const [cx, cy] = toCanvasPoint(seg[i].x, seg[i].y, bounds, width, height)
      segCommands.push(`L ${cx} ${cy}`)
    }
    pathCommands.push(segCommands.join(' '))
  }
  const pathData = pathCommands.join(' ')

  return {
    expression: clean,
    variable,
    bounds,
    segments,
    pathData,
    xIntercepts,
    yIntercept,
    vertex,
  }
}
