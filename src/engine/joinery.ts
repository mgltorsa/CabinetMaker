/**
 * Generic panel joint: an `inserted` part whose end butts against (or runs
 * into a dado in) a face of a `receiver` part.
 *
 * - dado: a groove in the receiver exactly covering where the parts overlap
 *   (the inserted part is sized to run into it). Also used for back grooves
 *   and drawer-bottom grooves.
 * - dowel / domino: face bores (or mortises) in the receiver plus matching
 *   bores in the inserted part's end (an edge face, reported by CAM as manual).
 * - none: butt joint, screwed or glued; no ops.
 */
import type { Axis, Box3, HardwareItem, Id, JoineryType, Mm, OpPurpose, SignedAxis, Vec3 } from '@/core/types'
import {
  DEFAULT_DOMINO,
  DEFAULT_DOWEL,
  DOMINO_TENON_WIDTH,
  FASTENER_GLUE_CLEARANCE,
  JOINT_END_INSET,
  JOINT_FACE_DEPTH_RATIO,
  JOINT_MAX_PITCH,
  MIN_WEB_BETWEEN_HOLES,
} from './constants'
import type { HardwareNeed } from './context'
import { negate, parseAxis, thirdAxis } from './frame'
import { span, spanMid, spanSize, type FramedPart, type Span } from './geometry'
import { dadoOp, holeOp, mortiseOp, type PlacedOp } from './ops'

const TOL = 0.01

export interface Fasteners {
  dowel: { hardwareId: Id | null; diameter: Mm; length: Mm }
  domino: { hardwareId: Id | null; thickness: Mm; length: Mm }
}

export function resolveFasteners(catalog: readonly HardwareItem[]): Fasteners {
  const dowel = catalog.find((h) => h.kind === 'dowel')
  const domino = catalog.find((h) => h.kind === 'domino')
  return {
    dowel: {
      hardwareId: dowel?.id ?? null,
      diameter: dowel?.props.diameter ?? DEFAULT_DOWEL.diameter,
      length: dowel?.props.length ?? DEFAULT_DOWEL.length,
    },
    domino: {
      hardwareId: domino?.id ?? null,
      thickness: domino?.props.thickness ?? DEFAULT_DOMINO.thickness,
      length: domino?.props.length ?? DEFAULT_DOMINO.length,
    },
  }
}

export interface JointSpec {
  receiver: FramedPart
  inserted: FramedPart
  /** Outward normal of the receiving face (points from receiver toward the inserted part). */
  normal: SignedAxis
  /** Cabinet axis along which fasteners are spaced (the joint line). */
  along: Axis
  method: JoineryType
  /** Op purpose for dado-type joints. */
  purpose?: Extract<OpPurpose, 'dado' | 'back-groove' | 'bottom-groove'>
  /** The receiver may be drilled from its other face too (dividers): keep blind holes shallow. */
  doubleSided?: boolean
}

export interface JointResult {
  ops: PlacedOp[]
  hardware: HardwareNeed[]
}

const NONE: JointResult = { ops: [], hardware: [] }

function axisSpan(b: Box3, axis: Axis): Span {
  return span(b.min[axis], b.max[axis])
}

function overlap(a: Span, b: Span): Span {
  return span(Math.max(a.lo, b.lo), Math.min(a.hi, b.hi))
}

function point(coords: Partial<Record<Axis, Mm>>): Vec3 {
  return { x: coords.x ?? 0, y: coords.y ?? 0, z: coords.z ?? 0 }
}

/** Evenly spaced fastener positions along a joint, inset from both ends. */
export function fastenerPositions(along: Span, fastenerSize: Mm): Mm[] {
  const len = spanSize(along)
  if (len < fastenerSize + 2 * MIN_WEB_BETWEEN_HOLES) return []
  if (len < 4 * fastenerSize) return [spanMid(along)]
  const e = Math.max(fastenerSize / 2 + MIN_WEB_BETWEEN_HOLES, Math.min(JOINT_END_INSET, len / 4))
  const count = Math.max(2, Math.ceil((len - 2 * e) / JOINT_MAX_PITCH) + 1)
  const step = (len - 2 * e) / (count - 1)
  return Array.from({ length: count }, (_, i) => along.lo + e + i * step)
}

export function jointOps(spec: JointSpec, fasteners: Fasteners): JointResult {
  if (spec.method === 'none') return NONE
  return spec.method === 'dado' ? dadoJoint(spec) : fastenedJoint(spec, fasteners)
}

function dadoJoint(spec: JointSpec): JointResult {
  const { receiver, inserted, normal, along } = spec
  const n = parseAxis(normal)
  const across = thirdAxis(n.axis, along)
  const o = {
    n: overlap(axisSpan(receiver.bounds, n.axis), axisSpan(inserted.bounds, n.axis)),
    along: overlap(axisSpan(receiver.bounds, along), axisSpan(inserted.bounds, along)),
    across: overlap(axisSpan(receiver.bounds, across), axisSpan(inserted.bounds, across)),
  }
  if (spanSize(o.n) <= TOL || spanSize(o.along) <= TOL || spanSize(o.across) <= TOL) return NONE
  const surface = n.sign > 0 ? receiver.bounds.max[n.axis] : receiver.bounds.min[n.axis]
  const mid = spanMid(o.across)
  const from = point({ [n.axis]: surface, [across]: mid, [along]: o.along.lo })
  const to = point({ [n.axis]: surface, [across]: mid, [along]: o.along.hi })
  const op = dadoOp(receiver, from, to, normal, { width: spanSize(o.across), depth: spanSize(o.n), purpose: spec.purpose ?? 'dado' })
  return { ops: [op], hardware: [] }
}

function fastenedJoint(spec: JointSpec, fasteners: Fasteners): JointResult {
  const { receiver, inserted, normal, along } = spec
  const n = parseAxis(normal)
  const across = thirdAxis(n.axis, along)
  const surface = n.sign > 0 ? receiver.bounds.max[n.axis] : receiver.bounds.min[n.axis]
  const insertedEnd = n.sign > 0 ? inserted.bounds.min[n.axis] : inserted.bounds.max[n.axis]
  if (Math.abs(insertedEnd - surface) > TOL) return NONE
  const alongSpan = overlap(axisSpan(receiver.bounds, along), axisSpan(inserted.bounds, along))
  const acrossSpan = overlap(axisSpan(receiver.bounds, across), axisSpan(inserted.bounds, across))
  const domino = spec.method === 'domino'
  const fastenerWidth = domino ? fasteners.domino.thickness : fasteners.dowel.diameter
  const fastenerLength = domino ? fasteners.domino.length : fasteners.dowel.length
  if (spanSize(acrossSpan) < fastenerWidth + 2 * MIN_WEB_BETWEEN_HOLES) return NONE

  const receiverT = spanSize(axisSpan(receiver.bounds, n.axis))
  const maxFace = spec.doubleSided ? (receiverT - MIN_WEB_BETWEEN_HOLES) / 2 : receiverT - MIN_WEB_BETWEEN_HOLES
  const faceDepth = Math.floor(Math.min(receiverT * JOINT_FACE_DEPTH_RATIO, maxFace))
  const insertedDepthAvail = spanSize(axisSpan(inserted.bounds, n.axis))
  const edgeDepth = Math.min(fastenerLength - faceDepth + FASTENER_GLUE_CLEARANCE, insertedDepthAvail - MIN_WEB_BETWEEN_HOLES)
  if (faceDepth <= 0 || edgeDepth <= 0) return NONE

  const positions = fastenerPositions(alongSpan, domino ? DOMINO_TENON_WIDTH : fastenerWidth)
  const mid = spanMid(acrossSpan)
  const ops = positions.flatMap((a) => {
    const at = point({ [n.axis]: surface, [across]: mid, [along]: a })
    if (domino) {
      const dims = { length: DOMINO_TENON_WIDTH, width: fastenerWidth, purpose: 'domino' as const }
      return [mortiseOp(receiver, at, normal, along, { ...dims, depth: faceDepth }), mortiseOp(inserted, at, negate(normal), along, { ...dims, depth: edgeDepth })]
    }
    const dims = { diameter: fastenerWidth, purpose: 'dowel' as const }
    return [holeOp(receiver, at, normal, { ...dims, depth: faceDepth }), holeOp(inserted, at, negate(normal), { ...dims, depth: edgeDepth })]
  })
  const hardwareId = domino ? fasteners.domino.hardwareId : fasteners.dowel.hardwareId
  const hardware = hardwareId && positions.length > 0 ? [{ hardwareId, qty: positions.length, note: domino ? 'Domino tenons' : 'Dowels' }] : []
  return { ops, hardware }
}
