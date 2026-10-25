/**
 * A capsule may only stay open while every stroke it encloses still exists.
 * Called from the capsule's store subscription — the single choke point that
 * covers eraser, delete, undo, and clear paths alike.
 */
export function validateCapsuleIntegrity(
  capsule: { enclosedStrokeIds: string[] } | null,
  strokes: { id: string }[],
): boolean {
  if (!capsule) return true
  const existing = new Set(strokes.map((s) => s.id))
  return capsule.enclosedStrokeIds.every((id) => existing.has(id))
}
