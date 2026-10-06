/**
 * Sheet layout in sheet space: x along sheet length, y along sheet width,
 * origin at the front-left corner.
 */
import type { Drawing, Mm, Part, Placement, Shape, Sheet, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { estimateTextWidth, makeDrawing } from './bounds'
import { lengthWithUnit } from './panel-detail'
import { arrow, dim, rect, text } from './shapes'
import { FILL_PLACED, type DrawingStyle } from './style'

export interface SheetLayoutOptions {
  /** Trim kept clear on every sheet edge (drawn dashed when > 0). */
  edgeTrim?: Mm
  materialName?: string
  /** Sheet grain arrow; defaults to true when any placed part is grained. */
  grained?: boolean
}

/** Short part id for labels: the role, else the id after the cabinet prefix. */
export function shortPartId(partId: string, part: Part | undefined): string {
  if (part && part.role !== '') return part.role
  const i = partId.lastIndexOf(':')
  return i >= 0 ? partId.slice(i + 1) : partId
}

/** Grain direction of a placed part in sheet space, or null when ungrained / unknown. */
function grainAxis(p: Placement, part: Part | undefined): 'x' | 'y' | null {
  if (!part || part.grain === 'none') return null
  const alongLength = part.grain === 'length'
  return alongLength !== p.rotated ? 'x' : 'y'
}

function fitText(value: string, maxWidth: Mm, maxSize: Mm): Mm {
  const w = estimateTextWidth(value, 1)
  return w > 0 ? Math.min(maxSize, maxWidth / w) : maxSize
}

function placementShapes(p: Placement, index: number, part: Part | undefined, style: DrawingStyle): Shape[] {
  const shapes: Shape[] = [rect({ x0: p.x, x1: p.x + p.sizeX, y0: p.y, y1: p.y + p.sizeY }, 'outline', FILL_PLACED)]
  const cx = p.x + p.sizeX / 2
  const cy = p.y + p.sizeY / 2
  const name = part?.name ?? p.partId
  const sub = `#${index + 1} ${shortPartId(p.partId, part)}`
  const size = Math.min(fitText(name, p.sizeX * 0.9, style.textSize), p.sizeY / 4)
  const subSize = Math.min(fitText(sub, p.sizeX * 0.9, style.textSize * 0.8), p.sizeY / 4)
  shapes.push(text(cx, cy + size * 0.3, name, size, 'middle'))
  shapes.push(text(cx, cy - subSize * 1.2, sub, subSize, 'middle'))
  const axis = grainAxis(p, part)
  if (axis !== null) {
    const len = Math.min(axis === 'x' ? p.sizeX : p.sizeY, style.textSize * 4) * 0.5
    const head = Math.min(style.arrow, len * 0.4)
    const ax = p.x + Math.min(p.sizeX * 0.1, style.textSize)
    const ay = p.y + Math.min(p.sizeY * 0.1, style.textSize)
    const to = axis === 'x' ? { x: ax + len, y: ay } : { x: ax, y: ay + len }
    shapes.push(...arrow({ x: ax, y: ay }, to, head, 'hatch'))
  }
  return shapes
}

function sheetShapes(sheet: Sheet, parts: ReadonlyMap<string, Part>, units: UnitSystem, style: DrawingStyle, options: SheetLayoutOptions): Shape[] {
  const { length: L, width: W } = sheet
  const trim = options.edgeTrim ?? 0
  const fmt = (v: Mm): string => formatLength(v, units)
  const shapes: Shape[] = [rect({ x0: 0, x1: L, y0: 0, y1: W }, 'outline')]
  if (trim > 0 && trim * 2 < Math.min(L, W)) shapes.push(rect({ x0: trim, x1: L - trim, y0: trim, y1: W - trim }, 'hidden'))
  sheet.placements.forEach((p, i) => shapes.push(...placementShapes(p, i, parts.get(p.partId), style)))
  shapes.push(dim(0, 0, L, 0, -style.dimSpacing, fmt(L)))
  shapes.push(dim(0, 0, 0, W, style.dimSpacing, fmt(W)))
  const material = options.materialName ?? sheet.materialId
  const yieldPct = Number.isFinite(sheet.yield) ? (sheet.yield * 100).toFixed(1) : '0.0'
  const title = `Sheet ${sheet.index} · ${material} · ${lengthWithUnit(sheet.thickness, units)} · ${sheet.placements.length} parts · yield ${yieldPct} %`
  shapes.push(text(0, W + style.textSize * 0.8, title, style.textSize))
  const grained = options.grained ?? sheet.placements.some((p) => (parts.get(p.partId)?.grain ?? 'none') !== 'none')
  if (grained) {
    const ts = style.textSize
    const y = -style.dimSpacing * 2
    shapes.push(...arrow({ x: L - ts * 4, y: y + ts * 0.3 }, { x: L, y: y + ts * 0.3 }, style.arrow))
    shapes.push(text(L - ts * 4.6, y, 'Sheet grain', ts * 0.8, 'end'))
  }
  return shapes
}

export function sheetLayout(sheet: Sheet, parts: ReadonlyMap<string, Part>, units: UnitSystem, options: SheetLayoutOptions = {}): Drawing {
  const extent = Math.max(sheet.length, sheet.width, 1)
  return makeDrawing(`${sheet.id}:layout`, `Sheet ${sheet.index} (${sheet.id})`, extent, units, (style) =>
    sheetShapes(sheet, parts, units, style, options),
  )
}
