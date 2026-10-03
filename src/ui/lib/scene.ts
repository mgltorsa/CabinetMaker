/**
 * Pure 3D scene derivation: parts (cabinet space, mm, Y-up) → meshes, pulls,
 * shelf-pin holes and dimension lines in metres. The viewer only renders this.
 *
 * Layout: floor-standing cabinets form one run left to right; wall cabinets
 * form an upper run from the same left edge (no room plan yet, plan phase P6).
 * Every cabinet's back sits on the wall plane (cabinet space z = 0).
 */
import { panelToCabinet } from '@/core/panel'
import type { Cabinet, HoleOp, Part, PartGroup, ProjectBuild, SignedAxis, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { hingeSide } from '@/drawings/part-geometry'
import type { ViewToggles } from '../store'

const MM_PER_M = 1000
/** Gap between neighbouring cabinets in a run. */
const RUN_GAP_MM = 20
/** How far an open drawer slides out, as a fraction of cabinet depth. */
const DRAWER_OPEN_FRACTION = 0.6
/** Door swing when "Doors open" is on. */
const DOOR_OPEN_DEG = 100
/** Pull stand-off from the front face (bar pulls). */
const PULL_STANDOFF_MM = 28
/** Dimension line offset from the cabinet, and extension overshoot. */
const DIM_OFFSET_MM = 90
const DIM_OVERSHOOT_MM = 25

export type Vec3Tuple = [number, number, number]

/** Surface finish, mapped to a material by the viewer. */
export type Finish = 'carcass' | 'front' | 'back' | 'drawer-box' | 'toe-kick' | 'top' | 'face-frame'

const FINISH: Record<PartGroup, Finish> = {
  carcass: 'carcass',
  shelf: 'carcass',
  divider: 'carcass',
  stretcher: 'carcass',
  back: 'back',
  front: 'front',
  'drawer-box': 'drawer-box',
  'toe-kick': 'toe-kick',
  top: 'top',
  'face-frame': 'face-frame',
}

export interface MeshSpec {
  partId: string
  cabinetId: string
  /** Centre, metres. */
  position: Vec3Tuple
  /** Size before rotation, metres. */
  size: Vec3Tuple
  /** Rotation about +Y, radians (open doors). */
  rotationY: number
  finish: Finish
}

/** A bar pull between two holes on a front's show face. */
export interface PullSpec {
  id: string
  a: Vec3Tuple
  b: Vec3Tuple
  /** Unit vector out of the show face. */
  normal: Vec3Tuple
  standoff: number
}

export interface PinHoleSpec {
  position: Vec3Tuple
  /** Unit vector out of the face the hole is drilled into. */
  normal: Vec3Tuple
  radius: number
}

export interface DimensionSpec {
  id: string
  from: Vec3Tuple
  to: Vec3Tuple
  /** Extension lines from the cabinet to the dimension line. */
  extensions: [Vec3Tuple, Vec3Tuple][]
  label: string
}

export interface SceneSpec {
  meshes: MeshSpec[]
  pulls: PullSpec[]
  pinHoles: PinHoleSpec[]
  dimensions: DimensionSpec[]
  /** Largest extent of the visible run, metres (camera framing, floor size). */
  extent: number
  /** Look-at target, metres. */
  target: Vec3Tuple
}

export interface SceneOptions {
  units: UnitSystem
  /** Cabinet that gets dimension lines. */
  selectedCabinetId: string | null
}

// ─── Part classification ────────────────────────────────────────────────────

export function isDoor(part: Part): boolean {
  return part.group === 'front' && !part.role.includes('drawer')
}

/** Drawer boxes and drawer fronts move when drawers are shown open. */
export function isDrawerPart(part: Part): boolean {
  return part.group === 'drawer-box' || (part.group === 'front' && part.role.includes('drawer'))
}

export function isPartVisible(part: Part, view: ViewToggles): boolean {
  switch (part.group) {
    case 'front':
      return isDoor(part) ? view.doors : view.drawerFaces
    case 'drawer-box':
      return view.drawers
    case 'back':
      return view.back
    case 'top':
      return view.top
    default:
      return true
  }
}

// ─── Layout ─────────────────────────────────────────────────────────────────

/** X offset of each cabinet: floor cabinets in one run, wall cabinets above from the same start. */
export function runOffsets(cabinets: readonly Cabinet[]): Map<string, number> {
  const offsets = new Map<string, number>()
  const cursor = { floor: 0, wall: 0 }
  for (const cab of cabinets) {
    const run = cab.type === 'wall' ? 'wall' : 'floor'
    offsets.set(cab.id, cursor[run])
    cursor[run] += cab.width + RUN_GAP_MM
  }
  return offsets
}

// ─── Vector helpers (mm) ────────────────────────────────────────────────────

type V = { x: number; y: number; z: number }

const AXIS_VECTORS: Record<SignedAxis, V> = {
  '+x': { x: 1, y: 0, z: 0 },
  '-x': { x: -1, y: 0, z: 0 },
  '+y': { x: 0, y: 1, z: 0 },
  '-y': { x: 0, y: -1, z: 0 },
  '+z': { x: 0, y: 0, z: 1 },
  '-z': { x: 0, y: 0, z: -1 },
}

/** Outward normal of face A (fallback: +thickness axis, matching core/panel). */
function faceANormal(part: Part): V {
  if (part.frame) return AXIS_VECTORS[part.frame.z]
  return AXIS_VECTORS[`+${part.axes.thickness}` as SignedAxis]
}

const neg = (v: V): V => ({ x: -v.x, y: -v.y, z: -v.z })

/** Rigid motion applied to a part: rotate about a vertical pivot, then translate. */
interface Motion {
  pivot: V
  angle: number
  shift: V
}

const STILL: Motion = { pivot: { x: 0, y: 0, z: 0 }, angle: 0, shift: { x: 0, y: 0, z: 0 } }

function rotateY(v: V, angle: number): V {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c }
}

function movePoint(p: V, m: Motion): V {
  const r = rotateY({ x: p.x - m.pivot.x, y: p.y - m.pivot.y, z: p.z - m.pivot.z }, m.angle)
  return { x: m.pivot.x + r.x + m.shift.x, y: m.pivot.y + r.y + m.shift.y, z: m.pivot.z + r.z + m.shift.z }
}

function partMotion(part: Part, cabinet: Cabinet | undefined, view: ViewToggles): Motion {
  if (view.drawersOpen && isDrawerPart(part) && cabinet) {
    return { ...STILL, shift: { x: 0, y: 0, z: cabinet.depth * DRAWER_OPEN_FRACTION } }
  }
  if (view.doorsOpen && isDoor(part) && cabinet) {
    const side = hingeSide(part, cabinet)
    const { min, max } = part.bounds
    // Overlay hinges pivot near the door's back edge on the hinge side.
    const pivot = { x: side === 'left' ? min.x : max.x, y: 0, z: min.z }
    const angle = ((side === 'left' ? -1 : 1) * DOOR_OPEN_DEG * Math.PI) / 180
    return { ...STILL, pivot, angle }
  }
  return STILL
}

// ─── Scene ──────────────────────────────────────────────────────────────────

const holesFor = (part: Part, purpose: HoleOp['purpose']): HoleOp[] =>
  part.ops.filter((o): o is HoleOp => o.kind === 'hole' && o.purpose === purpose && o.face === 'A')

const pullHoles = (part: Part): HoleOp[] => part.ops.filter((o): o is HoleOp => o.kind === 'hole' && o.purpose === 'pull')

export function buildScene(build: ProjectBuild, cabinets: readonly Cabinet[], view: ViewToggles, options: SceneOptions): SceneSpec {
  const offsets = runOffsets(cabinets)
  const cabinetById = new Map(cabinets.map((c) => [c.id, c]))
  const visible = build.parts.filter((p) => isPartVisible(p, view))
  if (visible.length === 0) return { meshes: [], pulls: [], pinHoles: [], dimensions: [], extent: 1, target: [0, 0.4, 0] }

  // World (mm) before centring: cabinet space + run offset.
  const toWorld = (part: Part, p: V): V => ({ x: p.x + (offsets.get(part.cabinetId) ?? 0), y: p.y, z: p.z })

  const placed = visible.map((part) => {
    const motion = partMotion(part, cabinetById.get(part.cabinetId), view)
    const { min, max } = part.bounds
    const centre = movePoint(toWorld(part, { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }), {
      ...motion,
      pivot: toWorld(part, motion.pivot),
    })
    return { part, motion: { ...motion, pivot: toWorld(part, motion.pivot) }, centre }
  })

  // Run extents (unrotated bounds are close enough for framing).
  const xs = visible.flatMap((p) => [p.bounds.min.x + (offsets.get(p.cabinetId) ?? 0), p.bounds.max.x + (offsets.get(p.cabinetId) ?? 0)])
  const ys = visible.flatMap((p) => [p.bounds.min.y, p.bounds.max.y])
  const zs = visible.flatMap((p) => [p.bounds.min.z, p.bounds.max.z])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const maxZ = Math.max(...zs)
  const cx = (minX + maxX) / 2
  const m = (p: V): Vec3Tuple => [(p.x - cx) / MM_PER_M, p.y / MM_PER_M, p.z / MM_PER_M]
  // `|| 0` folds -0 (from negated axes) into 0.
  const dir = (v: V): Vec3Tuple => [v.x || 0, v.y || 0, v.z || 0]

  const meshes = placed.map(({ part, motion, centre }): MeshSpec => {
    const { min, max } = part.bounds
    return {
      partId: part.id,
      cabinetId: part.cabinetId,
      position: m(centre),
      size: [Math.max(max.x - min.x, 0.1) / MM_PER_M, Math.max(max.y - min.y, 0.1) / MM_PER_M, Math.max(max.z - min.z, 0.1) / MM_PER_M],
      rotationY: motion.angle,
      finish: FINISH[part.group],
    }
  })

  const pulls: PullSpec[] = []
  const pinHoles: PinHoleSpec[] = []
  for (const { part, motion } of placed) {
    if (part.group === 'front') {
      // Pull holes come in pairs (one bar pull per pair), in op order.
      const holes = pullHoles(part)
      const out = rotateY(neg(faceANormal(part)), motion.angle)
      for (let i = 0; i + 1 < holes.length; i += 2) {
        const [h1, h2] = [holes[i], holes[i + 1]]
        if (!h1 || !h2) continue
        const at = (h: HoleOp): V => movePoint(toWorld(part, panelToCabinet(part, h.x, h.y, 0)), motion)
        pulls.push({ id: `${part.id}:pull-${i / 2}`, a: m(at(h1)), b: m(at(h2)), normal: dir(out), standoff: PULL_STANDOFF_MM / MM_PER_M })
      }
    }
    const pins = holesFor(part, 'shelf-pin')
    if (pins.length > 0 && part.frame) {
      const normal = rotateY(faceANormal(part), motion.angle)
      for (const h of pins) {
        const at = movePoint(toWorld(part, panelToCabinet(part, h.x, h.y, part.thickness)), motion)
        pinHoles.push({ position: m(at), normal: dir(normal), radius: h.diameter / 2 / MM_PER_M })
      }
    }
  }

  const dimensions = view.dimensions ? cabinetDimensions(build, cabinets, offsets, options, m) : []
  const extent = Math.max(maxX - minX, maxY, maxZ) / MM_PER_M
  return { meshes, pulls, pinHoles, dimensions, extent, target: [0, maxY / 2 / MM_PER_M, maxZ / 2 / MM_PER_M] }
}

/** Overall W / H / D of the selected cabinet: width over the top front edge, height and depth at the right. */
function cabinetDimensions(
  build: ProjectBuild,
  cabinets: readonly Cabinet[],
  offsets: ReadonlyMap<string, number>,
  options: SceneOptions,
  m: (p: V) => Vec3Tuple,
): DimensionSpec[] {
  const cabinet = cabinets.find((c) => c.id === options.selectedCabinetId)
  const parts = build.parts.filter((p) => p.cabinetId === cabinet?.id)
  if (!cabinet || parts.length === 0) return []
  const dx = offsets.get(cabinet.id) ?? 0
  const x0 = Math.min(...parts.map((p) => p.bounds.min.x)) + dx
  const x1 = Math.max(...parts.map((p) => p.bounds.max.x)) + dx
  const y0 = Math.min(...parts.map((p) => p.bounds.min.y))
  const y1 = Math.max(...parts.map((p) => p.bounds.max.y))
  const z0 = Math.min(...parts.map((p) => p.bounds.min.z))
  const z1 = Math.max(...parts.map((p) => p.bounds.max.z))
  const o = DIM_OFFSET_MM
  const e = DIM_OVERSHOOT_MM
  const fmt = (v: number): string => formatLength(v, options.units)
  const p = (x: number, y: number, z: number): Vec3Tuple => m({ x, y, z })
  return [
    {
      id: 'width',
      from: p(x0, y1 + o, z1),
      to: p(x1, y1 + o, z1),
      extensions: [
        [p(x0, y1, z1), p(x0, y1 + o + e, z1)],
        [p(x1, y1, z1), p(x1, y1 + o + e, z1)],
      ],
      label: fmt(cabinet.width),
    },
    {
      id: 'height',
      from: p(x1 + o, y0, z1),
      to: p(x1 + o, y1, z1),
      extensions: [
        [p(x1, y0, z1), p(x1 + o + e, y0, z1)],
        [p(x1, y1, z1), p(x1 + o + e, y1, z1)],
      ],
      label: fmt(cabinet.height),
    },
    {
      id: 'depth',
      from: p(x1 + o, y0, z0),
      to: p(x1 + o, y0, z1),
      extensions: [[p(x1, y0, z0), p(x1 + o + e, y0, z0)]],
      label: fmt(cabinet.depth),
    },
  ]
}
