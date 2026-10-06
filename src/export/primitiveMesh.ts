/**
 * Triangle meshes for asset primitives (box, cylinder, sphere, torus) in the
 * primitive's own frame, centred on its origin, in metres. Faces wind
 * counter-clockwise seen from outside, normals point outward. Cylinders run
 * along local Y and tori lie in local XY, as in three.js.
 */
import type { Primitive } from '@/assets'
import { BOX_INDICES, BOX_NORMALS, boxPositions } from './box'

export interface TriMesh {
  positions: Float32Array
  normals: Float32Array
  indices: Uint16Array
}

const M_PER_MM = 0.001
const CYLINDER_SEGMENTS = 24
const SPHERE_WIDTH = 24
const SPHERE_HEIGHT = 16
const TORUS_RADIAL = 12
const TORUS_TUBULAR = 36

class MeshBuilder {
  readonly p: number[] = []
  readonly n: number[] = []
  readonly i: number[] = []

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    const len = Math.hypot(nx, ny, nz) || 1
    this.p.push(x, y, z)
    this.n.push(nx / len, ny / len, nz / len)
    return this.p.length / 3 - 1
  }

  tri(a: number, b: number, c: number): void {
    this.i.push(a, b, c)
  }

  build(): TriMesh {
    return { positions: Float32Array.from(this.p), normals: Float32Array.from(this.n), indices: Uint16Array.from(this.i) }
  }
}

function cylinder(rt: number, rb: number, h: number, openEnded: boolean): TriMesh {
  const m = new MeshBuilder()
  const slope = (rb - rt) / h
  const ring = (y: number, r: number): number[] =>
    Array.from({ length: CYLINDER_SEGMENTS + 1 }, (_, k) => {
      const a = (k / CYLINDER_SEGMENTS) * Math.PI * 2
      return m.vertex(r * Math.sin(a), y, r * Math.cos(a), Math.sin(a), slope, Math.cos(a))
    })
  const bottom = ring(-h / 2, rb)
  const top = ring(h / 2, rt)
  for (let k = 0; k < CYLINDER_SEGMENTS; k++) {
    m.tri(bottom[k]!, bottom[k + 1]!, top[k]!)
    m.tri(bottom[k + 1]!, top[k + 1]!, top[k]!)
  }
  if (!openEnded) {
    for (const [y, r, up] of [[h / 2, rt, 1], [-h / 2, rb, -1]] as const) {
      if (r <= 0) continue
      const centre = m.vertex(0, y, 0, 0, up, 0)
      const rim = Array.from({ length: CYLINDER_SEGMENTS + 1 }, (_, k) => {
        const a = (k / CYLINDER_SEGMENTS) * Math.PI * 2
        return m.vertex(r * Math.sin(a), y, r * Math.cos(a), 0, up, 0)
      })
      for (let k = 0; k < CYLINDER_SEGMENTS; k++) {
        if (up > 0) m.tri(centre, rim[k]!, rim[k + 1]!)
        else m.tri(centre, rim[k + 1]!, rim[k]!)
      }
    }
  }
  return m.build()
}

/** Same layout and winding as three.js SphereGeometry. */
function sphere(r: number): TriMesh {
  const m = new MeshBuilder()
  const grid: number[][] = []
  for (let iy = 0; iy <= SPHERE_HEIGHT; iy++) {
    const v = iy / SPHERE_HEIGHT
    const row: number[] = []
    for (let ix = 0; ix <= SPHERE_WIDTH; ix++) {
      const u = ix / SPHERE_WIDTH
      const x = -Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI)
      const y = Math.cos(v * Math.PI)
      const z = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI)
      row.push(m.vertex(x * r, y * r, z * r, x, y, z))
    }
    grid.push(row)
  }
  for (let iy = 0; iy < SPHERE_HEIGHT; iy++) {
    for (let ix = 0; ix < SPHERE_WIDTH; ix++) {
      const a = grid[iy]![ix + 1]!
      const b = grid[iy]![ix]!
      const c = grid[iy + 1]![ix]!
      const d = grid[iy + 1]![ix + 1]!
      if (iy !== 0) m.tri(a, b, d)
      if (iy !== SPHERE_HEIGHT - 1) m.tri(b, c, d)
    }
  }
  return m.build()
}

/** Same layout and winding as three.js TorusGeometry. */
function torus(radius: number, tube: number): TriMesh {
  const m = new MeshBuilder()
  for (let j = 0; j <= TORUS_RADIAL; j++) {
    const v = (j / TORUS_RADIAL) * Math.PI * 2
    for (let i = 0; i <= TORUS_TUBULAR; i++) {
      const u = (i / TORUS_TUBULAR) * Math.PI * 2
      const x = (radius + tube * Math.cos(v)) * Math.cos(u)
      const y = (radius + tube * Math.cos(v)) * Math.sin(u)
      const z = tube * Math.sin(v)
      m.vertex(x, y, z, x - radius * Math.cos(u), y - radius * Math.sin(u), z)
    }
  }
  const row = TORUS_TUBULAR + 1
  for (let j = 1; j <= TORUS_RADIAL; j++) {
    for (let i = 1; i <= TORUS_TUBULAR; i++) {
      const a = row * j + i - 1
      const b = row * (j - 1) + i - 1
      const c = row * (j - 1) + i
      const d = row * j + i
      m.tri(a, b, d)
      m.tri(b, c, d)
    }
  }
  return m.build()
}

/** The primitive's mesh in metres, centred on its own origin (apply `position` / `rotation` on the node). */
export function primitiveMesh(p: Primitive): TriMesh {
  switch (p.kind) {
    case 'box':
      return { positions: boxPositions([p.size[0] * M_PER_MM, p.size[1] * M_PER_MM, p.size[2] * M_PER_MM]), normals: BOX_NORMALS, indices: BOX_INDICES }
    case 'cylinder':
      return cylinder(p.radiusTop * M_PER_MM, p.radiusBottom * M_PER_MM, p.height * M_PER_MM, p.openEnded ?? false)
    case 'sphere':
      return sphere(p.radius * M_PER_MM)
    case 'torus':
      return torus(p.radius * M_PER_MM, p.tube * M_PER_MM)
  }
}
