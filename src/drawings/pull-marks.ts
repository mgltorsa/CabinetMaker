/**
 * Pulls in the front elevation, by handle style (`core/handles`): bar = line
 * between its hole dots, knob = circle, cup = closed arc, edge pull = its lip
 * hanging from the grip edge (screws hidden behind the front), J-profile = a
 * lip along the whole grip edge, custom = its footprint over the hole dots.
 * Positions come from `core/pull-placement`, like the 3D view.
 */
import type { ResolvedHandle } from '@/core/handles'
import { pullPlacements, type PullPlacement } from '@/core/pull-placement'
import type { Cabinet, Mm, Part, Shape, Vec2 } from '@/core/types'
import { hingeSide, isDoor, project, pullPoints } from './part-geometry'
import { circle, line, polyline, rect, type Range2 } from './shapes'
import type { DrawingStyle } from './style'

/** Schematic pull length for hand-made (frame-less) fronts without pull holes (typical 128 mm c/c bar). */
const DEFAULT_PULL: Mm = 128
const PULL_EDGE_INSET: Mm = 40
const PULL_END_INSET: Mm = 60
/** Segments of a cup pull's half-ellipse. */
const CUP_ARC_SEGMENTS = 12

/** Elevation point at (u along, v across) in the pull's frame. */
function at(p: PullPlacement, u: Mm, v: Mm): Vec2 {
  return { x: p.centre.x + p.along.x * u + p.up.x * v, y: p.centre.y + p.along.y * u + p.up.y * v }
}

/** Axis-aligned range of the pull-frame box u ∈ [u0, u1], v ∈ [v0, v1]. */
function box(p: PullPlacement, u0: Mm, u1: Mm, v0: Mm, v1: Mm): Range2 {
  const a = at(p, u0, v0)
  const b = at(p, u1, v1)
  return { x0: a.x, x1: b.x, y0: a.y, y1: b.y }
}

function cupOutline(p: PullPlacement, h: ResolvedHandle): Vec2[] {
  const hl = p.length / 2
  const hw = h.width / 2
  const arc = Array.from({ length: CUP_ARC_SEGMENTS + 1 }, (_, i) => {
    const a = (Math.PI * i) / CUP_ARC_SEGMENTS
    return at(p, hl * Math.cos(a), -hw * Math.sin(a))
  })
  return [at(p, -hl, hw), at(p, hl, hw), ...arc]
}

function styleMarks(p: PullPlacement, h: ResolvedHandle, dot: Mm): Shape[] {
  const dots = (layer: 'outline' | 'hidden'): Shape[] => p.holes.map((q) => circle(q.x, q.y, dot, layer))
  switch (h.style) {
    case 'knob':
      return [circle(p.centre.x, p.centre.y, h.diameter / 2, 'outline'), ...dots('outline')]
    case 'cup':
      return [polyline(cupOutline(p, h), true, 'outline'), ...dots('outline')]
    case 'edge':
      return [rect(box(p, -p.length / 2, p.length / 2, p.edgeDistance - h.width, p.edgeDistance), 'outline'), ...dots('hidden')]
    case 'j-profile':
      return [rect(box(p, -p.length / 2, p.length / 2, -h.width, 0), 'outline')]
    case 'custom':
      return [rect(box(p, -p.length / 2, p.length / 2, -h.width / 2, h.width / 2), 'outline'), ...dots('outline')]
    case 'bar':
      return []
  }
}

/** Bar pulls (and pulls of unknown style): hole dots joined in pairs, as the elevation always drew them. */
function barMarks(part: Part, dot: Mm): Shape[] {
  const sorted = [...pullPoints(part)].sort((a, b) => a.y - b.y || a.x - b.x)
  const marks: Shape[] = sorted.map((p) => circle(p.x, p.y, dot, 'outline'))
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (a && b) marks.push(line(a.x, a.y, b.x, b.y, 'outline'))
  }
  return marks
}

/** A schematic bar on a hand-made front that has no pull holes. */
function schematicPull(part: Part, cabinet: Cabinet): Shape[] {
  const r = project(part, 'x', 'y')
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
  const ya = cabinet.type === 'wall' ? r.y0 + end : r.y1 - end - len
  return [line(x, ya, x, ya + len, 'outline')]
}

/**
 * Pull marks of one front. `handle` is the cabinet's pull from the catalog
 * (`null` when the catalog is not given: hole-based bar marks only).
 */
export function pullMarks(part: Part, cabinet: Cabinet, handle: ResolvedHandle | null, style: DrawingStyle): Shape[] {
  const dot = style.textSize * 0.2
  if (handle && handle.style !== 'bar') {
    const placements = pullPlacements(part, cabinet, handle)
    if (placements.length > 0) return placements.flatMap((p) => styleMarks(p, handle, dot))
  }
  if (pullPoints(part).length > 0) return barMarks(part, dot)
  // Engine-built parts (they carry a `frame`) are authoritative: no pull holes
  // means the engine deliberately omitted the pull (e.g. a front too short for
  // the pull's centres). Only frame-less, hand-made parts get a schematic pull.
  if (part.frame !== undefined || cabinet.hardware.pullId === null) return []
  return schematicPull(part, cabinet)
}
