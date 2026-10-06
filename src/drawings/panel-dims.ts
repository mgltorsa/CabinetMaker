/**
 * Position dimensions for a panel detail: hole rows (first hole from each
 * edge, row offset from the nearest edge, pitch note) and groove set-backs.
 * Dimension lines are stacked in levels on each side of the panel.
 */
import type { DadoOp, HoleOp, Mm, Part, Shape, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { isEdgeFace } from './panel-ops'
import { dim, text } from './shapes'
import type { DrawingStyle } from './style'

/** Next free stacking level on each side of the panel (1 = closest). */
export interface Levels {
  below: number
  above: number
  left: number
  right: number
}

export interface PanelDims {
  shapes: Shape[]
  levels: Levels
}

/** Cap so a panel with many rows stays legible; the rest are still drawn. */
const MAX_ROWS = 6
const MAX_DADOS = 6
const ROW_KEY_DECIMALS = 1
const PITCH_TOLERANCE: Mm = 0.05

interface Row {
  y: Mm
  xs: Mm[]
  diameter: Mm
}

function holeRows(holes: readonly HoleOp[]): Row[] {
  const byY = new Map<string, HoleOp[]>()
  holes.forEach((h) => {
    const key = h.y.toFixed(ROW_KEY_DECIMALS)
    byY.set(key, [...(byY.get(key) ?? []), h])
  })
  return [...byY.values()]
    .map((hs) => ({ y: hs[0]?.y ?? 0, xs: hs.map((h) => h.x).sort((a, b) => a - b), diameter: hs[0]?.diameter ?? 0 }))
    .sort((a, b) => a.y - b.y)
}

function evenPitch(xs: readonly Mm[]): Mm | null {
  if (xs.length < 3) return null
  const pitch = (xs[1] ?? 0) - (xs[0] ?? 0)
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs((xs[i] ?? 0) - (xs[i - 1] ?? 0) - pitch) > PITCH_TOLERANCE) return null
  }
  return pitch
}

export function panelDims(part: Part, units: UnitSystem, style: DrawingStyle): PanelDims {
  const { length: L, width: W } = part
  const gap = style.dimSpacing
  const fmt = (v: Mm): string => formatLength(v, units)
  const levels: Levels = { below: 1, above: 1, left: 1, right: 1 }
  const shapes: Shape[] = []

  /** Horizontal dim at the next level below/above the panel; returns the dim line y. */
  const xDim = (xa: Mm, xb: Mm, y: Mm, side: 'below' | 'above'): Mm => {
    const lineY = side === 'below' ? -gap * levels.below : W + gap * levels.above
    if (xb - xa > 1e-6) shapes.push(dim(xa, y, xb, y, lineY - y, fmt(xb - xa)))
    return lineY
  }
  /** Vertical dim left/right of the panel at the next level. */
  const yDim = (x: Mm, ya: Mm, yb: Mm, side: 'left' | 'right'): void => {
    if (yb - ya <= 1e-6) return
    const lineX = side === 'left' ? -gap * levels.left : L + gap * levels.right
    shapes.push(dim(x, ya, x, yb, x - lineX, fmt(yb - ya)))
    levels[side] += 1
  }

  const holes = part.ops.filter((o): o is HoleOp => o.kind === 'hole' && !isEdgeFace(o.face))
  holeRows(holes)
    .slice(0, MAX_ROWS)
    .forEach((row) => {
      const first = row.xs[0] ?? 0
      const last = row.xs[row.xs.length - 1] ?? 0
      const side = row.y <= W / 2 ? 'below' : 'above'
      xDim(0, first, row.y, side)
      const lineY = xDim(last, L, row.y, side)
      const pitch = evenPitch(row.xs)
      if (pitch !== null) {
        const note = `${row.xs.length} x Ø${fmt(row.diameter)} @ ${fmt(pitch)}`
        shapes.push(text((first + last) / 2, lineY + style.textSize * 0.35, note, style.textSize * 0.85, 'middle'))
      }
      levels[side] += 1
      const useLeft = first <= L - last
      const xRef = useLeft ? first : last
      const lr = useLeft ? 'left' : 'right'
      if (row.y <= W / 2) yDim(xRef, 0, row.y, lr)
      else yDim(xRef, row.y, W, lr)
    })

  const dados = part.ops.filter((o): o is DadoOp => o.kind === 'dado' && !isEdgeFace(o.face))
  dados.slice(0, MAX_DADOS).forEach((d) => {
    const hw = d.width / 2
    if (Math.abs(d.y1 - d.y2) < 1e-6) {
      const x = Math.min(d.x1, d.x2)
      if (d.y1 <= W / 2) yDim(x, 0, d.y1 - hw, 'left')
      else yDim(x, d.y1 + hw, W, 'left')
    } else if (Math.abs(d.x1 - d.x2) < 1e-6) {
      const y = Math.min(d.y1, d.y2)
      const near = d.x1 <= L / 2
      xDim(near ? 0 : d.x1 + hw, near ? d.x1 - hw : L, y, 'below')
      levels.below += 1
    }
  })
  return { shapes, levels }
}
