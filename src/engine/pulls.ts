/**
 * Pull holes, drilled through the front from its inside face (face A).
 * Drawer fronts: centred; two pulls (at ¼ and ¾ width) above WIDE_DRAWER_WIDTH.
 * Doors: a vertical pull DOOR_PULL_EDGE_OFFSET from the opening edge, near
 * the top (near the bottom on wall cabinets).
 */
import type { CabinetType, HardwareItem, Mm } from '@/core/types'
import { DEFAULT_PULL_CENTERS, DOOR_PULL_EDGE_OFFSET, DOOR_PULL_END_OFFSET, PULL_HOLE_DIAMETER, WIDE_DRAWER_WIDTH } from './constants'
import type { HardwareNeed } from './context'
import type { FramedPart } from './geometry'
import type { FrontRect } from './layout'
import { holeOp, type PlacedOp } from './ops'

export interface PullResult {
  ops: PlacedOp[]
  hardware: HardwareNeed[]
}

const NONE: PullResult = { ops: [], hardware: [] }

function centersOf(pull: HardwareItem): Mm {
  return pull.props.centers ?? DEFAULT_PULL_CENTERS
}

/**
 * Through hole for the pull's machine screws, drilled from face A (the inside
 * face, where the screw heads sit). `depth === front.thickness` is the
 * "through" signal: CAM is expected to add the machine's `throughCutExtra` so
 * the drill breaks out of the show face cleanly.
 */
function hole(front: FramedPart, x: Mm, y: Mm): PlacedOp {
  return holeOp(front, { x, y, z: front.bounds.min.z }, '-z', { diameter: PULL_HOLE_DIAMETER, depth: front.thickness, purpose: 'pull' })
}

export function drawerPulls(front: FramedPart, rect: FrontRect, pull: HardwareItem | undefined): PullResult {
  if (!pull) return NONE
  const c = centersOf(pull)
  const w = rect.x.hi - rect.x.lo
  const count = w > WIDE_DRAWER_WIDTH ? 2 : 1
  const xs = count === 2 ? [rect.x.lo + w / 4, rect.x.lo + (3 * w) / 4] : [rect.x.lo + w / 2]
  if (w / count < c + 2 * PULL_HOLE_DIAMETER) return NONE
  const y = (rect.y.lo + rect.y.hi) / 2
  const ops = xs.flatMap((x) => [hole(front, x - c / 2, y), hole(front, x + c / 2, y)])
  return { ops, hardware: [{ hardwareId: pull.id, qty: count, note: 'Pulls' }] }
}

export function doorPull(front: FramedPart, rect: FrontRect, hinge: 'left' | 'right', pull: HardwareItem | undefined, type: CabinetType): PullResult {
  if (!pull) return NONE
  const c = centersOf(pull)
  const h = rect.y.hi - rect.y.lo
  const w = rect.x.hi - rect.x.lo
  if (h < c + 2 * PULL_HOLE_DIAMETER || w < 2 * DOOR_PULL_EDGE_OFFSET) return NONE
  const x = hinge === 'left' ? rect.x.hi - DOOR_PULL_EDGE_OFFSET : rect.x.lo + DOOR_PULL_EDGE_OFFSET
  const fitsOffset = h >= c + 2 * DOOR_PULL_END_OFFSET
  const yc = !fitsOffset ? (rect.y.lo + rect.y.hi) / 2 : type === 'wall' ? rect.y.lo + DOOR_PULL_END_OFFSET + c / 2 : rect.y.hi - DOOR_PULL_END_OFFSET - c / 2
  return { ops: [hole(front, x, yc - c / 2), hole(front, x, yc + c / 2)], hardware: [{ hardwareId: pull.id, qty: 1, note: 'Pulls' }] }
}
