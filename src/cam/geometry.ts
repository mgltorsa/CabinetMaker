/** Small geometry helpers shared by the toolpath generators. */
import type { Mm, Vec3 } from '@/core/types'

/** Output resolution: G-code numbers carry 3 decimals. */
export const OUTPUT_DECIMALS = 3
const OUTPUT_SCALE = 10 ** OUTPUT_DECIMALS

/** Fewest segments used to approximate any circle. */
export const MIN_CIRCLE_SEGMENTS = 8

/** Round to the output resolution (0.001 mm), avoiding `-0`. */
export function roundMm(value: number): number {
  const r = Math.round(value * OUTPUT_SCALE) / OUTPUT_SCALE
  return Object.is(r, -0) ? 0 : r
}

export function roundPoint(p: Vec3): Vec3 {
  return { x: roundMm(p.x), y: roundMm(p.y), z: roundMm(p.z) }
}

function samePoint(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}

/**
 * Round a pass to output resolution and drop consecutive duplicates, so the
 * emitted G-code reproduces the pass exactly (see the round-trip tests).
 */
export function cleanPass(points: readonly Vec3[]): Vec3[] {
  return points.map(roundPoint).filter((p, i, all) => {
    const prev = all[i - 1]
    return prev === undefined || !samePoint(prev, p)
  })
}

/**
 * Positive cut depths from the top of stock, evenly spaced so that no pass
 * removes more than `stepDown`. The last level equals `total`.
 */
export function depthLevels(total: Mm, stepDown: Mm): Mm[] {
  if (!(stepDown > 0)) throw new Error(`depthLevels: stepDown must be > 0 (got ${stepDown})`)
  if (!(total > 0)) return []
  const count = Math.ceil(total / stepDown - 1e-9)
  return Array.from({ length: count }, (_, i) => roundMm((total * (i + 1)) / count))
}

/** Segments needed so a polygon inscribed in a circle of `radius` deviates ≤ `chordError`. */
export function circleSegments(radius: Mm, chordError: Mm): number {
  if (radius <= chordError) return MIN_CIRCLE_SEGMENTS
  const n = Math.ceil(Math.PI / Math.acos(1 - chordError / radius))
  return Math.max(MIN_CIRCLE_SEGMENTS, n)
}

export interface Vec2Like {
  x: Mm
  y: Mm
}

/** Unit vector from a to b, or null when the points coincide. */
export function unitVector(a: Vec2Like, b: Vec2Like): Vec2Like | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return null
  return { x: dx / len, y: dy / len }
}
