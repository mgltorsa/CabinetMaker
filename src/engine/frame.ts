/**
 * Signed axes and the panel ↔ cabinet space transform.
 *
 * Every engine part carries a right-handed `PanelFrame`: panel +x runs along
 * the part length, +y along its width, +z out of face A. Rules compute op
 * positions in cabinet space (where joints and hinges are easy to reason
 * about) and convert them to panel space here, so ops can never be mirrored.
 */
import type { Axis, Box3, Face, PanelFrame, SignedAxis, Vec3 } from '@/core/types'

export interface Direction {
  axis: Axis
  sign: 1 | -1
}

export interface PanelPoint {
  x: number
  y: number
  z: number
}

/** Anything with bounds and a frame (an engine part). */
export interface Framed {
  bounds: Box3
  frame: PanelFrame
}

const PANEL_AXES = ['x', 'y', 'z'] as const

const DIRECTIONS: Record<SignedAxis, Direction> = {
  '+x': { axis: 'x', sign: 1 },
  '-x': { axis: 'x', sign: -1 },
  '+y': { axis: 'y', sign: 1 },
  '-y': { axis: 'y', sign: -1 },
  '+z': { axis: 'z', sign: 1 },
  '-z': { axis: 'z', sign: -1 },
}

const SIGNED: Record<Axis, { pos: SignedAxis; neg: SignedAxis }> = {
  x: { pos: '+x', neg: '-x' },
  y: { pos: '+y', neg: '-y' },
  z: { pos: '+z', neg: '-z' },
}

export function parseAxis(s: SignedAxis): Direction {
  return DIRECTIONS[s]
}

export function signedAxis(axis: Axis, sign: 1 | -1): SignedAxis {
  return sign > 0 ? SIGNED[axis].pos : SIGNED[axis].neg
}

export function negate(s: SignedAxis): SignedAxis {
  const d = parseAxis(s)
  return signedAxis(d.axis, d.sign > 0 ? -1 : 1)
}

const CYCLIC: Record<Axis, Axis> = { x: 'y', y: 'z', z: 'x' }

/** The axis perpendicular to two different axes. */
export function thirdAxis(a: Axis, b: Axis): Axis {
  if (a === b) throw new Error(`No third axis for ${a} and ${b}`)
  return CYCLIC[a] === b ? CYCLIC[b] : CYCLIC[a]
}

/** Cross product of two perpendicular unit axes. */
export function cross(a: SignedAxis, b: SignedAxis): SignedAxis {
  const da = parseAxis(a)
  const db = parseAxis(b)
  if (da.axis === db.axis) throw new Error(`Cannot cross parallel axes ${a} and ${b}`)
  const third = thirdAxis(da.axis, db.axis)
  const cyclic = CYCLIC[da.axis] === db.axis
  const sign = da.sign * db.sign * (cyclic ? 1 : -1)
  return signedAxis(third, sign > 0 ? 1 : -1)
}

/** Right-handed frame from the length direction and the face A normal. */
export function frameFrom(length: SignedAxis, faceA: SignedAxis): PanelFrame {
  return { x: length, y: cross(faceA, length), z: faceA }
}

function originOn(bounds: Box3, d: Direction): number {
  return d.sign > 0 ? bounds.min[d.axis] : bounds.max[d.axis]
}

export function cabinetToPanel(part: Framed, p: Vec3): PanelPoint {
  const out = { x: 0, y: 0, z: 0 }
  for (const k of PANEL_AXES) {
    const d = parseAxis(part.frame[k])
    out[k] = d.sign * (p[d.axis] - originOn(part.bounds, d))
  }
  return out
}

export function panelToCabinet(part: Framed, p: PanelPoint): Vec3 {
  const out = { x: 0, y: 0, z: 0 }
  for (const k of PANEL_AXES) {
    const d = parseAxis(part.frame[k])
    out[d.axis] = originOn(part.bounds, d) + d.sign * p[k]
  }
  return out
}

/** The face whose outward normal points along `normal`. */
export function faceForNormal(frame: PanelFrame, normal: SignedAxis): Face {
  if (normal === frame.z) return 'A'
  if (normal === negate(frame.z)) return 'B'
  if (normal === negate(frame.x)) return 'edge-x0'
  if (normal === frame.x) return 'edge-x1'
  if (normal === negate(frame.y)) return 'edge-y0'
  return 'edge-y1'
}
