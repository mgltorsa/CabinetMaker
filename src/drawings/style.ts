/**
 * Shared presentation rules for both renderers (SVG and PDF) so the screen
 * and the plan book look the same.
 */
import type { Drawing, DrawingLayer, Mm } from '@/core/types'

export interface DrawingStyle {
  /** Default text / dimension label height in model mm. */
  textSize: Mm
  /** Dimension arrow length. */
  arrow: Mm
  /** Gap between the measured point and the start of an extension line. */
  extGap: Mm
  /** How far an extension line runs past the dimension line. */
  extOvershoot: Mm
  /** Spacing between stacked dimension lines. */
  dimSpacing: Mm
}

/** Text height as a fraction of the drawing's largest extent. */
const TEXT_FRACTION = 1 / 60
const MIN_TEXT: Mm = 1.5

/** Style derived from a drawing's largest extent (mm). */
export function styleForExtent(extent: Mm): DrawingStyle {
  const safe = Number.isFinite(extent) && extent > 0 ? extent : 100
  const textSize = Math.max(safe * TEXT_FRACTION, MIN_TEXT)
  return {
    textSize,
    arrow: textSize * 0.6,
    extGap: textSize * 0.3,
    extOvershoot: textSize * 0.4,
    dimSpacing: textSize * 2.4,
  }
}

export function extentOf(bounds: Drawing['bounds']): Mm {
  return Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
}

export function styleForDrawing(drawing: Drawing): DrawingStyle {
  return styleForExtent(extentOf(drawing.bounds))
}

export interface LayerStyle {
  /** Stroke width in CSS px (SVG, non-scaling) or pt (PDF). */
  strokeWidth: number
  dash: readonly number[] | null
  color: string
}

export const LAYER_STYLES: Readonly<Record<DrawingLayer | 'dim', LayerStyle>> = {
  outline: { strokeWidth: 1.4, dash: null, color: '#1a1a1a' },
  hidden: { strokeWidth: 0.8, dash: [6, 4], color: '#6b6b6b' },
  op: { strokeWidth: 1.0, dash: null, color: '#1f5fbf' },
  dimension: { strokeWidth: 0.6, dash: null, color: '#3d3d3d' },
  text: { strokeWidth: 0.7, dash: null, color: '#1a1a1a' },
  hatch: { strokeWidth: 0.5, dash: null, color: '#8c8c8c' },
  dim: { strokeWidth: 0.6, dash: null, color: '#3d3d3d' },
}

/** Fill used for the section-cut parts and placed parts. */
export const FILL_SECTION = '#e3e3e3'
export const FILL_FRONT = '#f3efe6'
export const FILL_PLACED = '#eef3fa'

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * Only plain hex colours are honoured; anything else (which could carry markup
 * or CSS) becomes `null` and the shape is drawn unfilled.
 */
export function safeFill(fill: string | undefined): string | null {
  if (fill === undefined) return null
  return HEX_COLOR.test(fill) ? fill : null
}

/** Parse `#rgb` / `#rrggbb` to 0..1 channels. Caller must pass a `safeFill` result. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.slice(1)
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}
