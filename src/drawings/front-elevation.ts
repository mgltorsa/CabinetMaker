/**
 * Front elevation: looking at the cabinet front. Cabinet X → drawing X,
 * cabinet Y → drawing Y. Fronts are filled so they hide the carcass behind.
 */
import { resolveHandle, type ResolvedHandle } from '@/core/handles'
import type { Cabinet, CabinetBuild, Drawing, DrawingDimId, HardwareItem, Mm, Part, PartGroup, Shape, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { makeDrawing } from './bounds'
import { hingeSide, isDoor, project, union } from './part-geometry'
import { pullMarks } from './pull-marks'
import { floorLine, horizontalDims, mountingNote, verticalDims } from './envelope-dims'
import { frontDimId, frontRefOf } from './dim-ids'
import { dim, line, rect, withId, type Range2 } from './shapes'
import { FILL_FRONT, type DrawingStyle } from './style'

const VISIBLE_GROUPS: readonly PartGroup[] = ['carcass', 'divider', 'face-frame', 'toe-kick', 'top', 'stretcher']
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

/**
 * Hanging rods: hidden (dashed) where a front covers them, solid in open bays.
 * Drawn after the fronts so the door fill does not hide the dashed outline.
 */
function rodShapes(parts: readonly Part[], fronts: readonly Part[]): Shape[] {
  /** Length of the rod's centreline hidden by front `f` (pairs of doors leave a reveal between them). */
  const covered = (f: Range2, r: Range2): Mm => {
    const y = (r.y0 + r.y1) / 2
    return y >= f.y0 && y <= f.y1 ? Math.max(0, Math.min(f.x1, r.x1) - Math.max(f.x0, r.x0)) : 0
  }
  return parts
    .filter((p) => p.group === 'rod')
    .map((rod) => {
      const r = xy(rod)
      const hidden = fronts.reduce((n, f) => n + covered(xy(f), r), 0)
      return rect(r, hidden >= (r.x1 - r.x0) / 2 ? 'hidden' : 'outline')
    })
}

function doorSwing(part: Part, cabinet: Cabinet): Shape[] {
  const r = xy(part)
  const midY = (r.y0 + r.y1) / 2
  // Drafting convention: the triangle's apex points at the hinge side.
  const hingeX = hingeSide(part, cabinet) === 'left' ? r.x0 : r.x1
  const latchX = hingeX === r.x0 ? r.x1 : r.x0
  return [line(latchX, r.y0, hingeX, midY, 'hidden'), line(latchX, r.y1, hingeX, midY, 'hidden')]
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

/** One link of a height chain: a front (or the toe kick) from `y0` to `y1`. */
interface ChainSpan {
  y0: Mm
  y1: Mm
  id?: DrawingDimId
}

function frontSpan(f: Part): ChainSpan {
  const ref = frontRefOf(f)
  const span = { y0: f.bounds.min.y, y1: f.bounds.max.y }
  return ref ? { ...span, id: frontDimId(ref.section, ref.bay) } : span
}

/** Distinct front height intervals (plus toe kick) bottom to top; the first front of an interval names it. */
function heightChain(fronts: readonly Part[], kickHeight: Mm): ChainSpan[] {
  const spans: ChainSpan[] = fronts.map(frontSpan)
  if (kickHeight > EPS) spans.push({ y0: 0, y1: kickHeight, id: 'toe-kick' })
  const key = (s: ChainSpan): string => `${s.y0.toFixed(2)}:${s.y1.toFixed(2)}`
  const unique = new Map<string, ChainSpan>()
  for (const s of spans) if (s.y1 - s.y0 > EPS && !unique.has(key(s))) unique.set(key(s), s)
  return [...unique.values()].sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1)
}

function toeKickHeight(cabinet: Cabinet, parts: readonly Part[]): Mm {
  const kick = parts.filter((p) => p.group === 'toe-kick')
  if (kick.length > 0) return Math.max(...kick.map((p) => p.bounds.max.y))
  if (cabinet.floorHeight !== 0 || cabinet.construction.toeKick.type === 'none') return 0
  const carcass = parts.filter((p) => p.group === 'carcass')
  return carcass.length > 0 ? Math.min(...carcass.map((p) => p.bounds.min.y)) : 0
}

function frontShapes(cabinet: Cabinet, parts: readonly Part[], units: UnitSystem, style: DrawingStyle, handle: ResolvedHandle | null): Shape[] {
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
    shapes.push(...pullMarks(f, cabinet, handle, style))
  })
  shapes.push(...rodShapes(parts, fronts))

  const kick = toeKickHeight(cabinet, parts)
  // Primary dims state the cabinet box as entered; projections get an "overall" dim.
  const cab = { x0: 0, x1: cabinet.width, y0: cabinet.floorHeight, y1: cabinet.floorHeight + cabinet.height }
  shapes.push(...horizontalDims({ lo: cab.x0, hi: cab.x1 }, { lo: box.x0, hi: box.x1 }, cab.y0, gap, fmt, 'width'))
  shapes.push(...verticalDims({ lo: cab.y0, hi: cab.y1 }, box.y1, Math.min(box.x0, cab.x0), gap, fmt))
  shapes.push(...mountingNote(cabinet.floorHeight, Math.min(box.x0, cab.x0), cab.y0 - gap * 4, style.textSize, fmt))
  // One chain per outer column: rightmost on the right, leftmost (if its fronts differ) outside the left dims.
  const columns = frontColumns(fronts)
  const right = columns.at(-1) ?? []
  const left = columns.length > 1 ? (columns[0] ?? []) : []
  const rightChain = heightChain(right, kick)
  rightChain.forEach(({ y0, y1, id }) => shapes.push(withId(dim(box.x1, y0, box.x1, y1, -gap, fmt(y1 - y0)), id)))
  const leftChain = heightChain(left, kick)
  const sameAsRight = leftChain.length === rightChain.length && leftChain.every((s, i) => Math.abs(s.y0 - rightChain[i]!.y0) < EPS && Math.abs(s.y1 - rightChain[i]!.y1) < EPS)
  if (leftChain.length > 0 && !sameAsRight) {
    const x = Math.min(box.x0, cab.x0)
    const outer = box.y1 > cab.y1 + EPS ? 4.1 : 2.8
    // Ids stay unique per drawing: the toe kick (and a pair's bay) is already tagged on the right chain.
    const tagged = new Set(rightChain.map((s) => s.id))
    leftChain.forEach(({ y0, y1, id }) => shapes.push(withId(dim(x, y0, x, y1, gap * outer, fmt(y1 - y0)), tagged.has(id) ? undefined : id)))
  }
  return shapes
}

export interface FrontElevationOptions {
  /** Project hardware catalog: draws each pull in its handle style. Absent = bar marks from the pull holes. */
  hardware?: readonly HardwareItem[]
}

function cabinetHandle(cabinet: Cabinet, hardware: readonly HardwareItem[] | undefined): ResolvedHandle | null {
  const item = hardware?.find((h) => h.id === cabinet.hardware.pullId && h.kind === 'pull')
  return item ? resolveHandle(item) : null
}

export function frontElevation(cabinet: Cabinet, build: CabinetBuild, units: UnitSystem, options: FrontElevationOptions = {}): Drawing {
  const top = synthesizedTop(cabinet, build.parts)
  const parts = top ? [...build.parts, top] : build.parts
  const extent = Math.max(cabinet.width, cabinet.height, 1)
  const handle = cabinetHandle(cabinet, options.hardware)
  return makeDrawing(`${cabinet.id}:front`, `${cabinet.name} - front elevation`, extent, units, (style) =>
    frontShapes(cabinet, parts, units, style, handle),
  )
}
