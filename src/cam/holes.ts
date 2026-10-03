/**
 * Holes on face A: drill (peck) when the drill fits, otherwise a circular
 * pocket with an end mill, otherwise a manual op.
 *
 * Pockets run counter-clockwise seen from above: with an M3 (clockwise)
 * spindle that is climb milling on the hole wall. Pocket entries are helical,
 * no steeper than MAX_HELIX_ANGLE_DEG.
 *
 * Holes at least as deep as the stock are through holes, cut to
 * `thickness + throughCutExtra`.
 */
import type { BuildWarning, HoleOp, Mm, Tool, Vec3 } from '@/core/types'
import { fluteLengthWarnings, opDepthWarnings } from './checks'
import {
  CHORD_ERROR,
  DRILL_DIAMETER_TOLERANCE,
  FIT_TOLERANCE,
  GEOMETRY_EPSILON,
  MAX_HELIX_ANGLE_DEG,
  MAX_HELIX_TURNS,
  MIN_PASS_OVERLAP,
} from './constants'
import { partWarning, sheetToolpath, type PartContext } from './context'
import { formatForMessage as f } from './format'
import { circleSegments, depthLevels } from './geometry'
import type { OpPlan } from './types'

/** Vertical passes at (x, y): each one feeds from the previous depth to the next. */
export function peckPasses(x: Mm, y: Mm, levels: readonly Mm[]): Vec3[][] {
  return levels.map((depth, i) => [
    { x, y, z: -(levels[i - 1] ?? 0) },
    { x, y, z: -depth },
  ])
}

/** Tool-centre ring radii from the innermost (≤ tool radius) to `outer`. */
function ringRadii(outer: Mm, toolRadius: Mm, maxStep: Mm): Mm[] {
  if (outer <= toolRadius) return [outer]
  const count = Math.ceil((outer - toolRadius) / maxStep - 1e-9)
  return Array.from({ length: count + 1 }, (_, i) => toolRadius + ((outer - toolRadius) * i) / count)
}

/** Counter-clockwise polygon turns on a circle, descending linearly from zFrom to zTo. */
function ringPoints(cx: Mm, cy: Mm, radius: Mm, zFrom: Mm, zTo: Mm, turns = 1): Vec3[] {
  const perTurn = circleSegments(radius, CHORD_ERROR)
  const n = perTurn * turns
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / perTurn
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a), z: zFrom + ((zTo - zFrom) * i) / n }
  })
}

/** Turns needed so a helix of `radius` descends `drop` no steeper than MAX_HELIX_ANGLE_DEG (per polygon segment). */
export function helixTurns(radius: Mm, drop: Mm): number {
  const perTurn = circleSegments(radius, CHORD_ERROR)
  const perimeter = perTurn * 2 * radius * Math.sin(Math.PI / perTurn)
  const maxDropPerTurn = perimeter * Math.tan((MAX_HELIX_ANGLE_DEG * Math.PI) / 180)
  return Math.max(1, Math.ceil(drop / maxDropPerTurn - 1e-9))
}

/** Entry from zTop to z on the inner ring: a helix, or a straight plunge when the helix would need too many turns. */
function pocketEntry(cx: Mm, cy: Mm, inner: Mm, zTop: Mm, z: Mm): Vec3[] {
  const turns = helixTurns(inner, zTop - z)
  if (turns <= MAX_HELIX_TURNS) return ringPoints(cx, cy, inner, zTop, z, turns)
  return [
    { x: cx + inner, y: cy, z: zTop },
    { x: cx + inner, y: cy, z },
  ]
}

/**
 * Per depth level: a helical entry down on the innermost ring (as many turns
 * as keep the ramp ≤ MAX_HELIX_ANGLE_DEG), a full turn at depth, then each
 * larger ring outwards. Rings overlap ≥ 10 % of the tool.
 */
export function circularPocketPasses(cx: Mm, cy: Mm, holeRadius: Mm, tool: Tool, levels: readonly Mm[]): Vec3[][] {
  const toolRadius = tool.diameter / 2
  const outer = holeRadius - toolRadius
  if (outer < FIT_TOLERANCE) return peckPasses(cx, cy, levels)
  const radii = ringRadii(outer, toolRadius, tool.diameter * (1 - MIN_PASS_OVERLAP))
  const inner = radii[0] ?? outer
  return levels.map((depth, i) => {
    const zTop = -(levels[i - 1] ?? 0)
    const z = -depth
    const entry = pocketEntry(cx, cy, inner, zTop, z)
    const rings = radii.flatMap((r, ri) => ringPoints(cx, cy, r, z, z).slice(ri === 0 ? 1 : 0))
    return [...entry, ...rings]
  })
}

function drillFits(drill: Tool | null, diameter: Mm): drill is Tool {
  return drill !== null && Math.abs(diameter - drill.diameter) <= DRILL_DIAMETER_TOLERANCE + 1e-9
}

function noToolReason(ctx: PartContext, diameter: Mm): string {
  const { drill, endMills } = ctx.tools
  const drillText = drill ? `drill T${drill.number} is ${f(drill.diameter)} mm (±${DRILL_DIAMETER_TOLERANCE})` : 'no drill tool'
  const smallest = endMills[endMills.length - 1]
  const millText = smallest ? `smallest end mill T${smallest.number} is ${f(smallest.diameter)} mm` : 'no end mill'
  return `no tool for a ${f(diameter)} mm hole: ${drillText}, ${millText}`
}

interface HoleDepth {
  /** Depth actually cut. */
  cut: Mm
  through: boolean
}

/**
 * A hole at least as deep as the stock is a through hole: it is cut
 * `throughCutExtra` below the stock (a negative extra is reported by the
 * machine checks and treated as 0) so it breaks out cleanly.
 */
function holeDepth(ctx: PartContext, op: HoleOp): HoleDepth {
  const t = ctx.stockThickness
  // Negated so an invalid (NaN) stock thickness keeps the hole's own depth instead of a NaN cut.
  if (!(op.depth >= t - GEOMETRY_EPSILON)) return { cut: op.depth, through: false }
  return { cut: t + Math.max(0, ctx.machine.throughCutExtra), through: true }
}

function holeWarnings(ctx: PartContext, op: HoleOp, depth: HoleDepth, tool: Tool): BuildWarning[] {
  if (!depth.through) return opDepthWarnings(ctx, op, depth.cut, tool)
  const flutes = fluteLengthWarnings(ctx, op, depth.cut, tool)
  if (!(op.depth > ctx.stockThickness + GEOMETRY_EPSILON)) return flutes
  const message = `Hole ${op.id} is ${f(op.depth)} mm deep, deeper than the ${f(ctx.stockThickness)} mm stock; cut as a through hole`
  return [...flutes, partWarning(ctx, 'warn', 'cam/deeper-than-stock', message)]
}

export function planHole(op: HoleOp, ctx: PartContext): OpPlan {
  const { drill, endMills } = ctx.tools
  const depth = holeDepth(ctx, op)
  if (drillFits(drill, op.diameter)) {
    const passes = peckPasses(op.x, op.y, depthLevels(depth.cut, drill.stepDown))
    return {
      status: 'machined',
      toolpath: sheetToolpath(ctx, op.id, 'drill', 'drill', drill, passes),
      warnings: holeWarnings(ctx, op, depth, drill),
    }
  }
  const mill = endMills.find((t) => t.diameter <= op.diameter + FIT_TOLERANCE)
  if (!mill) return { status: 'manual', reason: noToolReason(ctx, op.diameter), warnings: [] }
  const passes = circularPocketPasses(op.x, op.y, op.diameter / 2, mill, depthLevels(depth.cut, mill.stepDown))
  return {
    status: 'machined',
    toolpath: sheetToolpath(ctx, op.id, 'pocket', 'groove', mill, passes),
    warnings: holeWarnings(ctx, op, depth, mill),
  }
}
