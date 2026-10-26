export type WorksheetMethod =
  | 'auto'
  | 'completing-the-square'
  | 'factoring'
  | 'quadratic-formula'
  | 'linear-balancing'
  | 'systems'

export interface PdfCurriculumContext {
  method: WorksheetMethod
  topicLabel: string
  instructionsSummary?: string
  detectedProblems: string[]
}

const METHOD_PATTERNS: Array<{
  method: WorksheetMethod
  topicLabel: string
  regex: RegExp
}> = [
  {
    method: 'completing-the-square',
    topicLabel: 'Completing the Square',
    regex: /complet(e|ing)\s+the\s+square|vertex\s+form/i,
  },
  {
    method: 'quadratic-formula',
    topicLabel: 'Quadratic Formula',
    regex: /quadratic\s+formula|discriminant/i,
  },
  {
    method: 'factoring',
    topicLabel: 'Factoring Quadratics',
    regex: /solve\s+by\s+factoring|factor\s+each|zero\s+product/i,
  },
  {
    method: 'systems',
    topicLabel: 'Systems of Equations',
    regex: /system\s+of\s+equations|substitution|elimination/i,
  },
  {
    method: 'linear-balancing',
    topicLabel: 'Linear Equations',
    regex: /solve\s+for\s+[a-z]|linear\s+equations|multi-step\s+equations/i,
  },
]

const INSTRUCTION_LINE_REGEX =
  /([^.!?\n]*\b(?:solve|factor|use\s+the\s+quadratic\s+formula|complete\s+the\s+square|find\s+the\s+roots|convert\s+to\s+vertex\s+form)[^.!?\n]*[.!?]?)/i

const EQUATION_REGEX =
  /\b(?:[0-9a-zA-Z()^²³+-]+(?:\s*[+-]\s*[0-9a-zA-Z()^²³]+)*\s*=\s*[0-9a-zA-Z()^²³+-]+(?:\s*[+-]\s*[0-9a-zA-Z()^²³]+)*)/g

export function extractEquationsFromText(text: string): string[] {
  if (!text) return []
  const cleanedText = text.replace(/\b\d+\s*[).]\s+/g, ' ')
  const matches = cleanedText.match(EQUATION_REGEX) ?? []
  const seen = new Set<string>()
  const problems: string[] = []

  for (const raw of matches) {
    const trimmed = raw.replace(/\s+/g, ' ').trim()
    if (!/[a-zA-Z]/.test(trimmed) && !/\d/.test(trimmed)) continue
    if (!seen.has(trimmed)) {
      seen.add(trimmed)
      problems.push(trimmed)
    }
  }

  return problems
}

export function extractInstructionsSummary(text: string): string | undefined {
  if (!text) return undefined
  const normalized = text.replace(/Name:\s*_+/gi, '\n').replace(/Date:\s*_+/gi, '\n')
  const match = normalized.match(INSTRUCTION_LINE_REGEX)
  if (!match?.[1]) return undefined
  const summary = match[1].replace(/\s+/g, ' ').trim()
  return summary.length > 0 ? summary : undefined
}

export function detectCurriculumFromText(text: string, title?: string): PdfCurriculumContext {
  const normalizedTitle = (title ?? '').replace(/[_-]+/g, ' ')
  const combined = `${normalizedTitle}\n${text ?? ''}`
  const detectedProblems = extractEquationsFromText(text ?? '')
  const instructionsSummary = extractInstructionsSummary(text ?? '')

  for (const candidate of METHOD_PATTERNS) {
    if (candidate.regex.test(combined)) {
      return {
        method: candidate.method,
        topicLabel: candidate.topicLabel,
        ...(instructionsSummary ? { instructionsSummary } : {}),
        detectedProblems,
      }
    }
  }

  return {
    method: 'auto',
    topicLabel: 'General Math',
    ...(instructionsSummary ? { instructionsSummary } : {}),
    detectedProblems,
  }
}

export function extractCurriculumFromPages(
  pages: { textContent?: string }[],
  title?: string,
): PdfCurriculumContext {
  const combinedText = (pages ?? [])
    .map((p) => p.textContent ?? '')
    .filter((t) => t.trim().length > 0)
    .join('\n')
  return detectCurriculumFromText(combinedText, title)
}
