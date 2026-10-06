/**
 * Sheet → toolpaths. Every op on every placed part is either machined or
 * listed in `manualOps`; every placement problem becomes a warning, including
 * parts too close for the profile tool and cuts that reach a neighbouring
 * part (see `./neighbours`).
 */
import type { BuildWarning, CamResult, Part, Placement, Sheet, Toolpath } from '@/core/types'
import { boundsWarnings } from './checks'
import { GEOMETRY_EPSILON } from './constants'
import { makePartContext, partWarning, type PartContext } from './context'
import { formatForMessage as f } from './format'
import { machineWarnings } from './machine'
import { neighbourWarnings, type PlacedFootprint } from './neighbours'
import { planOp } from './ops'
import { orderToolpaths } from './order'
import { planProfile } from './profile'
import { resolveTools, type CamTools } from './tools'
import { partFootprint } from './transform'
import type { CamInput, PlannedToolpath } from './types'

type ManualOp = CamResult['manualOps'][number]

interface PartResult {
  ops: PlannedToolpath[]
  profile: PlannedToolpath | null
  area: number
  /** Sheet-space footprint, null when the placement is invalid (nothing is machined). */
  footprint: PlacedFootprint | null
  manualOps: ManualOp[]
  warnings: BuildWarning[]
}

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > GEOMETRY_EPSILON
}

function placementWarnings(ctx: PartContext, sheet: Sheet): BuildWarning[] {
  const { part, placement } = ctx
  const warnings: BuildWarning[] = []
  const sizeX = placement.rotated ? part.width : part.length
  const sizeY = placement.rotated ? part.length : part.width
  if (differs(placement.sizeX, sizeX) || differs(placement.sizeY, sizeY)) {
    const message = `Placement of ${part.id} is ${f(placement.sizeX)} × ${f(placement.sizeY)} mm but the part is ${f(sizeX)} × ${f(sizeY)} mm; toolpaths follow the part size`
    warnings.push(partWarning(ctx, 'warn', 'cam/placement-size-mismatch', message))
  }
  if (differs(part.thickness, sheet.thickness)) {
    const message = `Part ${part.id} is ${f(part.thickness)} mm thick but sheet ${sheet.id} is ${f(sheet.thickness)} mm; cutting to the sheet thickness`
    warnings.push(partWarning(ctx, 'warn', 'cam/thickness-mismatch', message))
  }
  if (part.materialId !== sheet.materialId) {
    const message = `Part ${part.id} is ${part.materialId} but sheet ${sheet.id} is ${sheet.materialId}`
    warnings.push(partWarning(ctx, 'warn', 'cam/material-mismatch', message))
  }
  return warnings
}

/** Reason the placed part cannot be machined at all, or null. */
function invalidPlacementReason(part: Part, placement: Placement): string | null {
  const finite = [placement.x, placement.y].every(Number.isFinite)
  const sized = [part.length, part.width].every((v) => Number.isFinite(v) && v > 0)
  if (finite && sized) return null
  return `part ${part.id} has an invalid placement (${f(placement.x)}, ${f(placement.y)}) or size ${f(part.length)} × ${f(part.width)} mm`
}

function skippedPart(part: Part, reason: string): PartResult {
  return {
    ops: [],
    profile: null,
    area: 0,
    footprint: null,
    manualOps: part.ops.map((op) => ({ partId: part.id, opId: op.id, reason })),
    warnings: [{ level: 'error', code: 'cam/placement-invalid', message: `Not machined: ${reason}`, cabinetId: part.cabinetId, partId: part.id }],
  }
}

function planPart(sheet: Sheet, part: Part, placement: Placement, input: CamInput, tools: CamTools): PartResult {
  const invalid = invalidPlacementReason(part, placement)
  if (invalid) return skippedPart(part, invalid)
  const ctx = makePartContext(sheet, part, placement, input.machine, tools)
  const ops: PlannedToolpath[] = []
  const manualOps: ManualOp[] = []
  const warnings = placementWarnings(ctx, sheet)
  for (const op of part.ops) {
    const plan = planOp(op, ctx)
    warnings.push(...plan.warnings)
    if (plan.status === 'machined') ops.push(plan.toolpath)
    else manualOps.push({ partId: part.id, opId: op.id, reason: plan.reason })
  }
  const profile = planProfile(ctx)
  warnings.push(...profile.warnings)
  const footprint = { partId: part.id, cabinetId: part.cabinetId, rect: partFootprint(placement, part) }
  return { ops, profile: profile.toolpath, area: part.length * part.width, footprint, manualOps, warnings }
}

function sheetWarnings(input: CamInput): BuildWarning[] {
  const { sheet, machine } = input
  if (sheet.length <= machine.tableX && sheet.width <= machine.tableY) return []
  return [
    {
      level: 'error',
      code: 'cam/sheet-exceeds-table',
      message: `Sheet ${sheet.id} (${f(sheet.length)} × ${f(sheet.width)} mm) is larger than the ${f(machine.tableX)} × ${f(machine.tableY)} mm table`,
    },
  ]
}

function toToolpath(sheet: Sheet, p: PlannedToolpath): Toolpath {
  return { id: p.id, sheetId: sheet.id, partId: p.partId, kind: p.kind, toolId: p.tool.id, passes: p.passes }
}

export function generateToolpaths(input: CamInput): CamResult {
  const { sheet, machine } = input
  const resolved = resolveTools(machine, input.tools)
  const warnings: BuildWarning[] = [...machineWarnings(machine), ...resolved.warnings, ...sheetWarnings(input)]
  const seen = new Set<string>()
  const results: PartResult[] = []
  for (const placement of sheet.placements) {
    const part = input.parts.get(placement.partId)
    if (!part) {
      warnings.push({ level: 'error', code: 'cam/part-missing', message: `Placed part ${placement.partId} is unknown; it is not machined`, partId: placement.partId })
      continue
    }
    if (seen.has(part.id)) {
      const message = `Part ${part.id} is placed more than once on ${sheet.id}; only the first placement is machined`
      warnings.push({ level: 'error', code: 'cam/duplicate-placement', message, cabinetId: part.cabinetId, partId: part.id })
      continue
    }
    seen.add(part.id)
    results.push(planPart(sheet, part, placement, input, resolved.tools))
  }
  const profiles = results
    .filter((r): r is PartResult & { profile: PlannedToolpath } => r.profile !== null)
    .sort((a, b) => a.area - b.area || a.profile.partId.localeCompare(b.profile.partId))
    .map((r) => r.profile)
  const ordered = orderToolpaths([...results.flatMap((r) => r.ops), ...profiles])
  const footprints = results.map((r) => r.footprint).filter((fp): fp is PlacedFootprint => fp !== null)
  return {
    sheetId: sheet.id,
    toolpaths: ordered.map((p) => toToolpath(sheet, p)),
    manualOps: results.flatMap((r) => r.manualOps),
    warnings: [
      ...warnings,
      ...results.flatMap((r) => r.warnings),
      ...ordered.flatMap((p) => boundsWarnings(p, sheet, machine)),
      ...neighbourWarnings(footprints, ordered),
    ],
  }
}
