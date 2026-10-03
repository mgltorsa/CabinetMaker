/**
 * Toe kick (decision, since parts must stay rectangular):
 * - none: the carcass sits on the floor (or at floorHeight).
 * - panel: a separate kick base under the carcass — a front board recessed by
 *   `setback`, a rear rail, end sleepers and sleepers under every divider (and
 *   at most KICK_SLEEPER_MAX_SPACING apart).
 * - full: the sides run to the floor; a kick board recessed by `setback`
 *   spans between them under the raised bottom.
 * Kick parts are butt-jointed (screwed) and carry no ops.
 */
import type { SignedAxis } from '@/core/types'
import { KICK_SLEEPER_MAX_SPACING, MIN_INTERIOR_DEPTH } from './constants'
import { emptyResult, warning, type BuildContext, type RuleResult } from './context'
import { boxOf, makePart, span, spanMid, spanSize, type FramedPart, type Span } from './geometry'

export function buildToeKick(ctx: BuildContext): RuleResult {
  const { cabinet, dims: d, mats, layout } = ctx
  const kick = cabinet.construction.toeKick
  if (kick.type === 'none' || d.yB <= d.y0) return emptyResult()
  const setback = Math.max(0, kick.setback)
  const frontZ = span(d.D - setback - d.t, d.D - setback)
  const y = span(d.y0, d.yB)
  const make = (role: string, name: string, x: Span, z: Span, length: SignedAxis, faceA: SignedAxis): FramedPart =>
    makePart({ cabinetId: cabinet.id, role, name, group: 'toe-kick', materialId: mats.carcass.id, grain: mats.carcass.grain, bounds: boxOf(x, y, z), length, faceA })

  if (kick.type === 'full') {
    if (frontZ.lo < d.rearZ) return skipped(ctx)
    return { ...emptyResult(), parts: [make('kick-board', 'Kick board', d.interiorX, frontZ, '+x', '-z')] }
  }
  const rearZ = span(0, d.t)
  const sleeperZ = span(rearZ.hi, frontZ.lo)
  if (spanSize(sleeperZ) < MIN_INTERIOR_DEPTH) return skipped(ctx)
  const centres = sleeperCentres(d.carcassX, d.t, layout.dividers.map(spanMid))
  const sleepers = centres.map((cx, i) => make(`kick-sleeper-${i + 1}`, `Kick sleeper ${i + 1}`, span(cx - d.t / 2, cx + d.t / 2), sleeperZ, '+z', '+x'))
  return {
    ...emptyResult(),
    parts: [make('kick-front', 'Kick front', d.carcassX, frontZ, '+x', '-z'), make('kick-back', 'Kick rear rail', d.carcassX, rearZ, '+x', '+z'), ...sleepers],
  }
}

function skipped(ctx: BuildContext): RuleResult {
  return { ...emptyResult(), warnings: [warning(ctx.cabinet.id, 'warn', 'toe-kick-skipped', 'Toe kick setback leaves no room for the kick; omitted')] }
}

/** End sleepers, one under each divider, plus extras so no gap exceeds the max spacing. */
function sleeperCentres(carcassX: Span, t: number, dividerCentres: number[]): number[] {
  const ends = [carcassX.lo + t / 2, carcassX.hi - t / 2]
  const fixed = [...ends, ...dividerCentres].sort((a, b) => a - b)
  return fixed.flatMap((c, i) => {
    const next = fixed[i + 1]
    if (next === undefined) return [c]
    const gaps = Math.ceil((next - c) / KICK_SLEEPER_MAX_SPACING)
    return Array.from({ length: gaps }, (_, k) => c + ((next - c) * k) / gaps)
  })
}
