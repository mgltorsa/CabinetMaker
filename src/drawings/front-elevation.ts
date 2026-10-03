/**
 * Front elevation: looking at the cabinet front. Cabinet X → drawing X,
 * cabinet Y → drawing Y. Fronts are filled so they hide the carcass behind.
 */
import type { Cabinet, CabinetBuild, Drawing, Mm, Part, PartGroup, Shape, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { makeDrawing } from './bounds'
import { hingeSide, isDoor, project, pullPoints, union } from './part-geometry'
import { floorLine, horizontalDims, mountingNote, verticalDims } from './envelope-dims'
import { circle, dim, line, rect, type Range2 } from './shapes'
import { FILL_FRONT, type DrawingStyle } from './style'

const VISIBLE_GROUPS: readonly PartGroup[] = ['carcass', 'divider', 'face-frame', 'toe-kick', 'top', 'stretcher']
/** Schematic pull length for hand-made (frame-less) fronts without pull holes (typical 128 mm c/c bar). */
const DEFAULT_PULL: Mm = 128
const PULL_EDGE_INSET: Mm = 40
const PULL_END_INSET: Mm = 60
const EPS: Mm = 0.5

const xy = (p: Part): Range2 => project(p, 'x', 'y')

/** Countertop / top drawn from the cabinet settings when the engine emits no top part. */
export function synthesizedTop(cabinet: Cabinet, parts: readonly Part[]): Part | null {
  if (cabinet.top.kind === 'none' || parts.some((p) => p.group === 'top')) return null
  const box = union(parts.map((p) => project(p, 'x', 'y')))
  const zr = union(parts.map((p) => project(p, 'z', 'y')))
  const x0 = (box?.x0 ?? 0) - cabinet.top.overhangSides
  const x1 = (box?.x1 ?? cabinet.width) + cabinet.top.overhangSides
  const y0 = box?.y1 ?? cabinet.height
  const z0 = zr?.x0 ?? 0
  const z1 = (zr?.x1 ?? cabinet.depth) + cabinet.top.overhangFront
  const t = cabinet.top.thickness
  return {
    id: `${cabinet.id}:countertop`,
    cabinetId: cabinet.id,
    name: cabinet.top.kind === 'countertop' ? 'Countertop' : 'Top',
    group: 'top',
    role: 'countertop',
    length: x1 - x0,
    width: z1 - z0,
    thickness: t,
    materialId: cabinet.top.materialId ?? '',
    grain: 'length',
    bounds: { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y0 + t, z: z1 } },
    axes: { length: 'x', width: 'z', thickness: 'y' },
    ops: [],
  }
}

function doorSwing(part: Part, cabinet: Cabinet): Shape[] {
  const r = xy(part)
  const midY = (r.y0 + r.y1) / 2
  // Drafting convention: the triangle's apex points at the hinge side.
  const hingeX = hingeSide(part, cabinet) === 'left' ? r.x0 : r.x1
  const latchX = hingeX === r.x0 ? r.x1 : r.x0
  return [line(latchX, r.y0, hingeX, midY, 'hidden'), line(latchX, r.y1, hingeX, midY, 'hidden')]
}

function pullMarks(part: Part, cabinet: Cabinet, style: DrawingStyle): Shape[] {
  const points = pullPoints(part)
  const dot = style.textSize * 0.2
  if (points.length > 0) {
    const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x)
    const marks: Shape[] = sorted.map((p) => circle(p.x, p.y, dot, 'outline'))
    for (let i = 0; i + 1 < sorted.length; i += 2) {
      const a = sorted[i]
      const b = sorted[i + 1]
      if (a && b) marks.push(line(a.x, a.y, b.x, b.y, 'outline'))
    }
    return marks
  }
  // Engine-built parts (they carry a `frame`) are authoritative: no pull holes
  // means the engine deliberately omitted the pull (e.g. a front too short for
  // the pull's centres). Only frame-less, hand-made parts get a schematic pull.
  if (part.frame !== undefined || cabinet.hardware.pullId === null) return []
  const r = xy(part)
  const w = r.x1 - r.x0
  const h = r.y1 - r.y0
  if (!isDoor(part)) {
    const len = Math.min(DEFAULT_PULL, w * 0.5)
    const cx = (r.x0 + r.x1) / 2
    const cy = (r.y0 + r.y1) / 2
    return [line(cx - len / 2, cy, cx + len / 2, cy, 'outline')]
  }
  const len = Math.min(DEFAULT_PULL, h * 0.4)
  const inset = Math.min(PULL_EDGE_INSET, w * 0.15)
  const x = hingeSide(part, cabinet) === 'left' ? r.x1 - inset : r.x0 + inset
  const end = Math.min(PULL_END_INSET, h * 0.1)
  const nearBottom = cabinet.type === 'wall'
  const ya = nearBottom ? r.y0 + end : r.y1 - end - len
  return [line(x, ya, x, ya + len, 'outline')]
}

/**
 * Fronts grouped into side-by-side columns (fronts whose x ranges overlap),
 * left to right. A height chain is only meaningful within one column: chaining
 * a door beside a drawer stack would overprint the labels.
 */
export function frontColumns(fronts: readonly Part[]): Part[][] {
  const sorted = [...fronts].sort((a, b) => a.bounds.min.x - b.bounds.min.x)
  const columns: { x1: Mm; parts: Part[] }[] = []
  for (const f of sorted) {
    const last = columns.at(-1)
    if (last && f.bounds.min.x < last.x1 - EPS) {
      last.parts.push(f)
      last.x1 = Math.max(last.x1, f.bounds.max.x)
    } else {
      columns.push({ x1: f.bounds.max.x, parts: [f] })
    }
  }
  return columns.map((c) => c.parts)
}

/** Distinct front height intervals (plus toe kick) bottom to top. */
function heightChain(fronts: readonly Part[], kickHeight: Mm): Array<[Mm, Mm]> {
  const spans: Array<[Mm, Mm]> = fronts.map((f) => [f.bounds.min.y, f.bounds.max.y])
  if (kickHeight > EPS) spans.push([0, kickHeight])
  const key = (s: [Mm, Mm]): string => `${s[0].toFixed(2)}:${s[1].toFixed(2)}`
  const unique = new Map(spans.filter((s) => s[1] - s[0] > EPS).map((s) => [key(s), s] as const))
  return [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

function toeKickHeight(cabinet: Cabinet, parts: readonly Part[]): Mm {
  const kick = parts.filter((p) => p.group === 'toe-kick')
  if (kick.length > 0) return Math.max(...kick.map((p) => p.bounds.max.y))
  if (cabinet.floorHeight !== 0 || cabinet.construction.toeKick.type === 'none') return 0
  const carcass = parts.filter((p) => p.group === 'carcass')
  return carcass.length > 0 ? Math.min(...carcass.map((p) => p.bounds.min.y)) : 0
}

function frontShapes(cabinet: Cabinet, parts: readonly Part[], units: UnitSystem, style: DrawingStyle): Shape[] {
  const visible = parts.filter((p) => VISIBLE_GROUPS.includes(p.group))
  const fronts = parts.filter((p) => p.group === 'front')
  const shelves = parts.filter((p) => p.group === 'shelf')
  const all = union(parts.map(xy)) ?? { x0: 0, x1: cabinet.width, y0: 0, y1: cabinet.height }
  const box: Range2 = { ...all, y0: Math.min(all.y0, 0) }
  const fmt = (v: Mm): string => formatLength(v, units)
  const gap = style.dimSpacing

  const shapes: Shape[] = [
    ...floorLine(cabinet.floorHeight, box.x0 - gap, box.x1 + gap),
    ...shelves.map((p) => rect(xy(p), 'hidden')),
    ...visible.map((p) => rect(xy(p), 'outline')),
    rect(union(visible.map(xy)) ?? box, 'outline'),
  ]
  fronts.forEach((f) => {
    shapes.push(rect(xy(f), 'outline', FILL_FRONT))
    if (isDoor(f)) shapes.push(...doorSwing(f, cabinet))
    shapes.push(...pullMarks(f, cabinet, style))
  })

  const kick = toeKickHeight(cabinet, parts)
  // Primary dims state the cabinet box as entered; projections get an "overall" dim.
  const cab = { x0: 0, x1: cabinet.width, y0: cabinet.floorHeight, y1: cabinet.floorHeight + cabinet.height }
  shapes.push(...horizontalDims({ lo: cab.x0, hi: cab.x1 }, { lo: box.x0, hi: box.x1 }, cab.y0, gap, fmt))
  shapes.push(...verticalDims({ lo: cab.y0, hi: cab.y1 }, box.y1, Math.min(box.x0, cab.x0), gap, fmt))
  shapes.push(...mountingNote(cabinet.floorHeight, Math.min(box.x0, cab.x0), cab.y0 - gap * 4, style.textSize, fmt))
  // One chain per outer column: rightmost on the right, leftmost (if its fronts differ) outside the left dims.
  const columns = frontColumns(fronts)
  const right = columns.at(-1) ?? []
  const left = columns.length > 1 ? (columns[0] ?? []) : []
  const rightChain = heightChain(right, kick)
  rightChain.forEach(([y0, y1]) => shapes.push(dim(box.x1, y0, box.x1, y1, -gap, fmt(y1 - y0))))
  const leftChain = heightChain(left, kick)
  const sameAsRight = leftChain.length === rightChain.length && leftChain.every((s, i) => Math.abs(s[0] - rightChain[i]![0]) < EPS && Math.abs(s[1] - rightChain[i]![1]) < EPS)
  if (leftChain.length > 0 && !sameAsRight) {
    const x = Math.min(box.x0, cab.x0)
    const outer = box.y1 > cab.y1 + EPS ? 4.1 : 2.8
    leftChain.forEach(([y0, y1]) => shapes.push(dim(x, y0, x, y1, gap * outer, fmt(y1 - y0))))
  }
  return shapes
}

export function frontElevation(cabinet: Cabinet, build: CabinetBuild, units: UnitSystem): Drawing {
  const top = synthesizedTop(cabinet, build.parts)
  const parts = top ? [...build.parts, top] : build.parts
  const extent = Math.max(cabinet.width, cabinet.height, 1)
  return makeDrawing(`${cabinet.id}:front`, `${cabinet.name} - front elevation`, extent, units, (style) =>
    frontShapes(cabinet, parts, units, style),
  )
}
