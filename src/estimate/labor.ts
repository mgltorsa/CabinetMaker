/**
 * Labor buckets (minutes → cost at the shop rate):
 *
 * - cutting  = nest sheets × minutesPerSheet
 *              + (nested placements + linear parts) × minutesPerPart
 * - joinery  = (dado ops + mortise ops + holes with purpose dowel/domino) × minutesPerJoineryOp
 * - drilling = all other holes × minutesPerHole
 * - hardware = Σ hardware usage qty × minutesPerHardwareItem
 * - assembly = built cabinets (`build.cabinets.length`) × assemblyMinutesPerCabinet
 *
 * Ops are counted over every built part (unplaced parts still need joinery).
 * cost = minutes / 60 × shopRate, rounded to cents. Negative or non-finite
 * settings and quantities count as 0.
 */
import type { EstimateSettings, LaborLine, NestResult, Op, Part, ProjectBuild } from '@/core/types'
import { round } from '@/core/units'
import { roundMoney } from './money'
import { nonNegative } from './settings'

export const LABOR_BUCKETS: readonly LaborLine['bucket'][] = ['cutting', 'joinery', 'drilling', 'hardware', 'assembly']

const MINUTES_PER_HOUR = 60
const MINUTE_DECIMALS = 2
const JOINERY_HOLE_PURPOSES: ReadonlySet<Op['purpose']> = new Set(['dowel', 'domino'])

export interface OpCounts {
  joinery: number
  drilling: number
}

function isJoinery(op: Op): boolean {
  return op.kind !== 'hole' || JOINERY_HOLE_PURPOSES.has(op.purpose)
}

export function countOps(parts: readonly Part[]): OpCounts {
  const ops = parts.flatMap((p) => p.ops)
  const joinery = ops.filter(isJoinery).length
  return { joinery, drilling: ops.length - joinery }
}

function bucketMinutes(settings: EstimateSettings, build: ProjectBuild, nest: NestResult): Record<LaborLine['bucket'], number> {
  const { labor } = settings
  const nestedParts = nest.sheets.reduce((acc, s) => acc + s.placements.length, 0)
  const cutParts = nestedParts + nest.linearPartIds.length
  const ops = countOps(build.parts)
  const hardwareQty = build.hardware.reduce((acc, h) => acc + nonNegative(h.qty), 0)
  return {
    cutting: nest.sheets.length * nonNegative(labor.minutesPerSheet) + cutParts * nonNegative(labor.minutesPerPart),
    joinery: ops.joinery * nonNegative(labor.minutesPerJoineryOp),
    drilling: ops.drilling * nonNegative(labor.minutesPerHole),
    hardware: hardwareQty * nonNegative(labor.minutesPerHardwareItem),
    assembly: build.cabinets.length * nonNegative(labor.assemblyMinutesPerCabinet),
  }
}

export function buildLabor(settings: EstimateSettings, build: ProjectBuild, nest: NestResult): LaborLine[] {
  const minutes = bucketMinutes(settings, build, nest)
  const shopRate = nonNegative(settings.shopRate)
  return LABOR_BUCKETS.map((bucket) => ({
    bucket,
    minutes: round(minutes[bucket], MINUTE_DECIMALS),
    cost: roundMoney((minutes[bucket] / MINUTES_PER_HOUR) * shopRate),
  }))
}
