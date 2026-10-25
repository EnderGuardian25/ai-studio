// 025 FR-08: the pairing rule between a brief's image style and its product
// screenshot. Pure and client-safe. This is the rule only; the source's shape,
// storage and upload come later (T7).
import { getArchetype } from '@/lib/designData'

export type CompositePairingError = 'IMAGE_STYLE_NEEDS_SCREENSHOT' | 'SCREENSHOT_NEEDS_IMAGE_STYLE'

// A look that `requires` a screenshot needs one; a screenshot on any other look
// (or on classic) is refused. null when the pair is consistent.
export function compositePairingError(
  imageStyle: string | null | undefined,
  compositeSource: unknown,
): CompositePairingError | null {
  const needs = !!imageStyle && !!getArchetype(imageStyle)?.requires
  const has = compositeSource !== undefined && compositeSource !== null
  if (needs && !has) return 'IMAGE_STYLE_NEEDS_SCREENSHOT'
  if (has && !needs) return 'SCREENSHOT_NEEDS_IMAGE_STYLE'
  return null
}
