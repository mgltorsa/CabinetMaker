/**
 * Straight grooves (dados) and mortises, cut with the machine's dado tool.
 *
 * - An end that runs out of the part ("through") keeps the tool centre on the
 *   end point; the overrun lands in the profile cut-out around the part.
 * - A stopped end pulls the tool centre back by the tool radius so the cut
 *   ends exactly at the end point (with the tool's round corner).
 * - Wider grooves get parallel passes overlapping ≥ 10 % of the tool diameter.
 */
import type { DadoOp, Mm, MortiseOp, Tool, Vec3 } from '@/core/types'
import { opDepthWarnings } from './checks'
import { FIT_TOLERANCE, MIN_PASS_OVERLAP } from './constants'
import { sheetToolpath, type PartContext } from './context'
import { formatForMessage as f } from './format'
import { depthLevels, unitVector, type Vec2Like } from './geometry'
import type { OpPlan } from './types'

/** How far past an end point we probe to decide whether the groove runs out of the part. */
const THROUGH_PROBE = 0.01

interface GrooveSpec {
  start: Vec2Like
  end: Vec2Like
  width: Mm
  depth: Mm
  /** Force both ends stopped (mortises). */
  stopped: boolean
}

type GroovePasses = { ok: true; passes: Vec3[][] } | { ok: false; reason: string }

function outsidePart(ctx: PartContext, p: Vec2Like): boolean {
  return p.x < 0 || p.y < 0 || p.x > ctx.part.length || p.y > ctx.part.width
}

/** Tool-centre offsets across the groove width, centred on 0. */
export function parallelOffsets(width: Mm, toolDiameter: Mm): Mm[] {
  const spread = width - toolDiameter
  if (spread <= FIT_TOLERANCE) return [0]
  const count = Math.ceil(spread / (toolDiameter * (1 - MIN_PASS_OVERLAP)) - 1e-9) + 1
  return Array.from({ length: count }, (_, i) => -spread / 2 + (spread * i) / (count - 1))
}

function groovePasses(ctx: PartContext, spec: GrooveSpec, tool: Tool): GroovePasses {
  if (spec.width < tool.diameter - FIT_TOLERANCE) {
    return { ok: false, reason: `${f(spec.width)} mm wide, narrower than the ${f(tool.diameter)} mm tool T${tool.number}` }
  }
  const u = unitVector(spec.start, spec.end)
  if (!u) return { ok: false, reason: 'zero-length groove' }
  const r = tool.diameter / 2
  const startThrough = !spec.stopped && outsidePart(ctx, { x: spec.start.x - u.x * THROUGH_PROBE, y: spec.start.y - u.y * THROUGH_PROBE })
  const endThrough = !spec.stopped && outsidePart(ctx, { x: spec.end.x + u.x * THROUGH_PROBE, y: spec.end.y + u.y * THROUGH_PROBE })
  const length = Math.hypot(spec.end.x - spec.start.x, spec.end.y - spec.start.y)
  const startInset = startThrough ? 0 : r
  const endInset = endThrough ? 0 : r
  const centreLength = length - startInset - endInset
  if (centreLength < -FIT_TOLERANCE) {
    return { ok: false, reason: `${f(length)} mm long, shorter than the ${f(tool.diameter)} mm tool T${tool.number}` }
  }
  const a = { x: spec.start.x + u.x * startInset, y: spec.start.y + u.y * startInset }
  const b = centreLength > 0 ? { x: spec.end.x - u.x * endInset, y: spec.end.y - u.y * endInset } : a
  const normal = { x: -u.y, y: u.x }
  const offsets = parallelOffsets(spec.width, tool.diameter)
  const passes = depthLevels(spec.depth, tool.stepDown).flatMap((depth) =>
    offsets.map((o) => [
      { x: a.x + normal.x * o, y: a.y + normal.y * o, z: -depth },
      { x: b.x + normal.x * o, y: b.y + normal.y * o, z: -depth },
    ]),
  )
  return { ok: true, passes }
}

function planGroove(
  ctx: PartContext,
  op: DadoOp | MortiseOp,
  spec: GrooveSpec,
  kind: 'dado' | 'pocket',
): OpPlan {
  const tool = ctx.tools.dado
  // `resolveTools` already rejects drills; re-checked so a hand-built CamTools cannot groove with one.
  if (!tool || tool.kind === 'drill') {
    const why = tool ? ` (T${tool.number} is a drill)` : ''
    return { status: 'manual', reason: `no usable dado tool on the machine${why}`, warnings: [] }
  }
  const result = groovePasses(ctx, spec, tool)
  if (!result.ok) return { status: 'manual', reason: result.reason, warnings: [] }
  return {
    status: 'machined',
    toolpath: sheetToolpath(ctx, op.id, kind, 'groove', tool, result.passes),
    warnings: opDepthWarnings(ctx, op, op.depth, tool),
  }
}

export function planDado(op: DadoOp, ctx: PartContext): OpPlan {
  const spec: GrooveSpec = {
    start: { x: op.x1, y: op.y1 },
    end: { x: op.x2, y: op.y2 },
    width: op.width,
    depth: op.depth,
    stopped: false,
  }
  return planGroove(ctx, op, spec, 'dado')
}

export function planMortise(op: MortiseOp, ctx: PartContext): OpPlan {
  const half = op.length / 2
  const along = op.axis === 'x' ? { x: half, y: 0 } : { x: 0, y: half }
  const spec: GrooveSpec = {
    start: { x: op.x - along.x, y: op.y - along.y },
    end: { x: op.x + along.x, y: op.y + along.y },
    width: op.width,
    depth: op.depth,
    stopped: true,
  }
  return planGroove(ctx, op, spec, 'pocket')
}
