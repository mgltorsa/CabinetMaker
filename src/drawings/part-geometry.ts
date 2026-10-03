/**
 * Mapping parts (cabinet space) onto elevation planes, and panel-space ops
 * back to cabinet space. Assumes, like the engine, that each panel axis runs
 * in the positive direction of the cabinet axis it maps to and that face A is
 * on the max side of the thickness axis.
 */
import type { Axis, Cabinet, HoleOp, Mm, Part, Vec3 } from '@/core/types'
import type { Range2 } from './shapes'

/** Project a part's bounds onto two cabinet axes (drawing X, drawing Y). */
export function project(part: Part, ax: Axis, ay: Axis): Range2 {
  const b = part.bounds
  return { x0: b.min[ax], x1: b.max[ax], y0: b.min[ay], y1: b.max[ay] }
}

export function union(ranges: readonly Range2[]): Range2 | null {
  const finite = ranges.filter((r) => [r.x0, r.x1, r.y0, r.y1].every(Number.isFinite))
  if (finite.length === 0) return null
  return {
    x0: Math.min(...finite.map((r) => Math.min(r.x0, r.x1))),
    x1: Math.max(...finite.map((r) => Math.max(r.x0, r.x1))),
    y0: Math.min(...finite.map((r) => Math.min(r.y0, r.y1))),
    y1: Math.max(...finite.map((r) => Math.max(r.y0, r.y1))),
  }
}

export function panelToCabinet(part: Part, px: Mm, py: Mm): Vec3 {
  const p: Vec3 = { x: part.bounds.min.x, y: part.bounds.min.y, z: part.bounds.min.z }
  return {
    ...p,
    [part.axes.length]: part.bounds.min[part.axes.length] + px,
    [part.axes.width]: part.bounds.min[part.axes.width] + py,
    [part.axes.thickness]: part.bounds.max[part.axes.thickness],
  }
}

function label(part: Part): string {
  return `${part.role} ${part.name}`.toLowerCase()
}

function holes(part: Part, purpose: HoleOp['purpose']): HoleOp[] {
  return part.ops.filter((o): o is HoleOp => o.kind === 'hole' && o.purpose === purpose)
}

export function isDoor(part: Part): boolean {
  return part.group === 'front' && (label(part).includes('door') || holes(part, 'hinge-cup').length > 0)
}

export type HingeSide = 'left' | 'right'

/** Off-centre threshold (fraction of cabinet width) for the position heuristic. */
const OFF_CENTRE = 0.1

/**
 * Hinge side seen from the front. Evidence in order: hinge-cup ops, role/name
 * keywords, door position, the cabinet's single-door bays, then left.
 */
export function hingeSide(part: Part, cabinet: Cabinet): HingeSide {
  const mid = (part.bounds.min.x + part.bounds.max.x) / 2
  const cups = holes(part, 'hinge-cup')
  if (cups.length > 0) {
    const meanX = cups.reduce((s, c) => s + panelToCabinet(part, c.x, c.y).x, 0) / cups.length
    if (Math.abs(meanX - mid) > 1e-6) return meanX < mid ? 'left' : 'right'
  }
  const text = label(part)
  if (text.includes('right')) return 'right'
  if (text.includes('left')) return 'left'
  const cabMid = cabinet.width / 2
  if (Math.abs(mid - cabMid) > cabinet.width * OFF_CENTRE) return mid < cabMid ? 'left' : 'right'
  const singles = cabinet.sections.flatMap((s) => s.bays).filter((b) => b.kind === 'door' && b.doorCount === 1)
  const first = singles[0]
  if (first && singles.every((b) => b.hingeSide === first.hingeSide)) return first.hingeSide
  return 'left'
}

/** Pull hole centres of a front, in cabinet space. */
export function pullPoints(part: Part): Vec3[] {
  return holes(part, 'pull').map((h) => panelToCabinet(part, h.x, h.y))
}
