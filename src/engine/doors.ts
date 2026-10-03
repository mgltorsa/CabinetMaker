/**
 * Doors with 35 mm cup hinges. Face A is the inside face (−Z), so hinge cups
 * and pull holes are all on face A. Doors have vertical grain (length = +Y).
 *
 * Hinge cups: centre `cupEdgeDistance + cupDiameter / 2` from the hinge edge,
 * `endDistance` from the door top and bottom (capped at a quarter of the door
 * height), extra hinges evenly between. Mounting plates (frameless only; face
 * frames take face-frame plates): two screws 32 mm apart on the System 32 line,
 * 37 mm behind the carcass front, on the hinge-side section panel. Face-frame
 * cabinets get no plate holes and are billed a plate only when the catalog has
 * a face-frame plate (`props.faceFrame = 1`).
 */
import type { BuildWarning, HardwareItem, Mm } from '@/core/types'
import {
  HINGE_COUNT_BY_HEIGHT,
  HINGE_COUNT_MAX,
  HINGE_PLATE_HOLE_DEPTH,
  HINGE_PLATE_HOLE_DIAMETER,
  HINGE_PLATE_HOLE_SPACING,
  MIN_HINGED_DOOR_HEIGHT,
  MIN_PART_SIZE,
  SYSTEM32_SETBACK,
  WIDE_DOOR_WIDTH,
} from './constants'
import { emptyResult, mergeResults, warning, type BuildContext, type HardwareNeed, type RuleResult } from './context'
import { findHardware, selectHingePlate } from './hardware'
import { boxOf, makePart, span, spanSize, type FramedPart } from './geometry'
import type { BayLayout, FrontRect } from './layout'
import { holeOp, type PlacedOp } from './ops'
import { panelHoles, type SectionFaces, type SectionUnit } from './panelHoles'
import { doorPull } from './pulls'

export function hingeCount(doorHeight: Mm): number {
  return HINGE_COUNT_BY_HEIGHT.find((r) => doorHeight <= r.maxHeight)?.count ?? HINGE_COUNT_MAX
}

/** Cup centre heights (cabinet y) for a door spanning `y`. */
export function hingePositions(y: { lo: Mm; hi: Mm }, endDistance: Mm): Mm[] {
  const h = y.hi - y.lo
  const n = hingeCount(h)
  const ed = Math.min(endDistance, h / 4)
  const step = (h - 2 * ed) / (n - 1)
  return Array.from({ length: n }, (_, i) => y.lo + ed + i * step)
}

interface DoorHardware {
  hinge: HardwareItem | undefined
  plate: HardwareItem | undefined
  pull: HardwareItem | undefined
}

export function buildDoors(ctx: BuildContext, units: readonly SectionUnit[]): RuleResult {
  const { cabinet, catalog } = ctx
  const hw: DoorHardware = {
    hinge: findHardware(catalog, cabinet.hardware.hingeId, 'hinge'),
    // Frameless plates screw to the carcass side; a face-frame cabinet takes a
    // face-frame plate (`props.faceFrame = 1`) or none if the catalog has none.
    plate: selectHingePlate(catalog, ctx.dims.faceFrame),
    pull: findHardware(catalog, cabinet.hardware.pullId, 'pull'),
  }
  const doorBays = units.flatMap((u) => u.layout.bays.filter((b) => b.bay.kind === 'door').map((bay) => ({ bay, faces: u.faces })))
  const results = doorBays.flatMap(({ bay, faces }) => splitDoors(ctx, bay).map((door) => buildDoor(ctx, bay, door, faces, hw)))
  const warnings: BuildWarning[] = []
  if (doorBays.length > 0 && !hw.hinge) warnings.push(warning(cabinet.id, 'warn', 'unknown-hardware', `Hinge ${cabinet.hardware.hingeId} is not in the catalog`))
  return mergeResults(...results, { ...emptyResult(), warnings })
}

interface DoorSlot {
  role: string
  name: string
  rect: FrontRect
  hinge: 'left' | 'right'
}

function splitDoors(ctx: BuildContext, b: BayLayout): DoorSlot[] {
  const base = `door-${b.section + 1}-${b.index + 1}`
  const name = `Door ${b.section + 1}.${b.index + 1}`
  if (b.bay.doorCount !== 2) return [{ role: base, name, rect: b.front, hinge: b.bay.hingeSide }]
  const gap = ctx.cabinet.construction.reveal.between
  const w = (spanSize(b.front.x) - gap) / 2
  return [
    { role: `${base}-1`, name: `${name} left`, rect: { ...b.front, x: span(b.front.x.lo, b.front.x.lo + w) }, hinge: 'left' },
    { role: `${base}-2`, name: `${name} right`, rect: { ...b.front, x: span(b.front.x.hi - w, b.front.x.hi) }, hinge: 'right' },
  ]
}

function buildDoor(ctx: BuildContext, b: BayLayout, slot: DoorSlot, faces: SectionFaces, hw: DoorHardware): RuleResult {
  const { cabinet, dims: d, mats } = ctx
  const warn = (code: string, message: string): RuleResult => ({ ...emptyResult(), warnings: [warning(cabinet.id, 'warn', code, message)] })
  if (spanSize(slot.rect.x) < MIN_PART_SIZE || spanSize(slot.rect.y) < MIN_PART_SIZE) return warn('front-too-small', `${slot.name} has no room; omitted`)
  const door = makePart({
    cabinetId: cabinet.id,
    role: slot.role,
    name: slot.name,
    group: 'front',
    materialId: mats.front.id,
    grain: mats.front.grain,
    bounds: boxOf(slot.rect.x, slot.rect.y, d.frontZ),
    length: '+y',
    faceA: '-z',
  })
  const hinges = hingeOps(ctx, door, slot, faces, hw)
  const pull = doorPull(door, slot.rect, slot.hinge, hw.pull, cabinet.type)
  const warnings = [...hinges.warnings]
  if (b.bay.doorCount === 1 && door.width > WIDE_DOOR_WIDTH) {
    warnings.push(warning(cabinet.id, 'info', 'wide-door', `${slot.name} is ${Math.round(door.width)} mm wide; consider a pair`, door.id))
  }
  return { parts: [door], ops: [...hinges.ops, ...pull.ops], hardware: [...hinges.hardware, ...pull.hardware], warnings }
}

function hingeOps(ctx: BuildContext, door: FramedPart, slot: DoorSlot, faces: SectionFaces, hw: DoorHardware): Omit<RuleResult, 'parts'> {
  const { cabinet, dims: d } = ctx
  const h = cabinet.construction.hinge
  const r = h.cupDiameter / 2
  if (door.length < MIN_HINGED_DOOR_HEIGHT || door.width < h.cupEdgeDistance + h.cupDiameter + MIN_PART_SIZE) {
    return { ops: [], hardware: [], warnings: [warning(cabinet.id, 'warn', 'door-too-small-for-hinges', `${slot.name} is too small for cup hinges`, door.id)] }
  }
  const ys = hingePositions(slot.rect.y, h.endDistance)
  const cupX = slot.hinge === 'left' ? slot.rect.x.lo + h.cupEdgeDistance + r : slot.rect.x.hi - h.cupEdgeDistance - r
  const cupDepth = Math.min(h.cupDepth, door.thickness - 2)
  const cups = ys.map((y) => holeOp(door, { x: cupX, y, z: d.frontZ.lo }, '-z', { diameter: h.cupDiameter, depth: cupDepth, purpose: 'hinge-cup' }))
  const plates: PlacedOp[] = d.faceFrame
    ? []
    : panelHoles(
        slot.hinge === 'left' ? faces.left : faces.right,
        ys.flatMap((y) => [-1, 1].map((s) => ({ y: y + (s * HINGE_PLATE_HOLE_SPACING) / 2, z: d.interiorFrontZ - SYSTEM32_SETBACK }))),
        { diameter: HINGE_PLATE_HOLE_DIAMETER, depth: HINGE_PLATE_HOLE_DEPTH, purpose: 'hinge-plate' },
      )
  const hardware: HardwareNeed[] = [
    ...(hw.hinge ? [{ hardwareId: hw.hinge.id, qty: ys.length, note: 'Door hinges' }] : []),
    ...(hw.plate ? [{ hardwareId: hw.plate.id, qty: ys.length, note: 'Hinge mounting plates' }] : []),
  ]
  return { ops: [...cups, ...plates], hardware, warnings: [] }
}
