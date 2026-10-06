import type { Axis, Box3, Grain, Id, Mm, PanelFrame, Part, PartGroup, SignedAxis } from '@/core/types'
import { round } from '@/core/units'
import { frameFrom, parseAxis } from './frame'

/** Engine parts always carry a frame. */
export type FramedPart = Part & { frame: PanelFrame }

export interface PartSpec {
  cabinetId: Id
  role: string
  name: string
  group: PartGroup
  materialId: Id
  grain: Grain
  /** Cabinet-space bounds; thickness is the extent along the face A normal. */
  bounds: Box3
  /** Cabinet direction of panel +x (part length, grain direction). */
  length: SignedAxis
  /** Outward normal of face A. */
  faceA: SignedAxis
}

/** Coordinates are kept to 1/1000 mm so float noise never reaches the cut list. */
const COORD_DECIMALS = 3

export interface Span {
  lo: Mm
  hi: Mm
}

export function span(lo: Mm, hi: Mm): Span {
  return { lo, hi }
}

export function spanSize(s: Span): Mm {
  return s.hi - s.lo
}

export function spanMid(s: Span): Mm {
  return (s.lo + s.hi) / 2
}

/** Intersection of two spans (may be empty: hi < lo). */
export function intersectSpan(a: Span, b: Span): Span {
  return { lo: Math.max(a.lo, b.lo), hi: Math.min(a.hi, b.hi) }
}

export function box(x0: Mm, x1: Mm, y0: Mm, y1: Mm, z0: Mm, z1: Mm): Box3 {
  return { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } }
}

/** Box from three spans (x, y, z). */
export function boxOf(x: Span, y: Span, z: Span): Box3 {
  return box(x.lo, x.hi, y.lo, y.hi, z.lo, z.hi)
}

export function extent(b: Box3, axis: Axis): Mm {
  return b.max[axis] - b.min[axis]
}

function roundBox(b: Box3): Box3 {
  const r = (v: number): number => round(v, COORD_DECIMALS)
  return box(r(b.min.x), r(b.max.x), r(b.min.y), r(b.max.y), r(b.min.z), r(b.max.z))
}

/** Build a Part from its cabinet-space box; length/width/thickness come from the frame axes. */
export function makePart(spec: PartSpec): FramedPart {
  const frame = frameFrom(spec.length, spec.faceA)
  const bounds = roundBox(spec.bounds)
  const lengthAxis = parseAxis(frame.x).axis
  const widthAxis = parseAxis(frame.y).axis
  const thicknessAxis = parseAxis(frame.z).axis
  return {
    id: `${spec.cabinetId}:${spec.role}`,
    cabinetId: spec.cabinetId,
    name: spec.name,
    group: spec.group,
    role: spec.role,
    length: round(extent(bounds, lengthAxis), COORD_DECIMALS),
    width: round(extent(bounds, widthAxis), COORD_DECIMALS),
    thickness: round(extent(bounds, thicknessAxis), COORD_DECIMALS),
    materialId: spec.materialId,
    grain: spec.grain,
    bounds,
    axes: { length: lengthAxis, width: widthAxis, thickness: thicknessAxis },
    ops: [],
    frame,
  }
}
