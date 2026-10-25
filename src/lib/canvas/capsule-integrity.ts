import type { Stamp } from './store'

/**
 * A capsule may only stay open while every stroke and character it encloses still exists.
 * Called from the capsule's store subscription — the single choke point that
 * covers eraser, delete, undo, and clear paths alike.
 */
export function validateCapsuleIntegrity(
  capsule: { enclosedStrokeIds: string[]; enclosedCharIds?: string[] } | null,
  strokes: { id: string }[],
  stamps?: Stamp[],
): boolean {
  if (!capsule) return true
  const existingStrokes = new Set(strokes.map((s) => s.id))
  const strokesValid = capsule.enclosedStrokeIds.every((id) => existingStrokes.has(id))
  if (!strokesValid) return false

  if (capsule.enclosedCharIds && capsule.enclosedCharIds.length > 0) {
    if (!stamps) return false
    const existingChars = new Set(stamps.flatMap((s) => s.chars).map((c) => c.id))
    return capsule.enclosedCharIds.every((id) => existingChars.has(id))
  }

  return true
}
