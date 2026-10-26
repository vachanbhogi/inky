import { charBoundingBox, type StampChar } from '../canvas/store'
import type { Stroke } from '../canvas/types'
import {
  generateSocraticHint,
  type SocraticHint,
  type StepCheckResult,
  verifyDerivation,
} from './step-checker'

export interface MathLineGroup {
  strokeIds: string[]
  charIds: string[]
  minY: number
  maxY: number
  centerY: number
}

export interface MultiLineDiagnosticResult {
  isMultiLine: boolean
  allValid: boolean
  errorLineIndex?: number
  reason?: StepCheckResult['reason']
  diagnosticMessage?: string
  nextHint?: SocraticHint | null
}

interface VerticalItem {
  id: string
  kind: 'stroke' | 'char'
  minY: number
  maxY: number
  height: number
  centerY: number
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Groups enclosed strokes and stamp characters into horizontal lines of math,
 * ordered from top to bottom.
 */
export function groupIntoHorizontalLines(
  strokes: Stroke[],
  chars: StampChar[] = [],
): MathLineGroup[] {
  const items: VerticalItem[] = []

  for (const stroke of strokes) {
    const { minY, maxY } = stroke.boundingBox
    const height = Math.max(1, maxY - minY)
    items.push({
      id: stroke.id,
      kind: 'stroke',
      minY,
      maxY,
      height,
      centerY: (minY + maxY) / 2,
    })
  }

  for (const ch of chars) {
    const bbox = charBoundingBox(ch)
    const height = Math.max(1, bbox.maxY - bbox.minY)
    items.push({
      id: ch.id,
      kind: 'char',
      minY: bbox.minY,
      maxY: bbox.maxY,
      height,
      centerY: (bbox.minY + bbox.maxY) / 2,
    })
  }

  if (items.length === 0) return []

  const medianHeight = Math.max(12, computeMedian(items.map((item) => item.height)))

  // Sort top-to-bottom by vertical center
  items.sort((a, b) => a.centerY - b.centerY)

  const groups: MathLineGroup[] = []

  for (const item of items) {
    let targetGroup: MathLineGroup | undefined

    if (groups.length > 0) {
      const current = groups[groups.length - 1]
      const groupHeight = Math.max(1, current.maxY - current.minY)
      const smallerHeight = Math.min(groupHeight, item.height)
      const overlap = Math.max(
        0,
        Math.min(current.maxY, item.maxY) - Math.max(current.minY, item.minY),
      )
      const overlapRatio = overlap / smallerHeight
      const centerDist = Math.abs(item.centerY - current.centerY)

      if (overlapRatio >= 0.35 || centerDist <= 0.55 * medianHeight) {
        targetGroup = current
      }
    }

    if (targetGroup) {
      if (item.kind === 'stroke') {
        targetGroup.strokeIds.push(item.id)
      } else {
        targetGroup.charIds.push(item.id)
      }
      targetGroup.minY = Math.min(targetGroup.minY, item.minY)
      targetGroup.maxY = Math.max(targetGroup.maxY, item.maxY)
      targetGroup.centerY = (targetGroup.minY + targetGroup.maxY) / 2
    } else {
      groups.push({
        strokeIds: item.kind === 'stroke' ? [item.id] : [],
        charIds: item.kind === 'char' ? [item.id] : [],
        minY: item.minY,
        maxY: item.maxY,
        centerY: item.centerY,
      })
    }
  }

  // Merge adjacent groups that now overlap by >= 35% of the smaller group's height
  // (e.g. when a top-aligned bar or equals stroke preceded taller characters on the same line)
  let merged = true
  while (merged && groups.length > 1) {
    merged = false
    for (let i = 0; i < groups.length - 1; i++) {
      const g1 = groups[i]
      const g2 = groups[i + 1]
      const h1 = Math.max(1, g1.maxY - g1.minY)
      const h2 = Math.max(1, g2.maxY - g2.minY)
      const smallerH = Math.min(h1, h2)
      const overlap = Math.max(0, Math.min(g1.maxY, g2.maxY) - Math.max(g1.minY, g2.minY))
      const centerDist = Math.abs(g1.centerY - g2.centerY)
      const verticalGap = Math.max(0, Math.max(g1.minY, g2.minY) - Math.min(g1.maxY, g2.maxY))

      // Merge if overlapping, close vertically, or if one group is a short symbol fragment
      // (like an elevated minus sign, fraction bar, or superscript) near the adjacent line
      const isFragment = smallerH < 0.65 * medianHeight
      const shouldMerge =
        overlap / smallerH >= 0.25 ||
        centerDist <= 0.65 * medianHeight ||
        (isFragment && verticalGap <= 0.65 * medianHeight)

      if (shouldMerge) {
        g1.strokeIds.push(...g2.strokeIds)
        g1.charIds.push(...g2.charIds)
        g1.minY = Math.min(g1.minY, g2.minY)
        g1.maxY = Math.max(g1.maxY, g2.maxY)
        g1.centerY = (g1.minY + g1.maxY) / 2
        groups.splice(i + 1, 1)
        merged = true
        break
      }
    }
  }

  return groups.sort((a, b) => a.centerY - b.centerY)
}

/**
 * Evaluates an ordered list of recognized mathematical equation lines from top to bottom.
 */
export function checkMultiLineWork(linesLatex: string[]): MultiLineDiagnosticResult {
  const cleanLines = linesLatex.map((line) => line.trim()).filter((line) => line.length > 0)

  if (cleanLines.length <= 1) {
    const singleHint = cleanLines.length === 1 ? generateSocraticHint(cleanLines[0]) : null
    return {
      isMultiLine: false,
      allValid: true,
      nextHint: singleHint,
    }
  }

  const report = verifyDerivation(cleanLines)

  if (!report.allValid && report.firstErrorIndex !== undefined) {
    const errorLineIndex = report.firstErrorIndex
    const failedStep = report.stepResults[errorLineIndex - 1]
    const priorLine = cleanLines[errorLineIndex - 1]
    const nextHint = generateSocraticHint(priorLine)

    return {
      isMultiLine: true,
      allValid: false,
      errorLineIndex,
      reason: failedStep?.reason,
      diagnosticMessage: failedStep?.hint ?? 'Check this step against the previous line.',
      nextHint,
    }
  }

  const lastLine = cleanLines[cleanLines.length - 1]
  const nextHint = generateSocraticHint(lastLine)

  return {
    isMultiLine: true,
    allValid: true,
    nextHint,
  }
}
