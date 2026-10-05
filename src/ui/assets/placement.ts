/**
 * Where placed assets go: the anchors a project offers (cabinet run, worktop,
 * wall cabinets, ceiling) and the default / snapped positions derived from
 * them. Room space (see core/types): mm, +X along the back wall, +Z into the
 * room, y = height of the asset's base above the floor.
 */
import { type AssetDef, type AssetMount, getAssetDef } from '@/assets'
import type { Cabinet, Mm, PlacedAsset, Project, Vec3 } from '@/core/types'
import { runOffsets } from '../lib/scene'
import { roomBounds, roomCentreX } from '../models/room'

/** Typical worktop height when the project has no base cabinets. */
export const DEFAULT_COUNTER_HEIGHT: Mm = 900
/** Typical ceiling when no room is built. */
export const DEFAULT_CEILING_HEIGHT: Mm = 2400
/** Typical underside of wall cabinets (900 worktop + 500 backsplash) when there are none. */
export const DEFAULT_UNDER_CABINET_HEIGHT: Mm = 1400
/** Typical wall-cabinet depth when there are none. */
const DEFAULT_WALL_CABINET_DEPTH: Mm = 330
/** Walkway left in front of the run before free-standing furniture. */
export const FRONT_CLEARANCE: Mm = 1000
/** Ceiling lights hang over the zone this far past the walkway (an island's centre). */
const CEILING_ZONE: Mm = 500
/** Space between neighbours along the back wall. */
export const SIDE_GAP: Mm = 50
/** Shift between successive assets added with the same mount. */
export const STAGGER: Mm = 300
/** Counter assets keep this far off the back wall (backsplash). */
const COUNTER_BACK_GAP: Mm = 50
/** LED strips sit this far behind the wall cabinets' front edge. */
const UNDER_CABINET_INSET: Mm = 30
/** Floor cabinets up to this tall (incl. floor height) carry a worktop; taller ones are tall units. */
const MAX_COUNTER_CABINET: Mm = 1300
/** Wall-mounted assets without their own lift. */
const DEFAULT_WALL_LIFT: Mm = 1200

export interface SceneAnchors {
  /** Floor cabinets: left / right room X and front Z. */
  run: { left: Mm; right: Mm; depth: Mm } | null
  counterHeight: Mm
  ceilingHeight: Mm
  wallCabinets: { left: Mm; right: Mm; bottom: Mm; front: Mm } | null
  /** Room-space X new assets centre on: the room's centre, else the run's. */
  centreX: Mm
}

export type SnapTarget = 'floor' | 'wall' | 'ceiling' | 'counter' | 'under-cabinet'

interface Extent {
  cab: Cabinet
  left: Mm
  right: Mm
  front: Mm
}

function cabinetExtents(project: Project): Extent[] {
  const offsets = runOffsets(project.cabinets)
  return project.cabinets.map((cab) => {
    const left = offsets.get(cab.id) ?? 0
    const back = cab.placement?.position?.z ?? 0
    return { cab, left, right: left + cab.width, front: back + cab.depth }
  })
}

const topThickness = (cab: Cabinet): Mm => (cab.top.kind === 'none' ? 0 : cab.top.thickness)

export function sceneAnchors(project: Project): SceneAnchors {
  const extents = cabinetExtents(project)
  const floor = extents.filter((e) => e.cab.type !== 'wall')
  const walls = extents.filter((e) => e.cab.type === 'wall')
  const counters = floor.filter((e) => e.cab.floorHeight + e.cab.height <= MAX_COUNTER_CABINET)
  const run = floor.length === 0 ? null : { left: Math.min(...floor.map((e) => e.left)), right: Math.max(...floor.map((e) => e.right)), depth: Math.max(...floor.map((e) => e.front)) }
  const wallCabinets =
    walls.length === 0
      ? null
      : {
          left: Math.min(...walls.map((e) => e.left)),
          right: Math.max(...walls.map((e) => e.right)),
          bottom: Math.min(...walls.map((e) => e.cab.floorHeight)),
          front: Math.max(...walls.map((e) => e.front)),
        }
  const room = project.room && project.room.walls.length > 0 ? project.room : null
  const counterHeight = counters.length === 0 ? DEFAULT_COUNTER_HEIGHT : Math.max(...counters.map((e) => e.cab.floorHeight + e.cab.height + topThickness(e.cab)))
  const ceilingHeight = room ? Math.max(...room.walls.map((w) => w.height)) : DEFAULT_CEILING_HEIGHT
  const centreX = room ? roomCentreX(room) : run ? (run.left + run.right) / 2 : 0
  return { run, counterHeight, ceilingHeight, wallCabinets, centreX }
}

/** Half the footprint along X and Z once rotated about Y. */
export function footprintHalf(size: Vec3, rotationYDeg: number): { x: Mm; z: Mm } {
  const a = (rotationYDeg * Math.PI) / 180
  const c = Math.abs(Math.cos(a))
  const s = Math.abs(Math.sin(a))
  return { x: (c * size.x + s * size.z) / 2, z: (s * size.x + c * size.z) / 2 }
}

const mountOf = (asset: PlacedAsset): AssetMount | undefined => getAssetDef(asset.assetId)?.mount

/** Right end of everything standing against the back wall (floor cabinets and floor-wall assets). */
function backWallRight(project: Project, anchors: SceneAnchors): Mm | null {
  const rights = [
    ...(anchors.run ? [anchors.run.right] : []),
    ...(project.assets ?? []).filter((a) => mountOf(a) === 'floor-wall').map((a) => a.position.x + footprintHalf(a.size, a.rotationYDeg).x),
  ]
  return rights.length === 0 ? null : Math.max(...rights)
}

function underCabinetZ(anchors: SceneAnchors, halfDepth: Mm): Mm {
  const front = anchors.wallCabinets?.front ?? DEFAULT_WALL_CABINET_DEPTH
  return Math.max(halfDepth, front - halfDepth - UNDER_CABINET_INSET)
}

/** Where a new `def` asset of `size` goes in `project` (see `AssetMount`). */
export function defaultAssetPosition(project: Project, def: AssetDef, size: Vec3): Vec3 {
  const anchors = sceneAnchors(project)
  // Each asset already placed the same way shifts the next one along, so additions do not pile up.
  const copies = (project.assets ?? []).filter((a) => mountOf(a) === def.mount).length
  const x = anchors.centreX + copies * STAGGER
  const runDepth = anchors.run?.depth ?? 0
  const runCentre = anchors.run ? (anchors.run.left + anchors.run.right) / 2 : anchors.centreX
  switch (def.mount) {
    case 'floor-wall': {
      const right = backWallRight(project, anchors)
      const minX = project.room && project.room.walls.length > 0 ? roomBounds(project.room).minX : 0
      return { x: (right === null ? minX : right + SIDE_GAP) + size.x / 2, y: 0, z: size.z / 2 }
    }
    case 'floor':
      return { x, y: 0, z: runDepth + FRONT_CLEARANCE + size.z / 2 }
    case 'counter':
      return { x: runCentre + copies * STAGGER, y: anchors.counterHeight, z: size.z / 2 + COUNTER_BACK_GAP }
    case 'wall':
      return { x, y: def.defaultLift ?? DEFAULT_WALL_LIFT, z: size.z / 2 }
    case 'ceiling':
      return { x, y: Math.max(0, anchors.ceilingHeight - size.y), z: runDepth + FRONT_CLEARANCE + CEILING_ZONE }
    case 'under-cabinet': {
      const wall = anchors.wallCabinets
      const cx = wall ? (wall.left + wall.right) / 2 + copies * STAGGER : x
      return { x: cx, y: Math.max(0, (wall?.bottom ?? DEFAULT_UNDER_CABINET_HEIGHT) - size.y), z: underCabinetZ(anchors, size.z / 2) }
    }
  }
}

/** `asset`'s position moved onto `target`, keeping the other coordinates. */
export function snapPosition(project: Project, asset: Pick<PlacedAsset, 'position' | 'size' | 'rotationYDeg'>, target: SnapTarget): Vec3 {
  const anchors = sceneAnchors(project)
  const p = asset.position
  const half = footprintHalf(asset.size, asset.rotationYDeg)
  switch (target) {
    case 'floor':
      return { ...p, y: 0 }
    case 'wall':
      return { ...p, z: half.z }
    case 'ceiling':
      return { ...p, y: Math.max(0, anchors.ceilingHeight - asset.size.y) }
    case 'counter':
      return { ...p, y: anchors.counterHeight }
    case 'under-cabinet':
      return { ...p, y: Math.max(0, (anchors.wallCabinets?.bottom ?? DEFAULT_UNDER_CABINET_HEIGHT) - asset.size.y), z: underCabinetZ(anchors, half.z) }
  }
}
