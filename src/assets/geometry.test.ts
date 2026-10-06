import { describe, expect, it } from 'vitest'
import { eulerToQuaternion, hasPositiveDims, primitiveBounds, rotateEuler } from './geometry'
import { barX, barZ, flatRing, post, span } from './shapes'

const close = (a: readonly number[], b: readonly number[]): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9))

/** Rotate by quaternion q = [x, y, z, w]. */
function rotateQ(v: readonly number[], q: readonly number[]): number[] {
  const [x, y, z] = v as [number, number, number]
  const [qx, qy, qz, qw] = q as [number, number, number, number]
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]
}

describe('rotateEuler', () => {
  it('turns +Y onto +X for a quarter turn about -Z, and onto +Z about +X', () => {
    close(rotateEuler([0, 1, 0], [0, 0, -Math.PI / 2]), [1, 0, 0])
    close(rotateEuler([0, 1, 0], [Math.PI / 2, 0, 0]), [0, 0, 1])
    close(rotateEuler([1, 0, 0], [0, Math.PI / 2, 0]), [0, 0, -1])
  })

  it('agrees with the quaternion for mixed angles (XYZ order)', () => {
    const e = [0.3, -1.1, 0.7] as const
    const v = [1, 2, 3] as const
    close(rotateEuler(v, e), rotateQ(v, eulerToQuaternion(e)))
  })
})

describe('primitiveBounds', () => {
  it('spans a box exactly', () => {
    expect(primitiveBounds(span('body', [-1, 3], [0, 2], [5, 4]))).toEqual({ min: [-1, 0, 4], max: [3, 2, 5] })
  })

  it('accounts for rotated cylinders and rings', () => {
    const along = primitiveBounds(barX('metal', [0, 10, 0], 100, 5))
    close(along.min, [-50, 5, -5])
    close(along.max, [50, 15, 5])
    const depth = primitiveBounds(barZ('metal', [0, 0, 0], 40, 2))
    close(depth.max, [2, 2, 20])
    const ring = primitiveBounds(flatRing('metal', [0, 1, 0], 10, 1))
    close(ring.max, [11, 2, 11])
    const cone = primitiveBounds(post('body', 0, 0, 0, 10, 5, { radiusTop: 8 }))
    close(cone.max, [8, 10, 8])
  })
})

describe('hasPositiveDims', () => {
  it('rejects zero or negative dimensions', () => {
    expect(hasPositiveDims(span('body', [0, 1], [0, 1], [0, 1]))).toBe(true)
    expect(hasPositiveDims(span('body', [0, 0], [0, 1], [0, 1]))).toBe(false)
    expect(hasPositiveDims(post('body', 0, 0, 0, 0, 1))).toBe(false)
    expect(hasPositiveDims(post('body', 0, 0, 0, 1, 1, { radiusTop: -1 }))).toBe(false)
    expect(hasPositiveDims(flatRing('metal', [0, 0, 0], 1, 0))).toBe(false)
  })
})
