/**
 * Adjustable shelves in door and open bays, resting on 5 mm pins.
 *
 * Pin holes: two rows (front row `shelfPins.inset` behind the interior front,
 * rear row the same distance in front of the back/nailer) on the inside faces
 * of the section's side/divider panels, on a `shelfPins.spacing` grid counted
 * from the carcass interior bottom. With `system32` the rows run the full bay
 * height; otherwise only the holes under each shelf are drilled.
 * Shelves are spread evenly and snapped onto the nearest grid hole.
 */
import type { BuildWarning, Mm } from '@/core/types'
import { MIN_PART_SIZE, PIN_ROW_END_MARGIN, SHELF_FRONT_SETBACK, SHELF_SIDE_CLEARANCE } from './constants'
import { emptyResult, mergeResults, warning, type BuildContext, type HardwareNeed, type RuleResult } from './context'
import { findHardware } from './hardware'
import { boxOf, makePart, span, spanSize } from './geometry'
import type { BayLayout } from './layout'
import { panelHoles, type SectionUnit } from './panelHoles'

const PINS_PER_SHELF = 4

export function buildShelves(ctx: BuildContext, units: readonly SectionUnit[]): RuleResult {
  return mergeResults(
    ...units.flatMap((u) => u.layout.bays.filter((b) => b.bay.kind !== 'drawer' && b.bay.shelfCount > 0).map((b) => bayShelves(ctx, b, u))),
  )
}

function gridHoles(origin: Mm, pitch: Mm, lo: Mm, hi: Mm): Mm[] {
  const first = Math.ceil((lo - origin) / pitch)
  const last = Math.floor((hi - origin) / pitch)
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => origin + (first + i) * pitch)
}

/** Hole heights (cabinet y) the shelves rest on, snapped to the grid when possible. */
export function shelfHoles(opening: { lo: Mm; hi: Mm }, count: number, t: Mm, support: Mm, grid: readonly Mm[]): Mm[] {
  const ideal = Array.from({ length: count }, (_, i) => opening.lo + ((i + 1) * (opening.hi - opening.lo)) / (count + 1) - t / 2 - support)
  const usable = grid.filter((g) => g + support >= opening.lo && g + support + t <= opening.hi)
  const snapped = ideal
    .map((y) => usable.reduce<Mm | undefined>((best, g) => (best === undefined || Math.abs(g - y) < Math.abs(best - y) ? g : best), undefined))
    .filter((s): s is Mm => s !== undefined)
  const holes = snapped.length === count && new Set(snapped).size === count ? snapped : ideal
  const ordered = [...holes].sort((a, b) => a - b)
  const inBay = ordered.every((h) => h + support >= opening.lo && h + support + t <= opening.hi)
  const clear = ordered.every((h, i) => i === 0 || h - ordered[i - 1]! >= t)
  return inBay && clear ? holes : []
}

function bayShelves(ctx: BuildContext, b: BayLayout, unit: SectionUnit): RuleResult {
  const { cabinet, dims: d, mats, catalog } = ctx
  const { faces, layout } = unit
  const pins = cabinet.construction.shelfPins
  const t = mats.carcass.thickness
  const support = pins.diameter / 2
  const label = `Section ${b.section + 1}, bay ${b.index + 1}`
  const x = span(layout.clearX.lo + SHELF_SIDE_CLEARANCE, layout.clearX.hi - SHELF_SIDE_CLEARANCE)
  const z = span(d.rearLimitZ, d.interiorFrontZ - SHELF_FRONT_SETBACK)
  const grid = gridHoles(d.interiorY.lo, pins.spacing, b.openingY.lo + PIN_ROW_END_MARGIN, b.openingY.hi - PIN_ROW_END_MARGIN)
  const holes = shelfHoles(b.openingY, b.bay.shelfCount, t, support, pins.spacing > 0 ? grid : [])
  if (holes.length === 0 || spanSize(x) < MIN_PART_SIZE || spanSize(z) < MIN_PART_SIZE) {
    return { ...emptyResult(), warnings: [warning(cabinet.id, 'warn', 'shelves-dont-fit', `${label}: ${b.bay.shelfCount} shelves do not fit; omitted`)] }
  }
  const parts = holes.map((h, k) =>
    makePart({
      cabinetId: cabinet.id,
      role: `shelf-${b.section + 1}-${b.index + 1}-${k + 1}`,
      name: `Shelf ${b.section + 1}.${b.index + 1}.${k + 1}`,
      group: 'shelf',
      materialId: mats.carcass.id,
      grain: mats.carcass.grain,
      bounds: boxOf(x, span(h + support, h + support + t), z),
      length: '+x',
      faceA: '+y',
    }),
  )
  const rowYs = cabinet.construction.system32 ? [...new Set([...grid, ...holes])] : holes
  const rows = pinRows(d.interiorFrontZ - pins.inset, d.rearLimitZ + pins.inset, pins.diameter)
  const points = rowYs.flatMap((y) => rows.map((rz) => ({ y, z: rz })))
  const spec = { diameter: pins.diameter, depth: pins.depth, purpose: 'shelf-pin' as const }
  const ops = [...panelHoles(faces.left, points, spec), ...panelHoles(faces.right, points, spec)]
  const pin = findHardware(catalog, cabinet.hardware.shelfPinId, 'shelf-pin')
  const hardware: HardwareNeed[] = pin ? [{ hardwareId: pin.id, qty: PINS_PER_SHELF * parts.length, note: 'Shelf pins' }] : []
  const warnings: BuildWarning[] = pin ? [] : [warning(cabinet.id, 'warn', 'unknown-hardware', `Shelf pin ${cabinet.hardware.shelfPinId} is not in the catalog`)]
  return { parts, ops, hardware, warnings }
}

/** Front and rear row z; a single middle row when the cabinet is too shallow for two. */
function pinRows(front: Mm, rear: Mm, diameter: Mm): Mm[] {
  return front - rear >= 2 * diameter ? [rear, front] : [(front + rear) / 2]
}
