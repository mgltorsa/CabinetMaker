/**
 * Geometry helpers on primitives: Euler rotation, quaternions (for glTF) and
 * conservative axis-aligned bounds (for fit checks and selection boxes).
 */
import type { Primitive, Tuple3 } from './types'

export interface Bounds3 {
  min: Tuple3
  max: Tuple3
}

/** Rotate `v` by Euler angles in three.js 'XYZ' order (matrix Rx · Ry · Rz). */
export function rotateEuler(v: Tuple3, euler: Tuple3): Tuple3 {
  const [ax, ay, az] = euler
  const [x0, y0, z0] = v
  // Rz, then Ry, then Rx.
  const x1 = x0 * Math.cos(az) - y0 * Math.sin(az)
  const y1 = x0 * Math.sin(az) + y0 * Math.cos(az)
  const x2 = x1 * Math.cos(ay) + z0 * Math.sin(ay)
  const z2 = -x1 * Math.sin(ay) + z0 * Math.cos(ay)
  const y3 = y1 * Math.cos(ax) - z2 * Math.sin(ax)
  const z3 = y1 * Math.sin(ax) + z2 * Math.cos(ax)
  return [x2, y3, z3]
}

/** Unit quaternion `[x, y, z, w]` for Euler angles in 'XYZ' order (same as three.js). */
export function eulerToQuaternion(euler: Tuple3): [number, number, number, number] {
  const [c1, c2, c3] = euler.map((a) => Math.cos(a / 2)) as [number, number, number]
  const [s1, s2, s3] = euler.map((a) => Math.sin(a / 2)) as [number, number, number]
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}

/** Half extents of the primitive in its own (unrotated) frame. */
export function localHalfExtents(p: Primitive): Tuple3 {
  switch (p.kind) {
    case 'box':
      return [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2]
    case 'cylinder': {
      const r = Math.max(p.radiusTop, p.radiusBottom)
      return [r, p.height / 2, r]
    }
    case 'sphere':
      return [p.radius, p.radius, p.radius]
    case 'torus':
      return [p.radius + p.tube, p.radius + p.tube, p.tube]
  }
}

/** Axis-aligned bounds of the primitive in asset space (exact for boxes and quarter-turn rotations). */
export function primitiveBounds(p: Primitive): Bounds3 {
  const [hx, hy, hz] = localHalfExtents(p)
  const rotation = p.rotation ?? [0, 0, 0]
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const c = rotateEuler([sx * hx, sy * hy, sz * hz], rotation)
        for (let k = 0; k < 3; k++) {
          const v = c[k]! + p.position[k]!
          min[k] = Math.min(min[k]!, v)
          max[k] = Math.max(max[k]!, v)
        }
      }
    }
  }
  return { min: [min[0]!, min[1]!, min[2]!], max: [max[0]!, max[1]!, max[2]!] }
}

/** Every dimension of the primitive is a positive finite number. */
export function hasPositiveDims(p: Primitive): boolean {
  const dims = p.kind === 'box' ? [...p.size] : p.kind === 'cylinder' ? [p.height, Math.max(p.radiusTop, p.radiusBottom)] : p.kind === 'sphere' ? [p.radius] : [p.radius, p.tube]
  const radiiOk = p.kind !== 'cylinder' || (p.radiusTop >= 0 && p.radiusBottom >= 0)
  return radiiOk && dims.every((d) => Number.isFinite(d) && d > 0)
}
