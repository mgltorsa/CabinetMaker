/**
 * Small builders for catalog primitives, so asset definitions read as
 * "a box spanning x0..x1, y0..y1, z0..z1" rather than centres and sizes.
 */
import type { BoxPrimitive, CylinderPrimitive, MaterialRole, SpherePrimitive, TorusPrimitive, Tuple3 } from './types'

export type Range = readonly [number, number]

const HALF_TURN = Math.PI / 2

/** Box filling the given ranges (any order of ends). */
export function span(role: MaterialRole, x: Range, y: Range, z: Range, color?: string): BoxPrimitive {
  const lo = (r: Range): number => Math.min(r[0], r[1])
  const hi = (r: Range): number => Math.max(r[0], r[1])
  return {
    kind: 'box',
    role,
    position: [(lo(x) + hi(x)) / 2, (lo(y) + hi(y)) / 2, (lo(z) + hi(z)) / 2],
    size: [hi(x) - lo(x), hi(y) - lo(y), hi(z) - lo(z)],
    ...(color ? { color } : {}),
  }
}

export interface CylinderOptions {
  /** Top radius when it differs from the bottom (cones, shades). */
  radiusTop?: number
  openEnded?: boolean
  color?: string
}

/** Upright cylinder standing on `y0` at (x, z). */
export function post(role: MaterialRole, x: number, z: number, y0: number, height: number, radius: number, options: CylinderOptions = {}): CylinderPrimitive {
  return {
    kind: 'cylinder',
    role,
    position: [x, y0 + height / 2, z],
    radiusTop: options.radiusTop ?? radius,
    radiusBottom: radius,
    height,
    ...(options.openEnded ? { openEnded: true } : {}),
    ...(options.color ? { color: options.color } : {}),
  }
}

/** Horizontal cylinder along X, centred on `centre`. */
export function barX(role: MaterialRole, centre: Tuple3, length: number, radius: number): CylinderPrimitive {
  return { kind: 'cylinder', role, position: centre, rotation: [0, 0, HALF_TURN], radiusTop: radius, radiusBottom: radius, height: length }
}

/** Horizontal cylinder along Z, centred on `centre`. */
export function barZ(role: MaterialRole, centre: Tuple3, length: number, radius: number): CylinderPrimitive {
  return { kind: 'cylinder', role, position: centre, rotation: [HALF_TURN, 0, 0], radiusTop: radius, radiusBottom: radius, height: length }
}

export function ball(role: MaterialRole, centre: Tuple3, radius: number, color?: string): SpherePrimitive {
  return { kind: 'sphere', role, position: centre, radius, ...(color ? { color } : {}) }
}

/** Ring lying flat (in the XZ plane). */
export function flatRing(role: MaterialRole, centre: Tuple3, radius: number, tube: number): TorusPrimitive {
  return { kind: 'torus', role, position: centre, rotation: [HALF_TURN, 0, 0], radius, tube }
}

/** `dim × fraction`, capped at `cap`: a detail that keeps its real size on big assets and shrinks on small ones. */
export function detail(dim: number, fraction: number, cap: number): number {
  return Math.min(dim * fraction, cap)
}
