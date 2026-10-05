/**
 * Where each pull of a front sits, in cabinet space (mm): derived from the
 * engine's pull holes (bar, knob, edge, cup, custom) or, for J-profiles, from
 * the front's grip edge. Pure; the 3D scene, the front elevation and the
 * Blender export all draw pulls from these placements.
 *
 * Grip edge (edge pulls, J-profiles): the top edge, except on wall-cabinet
 * doors, where it is the bottom edge (see `engine/pulls`).
 */
import { holesPerPull, type ResolvedHandle } from './handles'
import { panelToCabinet } from './panel'
import type { Axis, Cabinet, HandleStyle, HoleOp, Mm, Part, SignedAxis, Vec3 } from './types'

export interface PullPlacement {
  /** 0-based index of the pull on its front (stable ids). */
  index: number
  style: HandleStyle
  /** Centre of the pull on the show face. J-profile: the middle of the grip edge. */
  centre: Vec3
  /** Hole centres on the show face (0, 1 or 2). */
  holes: Vec3[]
  /** Unit vector along the pull's length. */
  along: Vec3
  /** Unit vector in the show face, across the pull; points at the grip edge for edge pulls and J-profiles. */
  up: Vec3
  /** Unit vector out of the show face. `along × up = normal` (right-handed). */
  normal: Vec3
  /** Distance from `centre` to the grip edge along `up` (edge pulls; 0 for J-profiles and the rest). */
  edgeDistance: Mm
  /** Length along `along` (J-profile: the front's width). */
  length: Mm
}

const AXIS_VECTORS: Record<SignedAxis, Vec3> = {
  '+x': { x: 1, y: 0, z: 0 },
  '-x': { x: -1, y: 0, z: 0 },
  '+y': { x: 0, y: 1, z: 0 },
  '-y': { x: 0, y: -1, z: 0 },
  '+z': { x: 0, y: 0, z: 1 },
  '-z': { x: 0, y: 0, z: -1 },
}

/** `|| 0` folds -0 into 0 so placements compare cleanly. */
const v3 = (x: number, y: number, z: number): Vec3 => ({ x: x || 0, y: y || 0, z: z || 0 })
const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z)
const neg = (a: Vec3): Vec3 => v3(-a.x, -a.y, -a.z)
const mid = (a: Vec3, b: Vec3): Vec3 => v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
function unit(a: Vec3): Vec3 {
  const n = Math.hypot(a.x, a.y, a.z)
  return n === 0 ? v3(1, 0, 0) : v3(a.x / n, a.y / n, a.z / n)
}

/** Unit vector out of the show face (face B; face A is the inside, where the holes are drilled from). */
function showNormal(part: Part): Vec3 {
  const faceA = part.frame ? part.frame.z : (`+${part.axes.thickness}` as SignedAxis)
  return neg(AXIS_VECTORS[faceA])
}

const axisOf = (v: Vec3): Axis => (Math.abs(v.x) >= Math.abs(v.y) && Math.abs(v.x) >= Math.abs(v.z) ? 'x' : Math.abs(v.y) >= Math.abs(v.z) ? 'y' : 'z')
const basis = (axis: Axis): Vec3 => AXIS_VECTORS[`+${axis}`]

/** The two cabinet axes of the show face. */
function faceAxes(normal: Vec3): [Axis, Axis] {
  const n = axisOf(normal)
  return n === 'x' ? ['y', 'z'] : n === 'y' ? ['x', 'z'] : ['x', 'y']
}

const extent = (part: Part, axis: Axis): Mm => part.bounds.max[axis] - part.bounds.min[axis]

/** Right-handed frame: flip `along` (pulls are symmetric along their length) when `along × up` points into the front. */
function frame(along: Vec3, up: Vec3, normal: Vec3): { along: Vec3; up: Vec3; normal: Vec3 } {
  return { along: dot(cross(along, up), normal) < 0 ? neg(along) : along, up, normal }
}

/** Unit vector across `along` in the face, toward the nearer front edge, and the distance to that edge. */
function towardNearEdge(part: Part, centre: Vec3, along: Vec3, normal: Vec3): { up: Vec3; distance: Mm } {
  const across = faceAxes(normal).find((a) => a !== axisOf(along)) ?? 'y'
  const toMax = part.bounds.max[across] - centre[across]
  const toMin = centre[across] - part.bounds.min[across]
  return toMax <= toMin ? { up: basis(across), distance: toMax } : { up: neg(basis(across)), distance: toMin }
}

function jProfile(part: Part, cabinet: Cabinet, handle: ResolvedHandle): PullPlacement[] {
  const normal = showNormal(part)
  const show = panelToCabinet(part, 0, 0, 0)
  const [a, b] = faceAxes(normal)
  // Fronts stand upright: the grip edge is a horizontal (y) edge and the profile runs across the front.
  const upAxis: Axis = a === 'y' || b === 'y' ? 'y' : b
  const alongAxis: Axis = upAxis === a ? b : a
  const atBottom = cabinet.type === 'wall' && isDoorPart(part)
  const centre: Vec3 = { ...show }
  centre[alongAxis] = (part.bounds.min[alongAxis] + part.bounds.max[alongAxis]) / 2
  centre[upAxis] = atBottom ? part.bounds.min[upAxis] : part.bounds.max[upAxis]
  const up = atBottom ? neg(basis(upAxis)) : basis(upAxis)
  return [{ index: 0, style: handle.style, centre: v3(centre.x, centre.y, centre.z), holes: [], ...frame(basis(alongAxis), up, normal), edgeDistance: 0, length: extent(part, alongAxis) }]
}

function isDoorPart(part: Part): boolean {
  return part.group === 'front' && !part.role.includes('drawer')
}

/** Pulls on `part` (a front) for the cabinet's `handle`; `[]` for other parts or a front the engine gave no pull. */
export function pullPlacements(part: Part, cabinet: Cabinet, handle: ResolvedHandle): PullPlacement[] {
  if (part.group !== 'front') return []
  const per = holesPerPull(handle)
  // J-profiles have no holes: only engine-built fronts (with a frame) get one.
  if (per === 0) return part.frame ? jProfile(part, cabinet, handle) : []
  const normal = showNormal(part)
  const holes = part.ops
    .filter((o): o is HoleOp => o.kind === 'hole' && o.purpose === 'pull')
    .map((h) => {
      const p = panelToCabinet(part, h.x, h.y, 0)
      return v3(p.x, p.y, p.z)
    })
  const [fa, fb] = faceAxes(normal)
  const longAxis = extent(part, fa) >= extent(part, fb) ? fa : fb
  const out: PullPlacement[] = []
  for (let i = 0; i + per <= holes.length; i += per) {
    const group = holes.slice(i, i + per)
    const [h1, h2] = group
    if (!h1) continue
    const centre = h2 ? mid(h1, h2) : h1
    const along = h2 ? unit(sub(h2, h1)) : basis(longAxis)
    const edge = handle.style === 'edge' ? towardNearEdge(part, centre, along, normal) : { up: unit(cross(normal, along)), distance: 0 }
    out.push({ index: out.length, style: handle.style, centre, holes: group, ...frame(along, edge.up, normal), edgeDistance: edge.distance, length: handle.length })
  }
  return out
}
