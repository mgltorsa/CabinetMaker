/**
 * Holes on face A: drill (peck) when the drill fits, otherwise a circular
 * pocket with an end mill, otherwise a manual op.
 *
 * Pockets run counter-clockwise seen from above: with an M3 (clockwise)
 * spindle that is climb milling on the hole wall.
 */
import type { HoleOp, Mm, Tool, Vec3 } from '@/core/types'
import { opDepthWarnings } from './checks'
import { CHORD_ERROR, DRILL_DIAMETER_TOLERANCE, FIT_TOLERANCE, MIN_PASS_OVERLAP } from './constants'
import { sheetToolpath, type PartContext } from './context'
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

function ringPoints(cx: Mm, cy: Mm, radius: Mm, zFrom: Mm, zTo: Mm): Vec3[] {
  const n = circleSegments(radius, CHORD_ERROR)
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a), z: zFrom + ((zTo - zFrom) * i) / n }
  })
}

/**
 * Per depth level: one helical turn down on the innermost ring, a full turn
 * at depth, then each larger ring outwards. Rings overlap ≥ 10 % of the tool.
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
    const helix = ringPoints(cx, cy, inner, zTop, z)
    const rings = radii.flatMap((r, ri) => ringPoints(cx, cy, r, z, z).slice(ri === 0 ? 1 : 0))
    return [...helix, ...rings]
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

export function planHole(op: HoleOp, ctx: PartContext): OpPlan {
  const { drill, endMills } = ctx.tools
  if (drillFits(drill, op.diameter)) {
    const passes = peckPasses(op.x, op.y, depthLevels(op.depth, drill.stepDown))
    return {
      status: 'machined',
      toolpath: sheetToolpath(ctx, op.id, 'drill', 'drill', drill, passes),
      warnings: opDepthWarnings(ctx, op, op.depth, drill),
    }
  }
  const mill = endMills.find((t) => t.diameter <= op.diameter + FIT_TOLERANCE)
  if (!mill) return { status: 'manual', reason: noToolReason(ctx, op.diameter), warnings: [] }
  const passes = circularPocketPasses(op.x, op.y, op.diameter / 2, mill, depthLevels(op.depth, mill.stepDown))
  return {
    status: 'machined',
    toolpath: sheetToolpath(ctx, op.id, 'pocket', 'groove', mill, passes),
    warnings: opDepthWarnings(ctx, op, op.depth, mill),
  }
}
