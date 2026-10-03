/**
 * Structural checks on a build. Every problem is returned as an error
 * `BuildWarning`; an empty list means the build is self-consistent:
 * - positive, finite part dimensions; unique part and op ids;
 * - length / width / thickness agree with `bounds` and `axes` (and `frame`);
 * - every op lies inside its panel (holes and mortises fully, dados as a band)
 *   and is no deeper than the material allows;
 * - no two parts of a cabinet interpenetrate, except where the overlap is
 *   fully inside a dado/groove cut in one of them (joints, captured backs).
 */
import type { Box3, BuildWarning, CabinetBuild, DadoOp, Op, Part, ProjectBuild } from '@/core/types'
import { panelToCabinet, parseAxis, type Framed } from './frame'
import { extent } from './geometry'

const TOL = 0.01

function err(code: string, message: string, part?: Part): BuildWarning {
  return part ? { level: 'error', code, message, cabinetId: part.cabinetId, partId: part.id } : { level: 'error', code, message }
}

export function validateBuild(build: CabinetBuild | ProjectBuild): BuildWarning[] {
  const parts = build.parts
  return [...checkIds(parts), ...parts.flatMap(checkPart), ...checkOverlaps(parts)]
}

function checkIds(parts: readonly Part[]): BuildWarning[] {
  const out: BuildWarning[] = []
  const partIds = new Set<string>()
  const opIds = new Set<string>()
  for (const p of parts) {
    if (partIds.has(p.id)) out.push(err('duplicate-part-id', `Duplicate part id ${p.id}`, p))
    partIds.add(p.id)
    for (const op of p.ops) {
      if (opIds.has(op.id)) out.push(err('duplicate-op-id', `Duplicate op id ${op.id}`, p))
      opIds.add(op.id)
    }
  }
  return out
}

function checkPart(p: Part): BuildWarning[] {
  const dims = [p.length, p.width, p.thickness]
  if (!dims.every((v) => Number.isFinite(v) && v > 0)) {
    return [err('non-positive-dimension', `${p.id}: dimensions must be positive (${dims.join(' × ')})`, p)]
  }
  return [...checkAxes(p), ...p.ops.flatMap((op) => checkOp(p, op))]
}

function checkAxes(p: Part): BuildWarning[] {
  const { length, width, thickness } = p.axes
  if (new Set([length, width, thickness]).size !== 3) return [err('invalid-axes', `${p.id}: axes must be distinct`, p)]
  const expected: [string, number, number][] = [
    ['length', p.length, extent(p.bounds, length)],
    ['width', p.width, extent(p.bounds, width)],
    ['thickness', p.thickness, extent(p.bounds, thickness)],
  ]
  const out = expected
    .filter(([, value, fromBounds]) => Math.abs(value - fromBounds) > TOL)
    .map(([name, value, fromBounds]) => err('dimension-mismatch', `${p.id}: ${name} ${value} ≠ bounds ${fromBounds}`, p))
  if (p.frame) {
    const f = p.frame
    const ok = parseAxis(f.x).axis === length && parseAxis(f.y).axis === width && parseAxis(f.z).axis === thickness
    if (!ok) out.push(err('frame-mismatch', `${p.id}: frame does not match axes`, p))
  }
  return out
}

/** Panel-space extents of the face an op is on: [along x, along y, depth limit]. */
function faceExtents(p: Part, op: Op): [number, number, number] {
  switch (op.face) {
    case 'A':
    case 'B':
      return [p.length, p.width, p.thickness]
    case 'edge-x0':
    case 'edge-x1':
      return [p.width, p.thickness, p.length]
    default:
      return [p.length, p.thickness, p.width]
  }
}

function inside(lo: number, hi: number, max: number): boolean {
  return lo >= -TOL && hi <= max + TOL
}

function checkOp(p: Part, op: Op): BuildWarning[] {
  const [ex, ey, maxDepth] = faceExtents(p, op)
  const out: BuildWarning[] = []
  if (!(op.depth > 0) || op.depth > maxDepth + TOL) out.push(err('op-too-deep', `${op.id}: depth ${op.depth} exceeds ${maxDepth}`, p))
  let fits: boolean
  if (op.kind === 'hole') {
    const r = op.diameter / 2
    fits = inside(op.x - r, op.x + r, ex) && inside(op.y - r, op.y + r, ey)
  } else if (op.kind === 'mortise') {
    const [hx, hy] = op.axis === 'x' ? [op.length / 2, op.width / 2] : [op.width / 2, op.length / 2]
    fits = inside(op.x - hx, op.x + hx, ex) && inside(op.y - hy, op.y + hy, ey)
  } else {
    const band = dadoBand(op)
    fits = band !== null && inside(band.x0, band.x1, ex) && inside(band.y0, band.y1, ey)
  }
  if (!fits) out.push(err('op-outside-panel', `${op.id}: lies outside the ${p.role} panel`, p))
  return out
}

interface Band {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** Rectangle covered by an axis-aligned dado on its face; null for diagonal dados. */
function dadoBand(op: DadoOp): Band | null {
  const w = op.width / 2
  if (Math.abs(op.y1 - op.y2) <= TOL) return { x0: Math.min(op.x1, op.x2), x1: Math.max(op.x1, op.x2), y0: op.y1 - w, y1: op.y1 + w }
  if (Math.abs(op.x1 - op.x2) <= TOL) return { x0: op.x1 - w, x1: op.x1 + w, y0: Math.min(op.y1, op.y2), y1: Math.max(op.y1, op.y2) }
  return null
}

/** Cabinet-space box removed by a dado on face A or B (null when unknown). */
export function dadoRegion(p: Part, op: DadoOp): Box3 | null {
  if (!p.frame || (op.face !== 'A' && op.face !== 'B')) return null
  const band = dadoBand(op)
  if (!band) return null
  const framed: Framed = { bounds: p.bounds, frame: p.frame }
  const z0 = op.face === 'A' ? p.thickness - op.depth : 0
  const z1 = op.face === 'A' ? p.thickness : op.depth
  const a = panelToCabinet(framed, { x: band.x0, y: band.y0, z: z0 })
  const b = panelToCabinet(framed, { x: band.x1, y: band.y1, z: z1 })
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  }
}

function intersection(a: Box3, b: Box3): Box3 | null {
  const min = { x: Math.max(a.min.x, b.min.x), y: Math.max(a.min.y, b.min.y), z: Math.max(a.min.z, b.min.z) }
  const max = { x: Math.min(a.max.x, b.max.x), y: Math.min(a.max.y, b.max.y), z: Math.min(a.max.z, b.max.z) }
  if (max.x - min.x <= TOL || max.y - min.y <= TOL || max.z - min.z <= TOL) return null
  return { min, max }
}

function contains(outer: Box3, inner: Box3): boolean {
  return (['x', 'y', 'z'] as const).every((k) => inner.min[k] >= outer.min[k] - TOL && inner.max[k] <= outer.max[k] + TOL)
}

function explained(o: Box3, a: Part, b: Part): boolean {
  return [a, b].some((p) =>
    p.ops.some((op) => {
      if (op.kind !== 'dado') return false
      const region = dadoRegion(p, op)
      return region !== null && contains(region, o)
    }),
  )
}

function checkOverlaps(parts: readonly Part[]): BuildWarning[] {
  const out: BuildWarning[] = []
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i]!
    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j]!
      if (a.cabinetId !== b.cabinetId) continue
      const o = intersection(a.bounds, b.bounds)
      if (o && !explained(o, a, b)) out.push(err('parts-overlap', `${a.id} and ${b.id} interpenetrate`, a))
    }
  }
  return out
}
