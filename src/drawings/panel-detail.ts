/**
 * Dimensioned panel detail in panel space: x = length (grain), y = width,
 * viewed on face A. Face B and edge ops are dashed with a note.
 */
import type { Drawing, Mm, Part, Shape, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { makeDrawing } from './bounds'
import { panelDims } from './panel-dims'
import { isEdgeFace, opShapes } from './panel-ops'
import { arrow, dim, rect, text } from './shapes'
import type { DrawingStyle } from './style'

export interface PanelDetailOptions {
  /** Display name of the part's material; falls back to the material id. */
  materialName?: string
}

/** Length with a unit suffix for notes (`18 mm`, `3/4"`). */
export function lengthWithUnit(v: Mm, units: UnitSystem): string {
  const s = formatLength(v, units)
  return units === 'metric' ? `${s} mm` : s
}

function grainLine(part: Part, x: Mm, y: Mm, style: DrawingStyle): Shape[] {
  const ts = style.textSize
  const len = ts * 3
  if (part.grain === 'none') return [text(x, y, 'No grain', ts * 0.9)]
  const arrowShapes =
    part.grain === 'length'
      ? arrow({ x, y: y + ts * 0.35 }, { x: x + len, y: y + ts * 0.35 }, ts * 0.6)
      : arrow({ x: x + ts * 0.5, y: y - ts * 0.3 }, { x: x + ts * 0.5, y: y + ts * 1.1 }, ts * 0.6)
  const labelX = part.grain === 'length' ? x + len + ts * 0.6 : x + ts * 1.4
  const label = part.grain === 'length' ? 'Grain along length' : 'Grain along width'
  return [...arrowShapes, text(labelX, y, label, ts * 0.9)]
}

function notes(part: Part, y: Mm, style: DrawingStyle): Shape[] {
  const faceB = part.ops.filter((o) => o.face === 'B').length
  const edge = part.ops.filter((o) => isEdgeFace(o.face)).length
  const lines: string[] = []
  if (faceB > 0) lines.push(`Dashed: ${faceB} op(s) on face B - flip the part to machine`)
  if (edge > 0) lines.push(`Dashed at edges: ${edge} edge op(s) - manual, not cut by CNC`)
  return lines.map((l, i) => text(0, y - i * style.textSize * 1.4, l, style.textSize * 0.85))
}

function detailShapes(part: Part, units: UnitSystem, style: DrawingStyle, materialName: string): Shape[] {
  const { length: L, width: W } = part
  const ts = style.textSize
  const gap = style.dimSpacing
  const fmt = (v: Mm): string => formatLength(v, units)
  const { shapes: posDims, levels } = panelDims(part, units, style)
  const shapes: Shape[] = [rect({ x0: 0, x1: L, y0: 0, y1: W }, 'outline'), ...part.ops.flatMap((op) => opShapes(op, part)), ...posDims]
  shapes.push(dim(0, 0, L, 0, -gap * levels.below, fmt(L)))
  shapes.push(dim(0, 0, 0, W, gap * levels.left, fmt(W)))

  const top = W + gap * (levels.above - 1) + ts * 2.2
  const info = `${materialName} · T ${lengthWithUnit(part.thickness, units)} · ${fmt(L)} x ${fmt(W)}`
  shapes.push(...grainLine(part, 0, top, style))
  shapes.push(text(0, top + ts * 2, info, ts))
  shapes.push(text(0, top + ts * 3.6, part.name, ts * 1.3))
  shapes.push(...notes(part, -gap * (levels.below + 1) - ts, style))
  return shapes
}

export function panelDetail(part: Part, units: UnitSystem, options: PanelDetailOptions = {}): Drawing {
  const extent = Math.max(part.length, part.width, 1)
  const materialName = options.materialName ?? part.materialId
  return makeDrawing(`${part.id}:detail`, part.name, extent, units, (style) => detailShapes(part, units, style, materialName))
}
