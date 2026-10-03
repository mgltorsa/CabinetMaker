/**
 * Side elevation as a section seen from the right: cabinet Z → drawing X
 * (back at left, front at right), cabinet Y → drawing Y. The section plane is
 * the cabinet's mid-width; parts it cuts are filled, the far side panel and
 * anything else beyond are plain outlines.
 */
import type { Cabinet, CabinetBuild, Drawing, Mm, Part, Shape, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { makeDrawing } from './bounds'
import { synthesizedTop } from './front-elevation'
import { project, union } from './part-geometry'
import { dim, line, rect, type Range2 } from './shapes'
import { FILL_SECTION, type DrawingStyle } from './style'

const zy = (p: Part): Range2 => project(p, 'z', 'y')

function isSidePanel(p: Part): boolean {
  return (p.group === 'carcass' || p.group === 'divider') && p.axes.thickness === 'x'
}

function sideShapes(parts: readonly Part[], cutX: Mm, units: UnitSystem, style: DrawingStyle, fallback: Range2): Shape[] {
  const sides = parts.filter(isSidePanel)
  const rest = parts.filter((p) => !isSidePanel(p))
  const box = union(parts.map(zy)) ?? fallback
  const floor = Math.min(box.y0, 0)
  const gap = style.dimSpacing
  const fmt = (v: Mm): string => formatLength(v, units)
  const isCut = (p: Part): boolean => p.bounds.min.x <= cutX && p.bounds.max.x >= cutX
  const shapes: Shape[] = [
    line(box.x0 - gap, 0, box.x1 + gap, 0, 'hatch'),
    ...sides.map((p) => rect(zy(p), 'outline')),
    ...rest.map((p) => (isCut(p) ? rect(zy(p), 'outline', FILL_SECTION) : rect(zy(p), 'outline'))),
  ]
  const sideBox = union(sides.map(zy))
  if (sideBox) shapes.push(rect(sideBox, 'outline'))
  else if (parts.length === 0) shapes.push(rect(box, 'outline'))
  shapes.push(dim(box.x0, floor, box.x1, floor, -gap * 1.5, fmt(box.x1 - box.x0)))
  shapes.push(dim(box.x0, floor, box.x0, box.y1, gap * 1.5, fmt(box.y1 - floor)))
  return shapes
}

export function sideElevation(cabinet: Cabinet, build: CabinetBuild, units: UnitSystem): Drawing {
  const top = synthesizedTop(cabinet, build.parts)
  const parts = top ? [...build.parts, top] : build.parts
  const xs = union(parts.map((p) => project(p, 'x', 'y')))
  const cutX = xs ? (xs.x0 + xs.x1) / 2 : cabinet.width / 2
  const fallback: Range2 = { x0: 0, x1: cabinet.depth, y0: 0, y1: cabinet.height }
  const extent = Math.max(cabinet.depth, cabinet.height, 1)
  return makeDrawing(`${cabinet.id}:side`, `${cabinet.name} - side section`, extent, units, (style) =>
    sideShapes(parts, cutX, units, style, fallback),
  )
}
