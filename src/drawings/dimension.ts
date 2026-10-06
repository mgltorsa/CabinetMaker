/**
 * Dimension geometry shared by the SVG and PDF renderers: extension lines,
 * dimension line, arrowheads and an upright label, all in model mm (+Y up).
 */
import type { Mm, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import type { DimShape } from './shapes'
import { estimateTextWidth } from './text-metrics'
import type { DrawingStyle } from './style'

export interface Segment {
  x1: Mm
  y1: Mm
  x2: Mm
  y2: Mm
}

export interface DimensionLabel {
  x: Mm
  y: Mm
  /** Counter-clockwise rotation in degrees, normalised to (-90, 90] so text reads upright. */
  angleDeg: number
  text: string
}

export interface DimensionGeometry {
  extensions: Segment[]
  line: Segment
  arrows: Segment[]
  label: DimensionLabel
}

/** Below this length the arrows are drawn outside the extension lines. */
const ARROWS_INSIDE_FACTOR = 2.5
const ARROW_HALF_WIDTH = 0.35

export function dimensionGeometry(d: DimShape, style: DrawingStyle, units: UnitSystem): DimensionGeometry | null {
  const dx = d.x2 - d.x1
  const dy = d.y2 - d.y1
  const len = Math.hypot(dx, dy)
  if (!Number.isFinite(len) || len < 1e-9 || !Number.isFinite(d.offset)) return null
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const sign = d.offset >= 0 ? 1 : -1
  const a1 = { x: d.x1 + nx * d.offset, y: d.y1 + ny * d.offset }
  const a2 = { x: d.x2 + nx * d.offset, y: d.y2 + ny * d.offset }
  const gap = Math.min(style.extGap, Math.abs(d.offset))
  const over = style.extOvershoot * sign
  const extension = (px: Mm, py: Mm, ax: Mm, ay: Mm): Segment => ({
    x1: px + nx * gap * sign,
    y1: py + ny * gap * sign,
    x2: ax + nx * over,
    y2: ay + ny * over,
  })
  const extensions = Math.abs(d.offset) > 1e-9 ? [extension(d.x1, d.y1, a1.x, a1.y), extension(d.x2, d.y2, a2.x, a2.y)] : []

  const inside = len >= style.arrow * ARROWS_INSIDE_FACTOR
  const dir = inside ? 1 : -1
  const head = (tx: Mm, ty: Mm, bx: Mm, by: Mm): Segment[] => {
    const w = style.arrow * ARROW_HALF_WIDTH
    return [
      { x1: tx, y1: ty, x2: bx + nx * w, y2: by + ny * w },
      { x1: tx, y1: ty, x2: bx - nx * w, y2: by - ny * w },
    ]
  }
  const s = style.arrow * dir
  const arrows = [...head(a1.x, a1.y, a1.x + ux * s, a1.y + uy * s), ...head(a2.x, a2.y, a2.x - ux * s, a2.y - uy * s)]
  const tail = inside ? 0 : style.arrow * 1.5
  const dimLine: Segment = {
    x1: a1.x - ux * tail,
    y1: a1.y - uy * tail,
    x2: a2.x + ux * tail,
    y2: a2.y + uy * tail,
  }

  let angle = (Math.atan2(uy, ux) * 180) / Math.PI
  if (angle > 90) angle -= 180
  if (angle <= -90) angle += 180
  const rad = (angle * Math.PI) / 180
  const lift = style.textSize * 0.35
  const labelText = d.label ?? formatLength(len, units)
  // Short dims: put the label past the second arrow so it does not sit on the extension lines.
  const along = inside ? 0 : len / 2 + tail + estimateTextWidth(labelText, style.textSize) / 2 + style.textSize * 0.3
  const label: DimensionLabel = {
    x: (a1.x + a2.x) / 2 + ux * along - Math.sin(rad) * lift,
    y: (a1.y + a2.y) / 2 + uy * along + Math.cos(rad) * lift,
    angleDeg: angle === 0 ? 0 : angle,
    text: labelText,
  }
  return { extensions, line: dimLine, arrows, label }
}
