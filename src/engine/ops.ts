/**
 * Op builders. Rules describe an op in cabinet space (an entry point on the
 * part surface plus the outward normal of that surface) and these helpers
 * convert it to panel space.
 *
 * Panel-space conventions for ops:
 * - Faces A/B: `x` along the part length, `y` along its width.
 * - Edge faces (`edge-x0/x1` are the ends at panel x = 0 / length, `edge-y0/y1`
 *   the long edges at y = 0 / width): `x` is the position along that edge
 *   (panel y for edge-x*, panel x for edge-y*) and `y` is the position through
 *   the thickness, measured from face B. A mortise `axis` on an edge is 'x'
 *   when its long side runs along the edge.
 */
import type { Axis, DadoOp, Face, HoleOp, Id, Mm, MortiseOp, Op, OpPurpose, Part, SignedAxis, Vec3 } from '@/core/types'
import { round } from '@/core/units'
import { cabinetToPanel, faceForNormal, parseAxis } from './frame'
import type { FramedPart } from './geometry'

type Draft<T> = Omit<T, 'id'>
export type OpDraft = Draft<HoleOp> | Draft<DadoOp> | Draft<MortiseOp>

export interface PlacedOp {
  partId: Id
  op: OpDraft
}

const OP_DECIMALS = 3

interface SurfacePoint {
  face: Face
  x: Mm
  y: Mm
}

function isEdge(face: Face): boolean {
  return face !== 'A' && face !== 'B'
}

function surfacePoint(part: FramedPart, p: Vec3, normal: SignedAxis): SurfacePoint {
  const face = faceForNormal(part.frame, normal)
  const q = cabinetToPanel(part, p)
  const r = (v: number): number => round(v, OP_DECIMALS)
  if (face === 'edge-x0' || face === 'edge-x1') return { face, x: r(q.y), y: r(q.z) }
  if (face === 'edge-y0' || face === 'edge-y1') return { face, x: r(q.x), y: r(q.z) }
  return { face, x: r(q.x), y: r(q.y) }
}

/** Which op-space axis ('x' | 'y') a cabinet axis maps to on a given face. */
function opAxisFor(part: FramedPart, face: Face, cabinetAxis: Axis): 'x' | 'y' {
  const xAxis = parseAxis(part.frame.x).axis
  const yAxis = parseAxis(part.frame.y).axis
  if (!isEdge(face)) return xAxis === cabinetAxis ? 'x' : 'y'
  const alongEdge = face === 'edge-x0' || face === 'edge-x1' ? yAxis : xAxis
  return alongEdge === cabinetAxis ? 'x' : 'y'
}

export interface HoleSpec {
  diameter: Mm
  depth: Mm
  purpose: OpPurpose
}

export function holeOp(part: FramedPart, at: Vec3, normal: SignedAxis, spec: HoleSpec): PlacedOp {
  const s = surfacePoint(part, at, normal)
  return { partId: part.id, op: { kind: 'hole', face: s.face, x: s.x, y: s.y, diameter: spec.diameter, depth: spec.depth, purpose: spec.purpose } }
}

export interface DadoSpec {
  width: Mm
  depth: Mm
  purpose: OpPurpose
}

export function dadoOp(part: FramedPart, from: Vec3, to: Vec3, normal: SignedAxis, spec: DadoSpec): PlacedOp {
  const a = surfacePoint(part, from, normal)
  const b = surfacePoint(part, to, normal)
  return {
    partId: part.id,
    op: { kind: 'dado', face: a.face, x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: spec.width, depth: spec.depth, purpose: spec.purpose },
  }
}

export interface MortiseSpec {
  length: Mm
  width: Mm
  depth: Mm
  purpose: OpPurpose
}

export function mortiseOp(part: FramedPart, at: Vec3, normal: SignedAxis, longAxis: Axis, spec: MortiseSpec): PlacedOp {
  const s = surfacePoint(part, at, normal)
  return {
    partId: part.id,
    op: {
      kind: 'mortise',
      face: s.face,
      x: s.x,
      y: s.y,
      length: spec.length,
      width: spec.width,
      depth: spec.depth,
      axis: opAxisFor(part, s.face, longAxis),
      purpose: spec.purpose,
    },
  }
}

/**
 * Return new parts with their ops attached. Op ids are deterministic:
 * `${partId}#${purpose}-${n}`, numbered per part and purpose in rule order.
 */
export function attachOps<P extends Part>(parts: readonly P[], placed: readonly PlacedOp[]): P[] {
  const byPart = new Map<Id, OpDraft[]>()
  for (const p of parts) byPart.set(p.id, [])
  for (const { partId, op } of placed) {
    const list = byPart.get(partId)
    if (!list) throw new Error(`Op targets unknown part ${partId}`)
    list.push(op)
  }
  return parts.map((part) => {
    const counters = new Map<OpPurpose, number>()
    const ops = (byPart.get(part.id) ?? []).map((draft): Op => {
      const n = (counters.get(draft.purpose) ?? 0) + 1
      counters.set(draft.purpose, n)
      return { ...draft, id: `${part.id}#${draft.purpose}-${n}` }
    })
    return { ...part, ops: [...part.ops, ...ops] }
  })
}
