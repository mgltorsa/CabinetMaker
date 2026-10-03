/**
 * Construction engine: Project → parts, ops, hardware. Pure functions, no UI.
 *
 * Rule order per cabinet: materials → dims (feasibility) → layout (sections,
 * bays, fronts) → carcass → back → toe kick → face frame → doors → drawers →
 * shelves → top. Rules return parts plus ops placed in cabinet space; ops are
 * attached (panel space, deterministic ids) at the end. Impossible inputs
 * produce `BuildWarning`s, never exceptions.
 *
 * Face A convention: each part's face A is the face that receives most of its
 * ops — the inside face of sides, dividers, doors and drawer fronts, the top
 * face of bottoms/shelves/partitions, the underside of tops and stretchers.
 * Part ids are `${cabinetId}:${role}`; op ids `${partId}#${purpose}-${n}`.
 */
import { DEFAULT_HARDWARE } from '@/core/defaults'
import type { Cabinet, CabinetBuild, HardwareItem, Material, Project, ProjectBuild } from '@/core/types'
import { buildBack } from './back'
import { buildCarcass } from './carcass'
import { mergeResults, resolveMaterials, warning, type BuildContext } from './context'
import { computeDims } from './dims'
import { buildDoors } from './doors'
import { buildDrawers } from './drawers'
import { buildFaceFrame } from './faceFrame'
import { aggregateHardware } from './hardware'
import { resolveFasteners } from './joinery'
import { computeLayout } from './layout'
import { attachOps } from './ops'
import { buildShelves } from './shelves'
import { buildToeKick } from './toeKick'
import { buildTop } from './top'

export { validateBuild } from './validate'
export { PRESETS, createPreset, type PresetInfo } from './presets'

export interface EngineContext {
  materials: Material[]
  /** Hardware catalog (slides, hinges, pulls…). Defaults to the starter catalog. */
  hardware?: HardwareItem[]
}

export function buildCabinet(cabinet: Cabinet, ctx: EngineContext): CabinetBuild {
  try {
    return buildCabinetUnsafe(cabinet, ctx)
  } catch (error: unknown) {
    // Last-resort guard so one bad cabinet never takes down every view.
    const message = error instanceof Error ? error.message : 'unexpected error'
    return { cabinetId: cabinet.id, parts: [], hardware: [], warnings: [warning(cabinet.id, 'error', 'engine-failure', `Engine failed: ${message}`)] }
  }
}

function buildCabinetUnsafe(cabinet: Cabinet, ctx: EngineContext): CabinetBuild {
  const empty = { cabinetId: cabinet.id, parts: [], hardware: [] }
  const resolved = resolveMaterials(cabinet, ctx.materials)
  if (!resolved.ok) return { ...empty, warnings: resolved.warnings }
  const dimsResult = computeDims(cabinet, resolved.mats)
  if (dimsResult.fatal) return { ...empty, warnings: dimsResult.warnings }
  const { layout, warnings: layoutWarnings } = computeLayout(cabinet, dimsResult.dims)
  const catalog = ctx.hardware ?? DEFAULT_HARDWARE
  const bctx: BuildContext = { cabinet, materials: ctx.materials, mats: resolved.mats, catalog, dims: dimsResult.dims, layout }
  const fasteners = resolveFasteners(catalog)

  const carcass = buildCarcass(bctx, fasteners)
  const body = mergeResults(
    carcass.result,
    buildBack(bctx, carcass, fasteners),
    buildToeKick(bctx),
    buildFaceFrame(bctx),
    buildDoors(bctx, carcass.units),
    buildDrawers(bctx, carcass.units, fasteners),
    buildShelves(bctx, carcass.units),
  )
  const fronts = body.parts.filter((p) => p.group === 'front')
  const frontFaceZ = fronts.length > 0 ? Math.max(...fronts.map((p) => p.bounds.max.z)) : dimsResult.dims.D + dimsResult.dims.fft
  const all = mergeResults(body, buildTop(bctx, frontFaceZ))
  return {
    cabinetId: cabinet.id,
    parts: attachOps(all.parts, all.ops),
    hardware: aggregateHardware(cabinet.id, all.hardware),
    warnings: [...dimsResult.warnings, ...layoutWarnings, ...all.warnings],
  }
}

export function buildProject(project: Project): ProjectBuild {
  const ctx: EngineContext = { materials: project.materials, hardware: project.hardware }
  const cabinets = project.cabinets.map((cab) => buildCabinet(cab, ctx))
  return {
    cabinets,
    parts: cabinets.flatMap((b) => b.parts),
    hardware: cabinets.flatMap((b) => b.hardware),
    warnings: cabinets.flatMap((b) => b.warnings),
  }
}
