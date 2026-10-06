/**
 * Hanging (wardrobe) rods in door and open bays.
 *
 * A rod is round linear stock (diameter = the rod material's thickness) cut
 * `ROD_END_CLEARANCE` short of the carcass panels at each end, so it drops
 * into end flanges screwed to the sides/dividers. It spans the carcass between
 * those panels (face frames only narrow the opening in front of them), its
 * centre `rod.dropFromTop` below the top of the bay opening and
 * `ROD_DEPTH_FRACTION` across the usable interior depth. The part box is
 * diameter × diameter × length. Shelves in a rod bay sit above the rod (see
 * `rodShelfFloor`, used by the shelves rule).
 *
 * Hardware: `ROD_END_SUPPORTS` end supports per rod; rods longer than
 * `ROD_MAX_UNSUPPORTED_SPAN` also get a centre support and a warning (it needs
 * something to hang from: a shelf above or the back).
 */
import { DEFAULT_ROD_MATERIAL_ID } from '@/core/defaults'
import type { BuildWarning, HardwareItem, Material, Mm } from '@/core/types'
import {
  MIN_PART_SIZE,
  ROD_DEPTH_FRACTION,
  ROD_END_CLEARANCE,
  ROD_END_SUPPORTS,
  ROD_MAX_UNSUPPORTED_SPAN,
  ROD_SHELF_CLEARANCE,
  ROD_SUPPORT_CENTRE,
} from './constants'
import { emptyResult, findMaterial, warning, type BuildContext, type HardwareNeed, type RuleResult } from './context'
import { box, makePart, type FramedPart } from './geometry'
import type { BayLayout, SectionLayout } from './layout'

/** Rod centre height (cabinet y) for a door/open bay with a rod, or null (no rod / drop outside the opening). */
export function rodCentreY(b: BayLayout): Mm | null {
  const rod = b.bay.rod
  if (!rod || b.bay.kind === 'drawer') return null
  const y = b.openingY.hi - rod.dropFromTop
  return Number.isFinite(y) && y > b.openingY.lo && y < b.openingY.hi ? y : null
}

/** Lowest height a shelf underside may sit at in this bay (the hanging space is below it); null without a rod. */
export function rodShelfFloor(b: BayLayout): Mm | null {
  const y = rodCentreY(b)
  return y === null ? null : y + ROD_SHELF_CLEARANCE
}

function rodMaterial(ctx: BuildContext): Material | undefined {
  return findMaterial(ctx.materials, ctx.cabinet.construction.rodMaterialId ?? DEFAULT_ROD_MATERIAL_ID)
}

interface Supports {
  end: HardwareItem | undefined
  centre: HardwareItem | undefined
}

function supportsIn(catalog: readonly HardwareItem[]): Supports {
  const rodSupports = catalog.filter((h) => h.kind === 'rod-support')
  return {
    end: rodSupports.find((h) => h.props.centre !== ROD_SUPPORT_CENTRE),
    centre: rodSupports.find((h) => h.props.centre === ROD_SUPPORT_CENTRE),
  }
}

export function buildRods(ctx: BuildContext): RuleResult {
  const { cabinet, layout } = ctx
  const bays = layout.sections.flatMap((s) => s.bays.filter((b) => b.bay.kind !== 'drawer' && b.bay.rod).map((b) => ({ b, s })))
  if (bays.length === 0) return emptyResult()
  const material = rodMaterial(ctx)
  if (!material) {
    const id = cabinet.construction.rodMaterialId ?? DEFAULT_ROD_MATERIAL_ID
    return { ...emptyResult(), warnings: [warning(cabinet.id, 'warn', 'unknown-material', `Rod material ${id} is not in the material list; rods omitted`)] }
  }
  const results = bays.map(({ b, s }) => bayRod(ctx, material, b, s))
  const parts = results.flatMap((r) => r.part ?? [])
  const warnings = results.flatMap((r) => r.warnings)
  const { hardware, warnings: hardwareWarnings } = rodHardware(ctx, parts)
  return { parts, ops: [], hardware, warnings: [...warnings, ...hardwareWarnings] }
}

interface BayRod {
  part: FramedPart | null
  warnings: BuildWarning[]
}

function bayRod(ctx: BuildContext, material: Material, b: BayLayout, s: SectionLayout): BayRod {
  const { cabinet, dims: d } = ctx
  const label = `Section ${b.section + 1}, bay ${b.index + 1}`
  const r = material.thickness / 2
  const y = rodCentreY(b)
  const x0 = s.carcassX.lo + ROD_END_CLEARANCE
  const x1 = s.carcassX.hi - ROD_END_CLEARANCE
  const fits = y !== null && r > 0 && y - r >= b.openingY.lo && y + r <= b.openingY.hi && x1 - x0 >= MIN_PART_SIZE
  if (!fits) {
    return { part: null, warnings: [warning(cabinet.id, 'warn', 'rod-doesnt-fit', `${label}: the hanging rod does not fit the bay at that drop; omitted`)] }
  }
  const z = d.rearLimitZ + ROD_DEPTH_FRACTION * (d.interiorFrontZ - d.rearLimitZ)
  const part = makePart({
    cabinetId: cabinet.id,
    role: `rod-${b.section + 1}-${b.index + 1}`,
    name: `Rod ${b.section + 1}.${b.index + 1}`,
    group: 'rod',
    materialId: material.id,
    grain: 'none',
    bounds: box(x0, x1, y - r, y + r, z - r, z + r),
    length: '+x',
    faceA: '+y',
  })
  const long = part.length > ROD_MAX_UNSUPPORTED_SPAN
  const warnings = long
    ? [warning(cabinet.id, 'warn', 'rod-centre-support', `${label}: rod is ${Math.round(part.length)} mm long (over ${ROD_MAX_UNSUPPORTED_SPAN} mm); a centre support is added — fix it to a shelf above or the back`, part.id)]
    : []
  return { part, warnings }
}

function rodHardware(ctx: BuildContext, rods: readonly FramedPart[]): { hardware: HardwareNeed[]; warnings: BuildWarning[] } {
  if (rods.length === 0) return { hardware: [], warnings: [] }
  const { end, centre } = supportsIn(ctx.catalog)
  const longRods = rods.filter((p) => p.length > ROD_MAX_UNSUPPORTED_SPAN).length
  const hardware: HardwareNeed[] = []
  const warnings: BuildWarning[] = []
  const missing = (what: string): BuildWarning => warning(ctx.cabinet.id, 'warn', 'unknown-hardware', `No ${what} in the hardware catalog (kind rod-support)`)
  if (end) hardware.push({ hardwareId: end.id, qty: ROD_END_SUPPORTS * rods.length, note: 'Hanging rod end supports' })
  else warnings.push(missing('rod end support'))
  if (longRods > 0) {
    if (centre) hardware.push({ hardwareId: centre.id, qty: longRods, note: 'Hanging rod centre supports' })
    else warnings.push(missing('rod centre support'))
  }
  return { hardware, warnings }
}
