import type { Mm } from '@/core/types'

/** Average Helvetica glyph advance as a fraction of the font size. */
export const TEXT_WIDTH_FACTOR = 0.56

/** Rough text width for layout and bounds (renderers measure exactly where they can). */
export function estimateTextWidth(value: string, size: Mm): Mm {
  return Array.from(value).length * size * TEXT_WIDTH_FACTOR
}
