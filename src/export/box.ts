/**
 * Axis-aligned box mesh centred on the origin: 6 faces × 4 vertices so every
 * face has its own flat normal, two counter-clockwise (outward) triangles per face.
 */

type V3 = readonly [number, number, number]

interface FaceBasis {
  /** Outward normal. */
  n: V3
  /** In-face axes with u × v = n, so the corner order below winds counter-clockwise. */
  u: V3
  v: V3
}

const X: V3 = [1, 0, 0]
const Y: V3 = [0, 1, 0]
const Z: V3 = [0, 0, 1]
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]]

const FACES: readonly FaceBasis[] = [
  { n: X, u: Y, v: Z },
  { n: neg(X), u: Z, v: Y },
  { n: Y, u: Z, v: X },
  { n: neg(Y), u: X, v: Z },
  { n: Z, u: X, v: Y },
  { n: neg(Z), u: Y, v: X },
]

/** Corner signs (u, v) in counter-clockwise order. */
const CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

export const BOX_VERTEX_COUNT = FACES.length * CORNERS.length
export const BOX_INDEX_COUNT = FACES.length * 6

/** Flat normals, one per vertex (shared by every box). */
export const BOX_NORMALS: Float32Array = Float32Array.from(FACES.flatMap((f) => CORNERS.flatMap(() => [...f.n])))

/** Two triangles per face (shared by every box). */
export const BOX_INDICES: Uint16Array = Uint16Array.from(
  FACES.flatMap((_, i) => {
    const o = i * CORNERS.length
    return [o, o + 1, o + 2, o, o + 2, o + 3]
  }),
)

/** Vertex positions of a box with the given full size, centred on the origin. */
export function boxPositions(size: V3): Float32Array {
  const h: V3 = [size[0] / 2, size[1] / 2, size[2] / 2]
  return Float32Array.from(
    FACES.flatMap((f) =>
      CORNERS.flatMap(([su, sv]) => [0, 1, 2].map((k) => (f.n[k]! + su * f.u[k]! + sv * f.v[k]!) * h[k]!)),
    ),
  )
}
