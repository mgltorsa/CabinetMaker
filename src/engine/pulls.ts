/**
 * Pull holes, drilled into the front from its inside face (face A). Where a
 * pull goes depends on its handle style (`core/handles`):
 *
 * - Bar, cup and custom handles on centres: two through holes per pull.
 *   Drawer fronts: centred; two pulls (at ¼ and ¾ width) above
 *   WIDE_DRAWER_WIDTH. Doors: vertical, DOOR_PULL_EDGE_OFFSET from the latch
 *   edge, near the top (near the bottom on wall cabinets).
 * - Knobs and single-screw custom handles: one through hole where the
 *   middle of a bar would be (drawer centre; door latch side, DOOR_PULL_END_OFFSET
 *   from the top / wall-cabinet bottom).
 * - Edge pulls sit on the front's grip edge: the top edge of drawer fronts and
 *   doors, the bottom edge of wall-cabinet doors. Assumption: they fix with two
 *   screws on `centers` into the inside face, EDGE_PULL_HOLE_INSET from that
 *   edge, in blind holes (they must not break out of the show face). Doors
 *   take them near the latch side.
 * - J-profiles are a lip along the grip edge: no holes. They are still counted
 *   (one piece per front, cut to the front's width) so the estimate prices them.
 */
import { holesPerPull, resolveHandle, type ResolvedHandle } from '@/core/handles'
import type { CabinetType, HardwareItem, Mm } from '@/core/types'
import {
  DOOR_PULL_EDGE_OFFSET,
  DOOR_PULL_END_OFFSET,
  EDGE_PULL_HOLE_INSET,
  EDGE_PULL_MAX_DEPTH_RATIO,
  EDGE_PULL_SCREW_DEPTH,
  PULL_HOLE_DIAMETER,
  WIDE_DRAWER_WIDTH,
} from './constants'
import type { HardwareNeed } from './context'
import type { FramedPart } from './geometry'
import type { FrontRect } from './layout'
import { holeOp, type PlacedOp } from './ops'

export interface PullResult {
  ops: PlacedOp[]
  hardware: HardwareNeed[]
}

const NONE: PullResult = { ops: [], hardware: [] }
const PULLS_NOTE = 'Pulls'
const J_PROFILE_NOTE = 'J-profile pulls (one per front, cut to width)'

/**
 * Through hole for the pull's machine screws, drilled from face A (the inside
 * face, where the screw heads sit). `depth === front.thickness` is the
 * "through" signal: CAM is expected to add the machine's `throughCutExtra` so
 * the drill breaks out of the show face cleanly.
 */
function hole(front: FramedPart, x: Mm, y: Mm): PlacedOp {
  return holeOp(front, { x, y, z: front.bounds.min.z }, '-z', { diameter: PULL_HOLE_DIAMETER, depth: front.thickness, purpose: 'pull' })
}

/** Blind screw hole for an edge pull, from face A; never through the show face. */
function screwHole(front: FramedPart, x: Mm, y: Mm): PlacedOp {
  const depth = Math.min(EDGE_PULL_SCREW_DEPTH, front.thickness * EDGE_PULL_MAX_DEPTH_RATIO)
  return holeOp(front, { x, y, z: front.bounds.min.z }, '-z', { diameter: PULL_HOLE_DIAMETER, depth, purpose: 'pull' })
}

function counted(pull: HardwareItem, qty: number, ops: PlacedOp[], note = PULLS_NOTE): PullResult {
  return { ops, hardware: [{ hardwareId: pull.id, qty, note }] }
}

/** Space along the pull a two-hole pattern needs on the front. */
const pairSpan = (h: ResolvedHandle): Mm => h.centers + 2 * PULL_HOLE_DIAMETER

export function drawerPulls(front: FramedPart, rect: FrontRect, pull: HardwareItem | undefined): PullResult {
  if (!pull) return NONE
  const h = resolveHandle(pull)
  const w = rect.x.hi - rect.x.lo
  if (h.style === 'j-profile') return counted(pull, 1, [], J_PROFILE_NOTE)
  const count = w > WIDE_DRAWER_WIDTH ? 2 : 1
  const xs = count === 2 ? [rect.x.lo + w / 4, rect.x.lo + (3 * w) / 4] : [rect.x.lo + w / 2]
  const holes = holesPerPull(h)
  const c = h.centers
  if (holes === 1) {
    if (w / count < 2 * PULL_HOLE_DIAMETER) return NONE
    const y = (rect.y.lo + rect.y.hi) / 2
    return counted(pull, count, xs.map((x) => hole(front, x, y)))
  }
  if (w / count < pairSpan(h)) return NONE
  if (h.style === 'edge') {
    if (rect.y.hi - rect.y.lo < 2 * EDGE_PULL_HOLE_INSET) return NONE
    const y = rect.y.hi - EDGE_PULL_HOLE_INSET
    return counted(pull, count, xs.flatMap((x) => [screwHole(front, x - c / 2, y), screwHole(front, x + c / 2, y)]))
  }
  const y = (rect.y.lo + rect.y.hi) / 2
  return counted(pull, count, xs.flatMap((x) => [hole(front, x - c / 2, y), hole(front, x + c / 2, y)]))
}

export function doorPull(front: FramedPart, rect: FrontRect, hinge: 'left' | 'right', pull: HardwareItem | undefined, type: CabinetType): PullResult {
  if (!pull) return NONE
  const h = resolveHandle(pull)
  if (h.style === 'j-profile') return counted(pull, 1, [], J_PROFILE_NOTE)
  const c = h.centers
  const height = rect.y.hi - rect.y.lo
  const w = rect.x.hi - rect.x.lo
  const isWall = type === 'wall'
  /** Latch edge, and the direction from it into the door. */
  const latchX = hinge === 'left' ? rect.x.hi : rect.x.lo
  const inward = hinge === 'left' ? -1 : 1

  if (h.style === 'edge') {
    if (w < c + 2 * DOOR_PULL_EDGE_OFFSET || height < 2 * EDGE_PULL_HOLE_INSET) return NONE
    const y = isWall ? rect.y.lo + EDGE_PULL_HOLE_INSET : rect.y.hi - EDGE_PULL_HOLE_INSET
    const near = latchX + inward * DOOR_PULL_EDGE_OFFSET
    return counted(pull, 1, [screwHole(front, near, y), screwHole(front, near + inward * c, y)])
  }

  if (w < 2 * DOOR_PULL_EDGE_OFFSET) return NONE
  const x = latchX + inward * DOOR_PULL_EDGE_OFFSET
  if (holesPerPull(h) === 1) {
    if (height < 2 * PULL_HOLE_DIAMETER) return NONE
    const fits = height >= 2 * DOOR_PULL_END_OFFSET
    const y = !fits ? (rect.y.lo + rect.y.hi) / 2 : isWall ? rect.y.lo + DOOR_PULL_END_OFFSET : rect.y.hi - DOOR_PULL_END_OFFSET
    return counted(pull, 1, [hole(front, x, y)])
  }
  if (height < pairSpan(h)) return NONE
  const fitsOffset = height >= c + 2 * DOOR_PULL_END_OFFSET
  const yc = !fitsOffset ? (rect.y.lo + rect.y.hi) / 2 : isWall ? rect.y.lo + DOOR_PULL_END_OFFSET + c / 2 : rect.y.hi - DOOR_PULL_END_OFFSET - c / 2
  return counted(pull, 1, [hole(front, x, yc - c / 2), hole(front, x, yc + c / 2)])
}
