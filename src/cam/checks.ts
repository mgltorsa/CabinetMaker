/** Safety checks that turn into warnings or manual-op reasons. */
import type { BuildWarning, Machine, Mm, Op, Sheet, Tool, Vec3 } from '@/core/types'
import { GEOMETRY_EPSILON } from './constants'
import { partWarning, type PartContext } from './context'
import { formatForMessage as fmt } from './format'
import type { PlannedToolpath } from './types'

/** Error when the tool's flutes are shorter than the cut depth. */
export function fluteLengthWarnings(ctx: PartContext, op: Op, depth: Mm, tool: Tool): BuildWarning[] {
  if (!(depth > tool.fluteLength)) return []
  const message = `Op ${op.id} is ${fmt(depth)} mm deep but T${tool.number} flutes are ${fmt(tool.fluteLength)} mm long`
  return [partWarning(ctx, 'error', 'cam/flute-length', message)]
}

/** Flute-length and stock-depth warnings for an op cut to `depth`. */
export function opDepthWarnings(ctx: PartContext, op: Op, depth: Mm, tool: Tool): BuildWarning[] {
  const flutes = fluteLengthWarnings(ctx, op, depth, tool)
  if (!(depth > ctx.stockThickness)) return flutes
  const message = `Op ${op.id} is ${fmt(depth)} mm deep, deeper than the ${fmt(ctx.stockThickness)} mm stock`
  return [...flutes, partWarning(ctx, 'error', 'cam/deeper-than-stock', message)]
}

interface Extent {
  minX: Mm
  minY: Mm
  maxX: Mm
  maxY: Mm
}

/** Panel-space extent of the material an op removes. */
export function opExtent(op: Op): Extent {
  switch (op.kind) {
    case 'hole': {
      const r = op.diameter / 2
      return { minX: op.x - r, minY: op.y - r, maxX: op.x + r, maxY: op.y + r }
    }
    case 'mortise': {
      const halfX = (op.axis === 'x' ? op.length : op.width) / 2
      const halfY = (op.axis === 'x' ? op.width : op.length) / 2
      return { minX: op.x - halfX, minY: op.y - halfY, maxX: op.x + halfX, maxY: op.y + halfY }
    }
    case 'dado': {
      const len = Math.hypot(op.x2 - op.x1, op.y2 - op.y1)
      const half = op.width / 2
      const nx = len > 0 ? (-(op.y2 - op.y1) / len) * half : half
      const ny = len > 0 ? ((op.x2 - op.x1) / len) * half : half
      const xs = [op.x1 + nx, op.x1 - nx, op.x2 + nx, op.x2 - nx]
      const ys = [op.y1 + ny, op.y1 - ny, op.y2 + ny, op.y2 - ny]
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
    }
  }
}

/** Reason the op cannot be cut because it leaves its part, or null. */
export function opOutsidePartReason(ctx: PartContext, op: Op): string | null {
  const e = opExtent(op)
  const eps = GEOMETRY_EPSILON
  const inside = e.minX >= -eps && e.minY >= -eps && e.maxX <= ctx.part.length + eps && e.maxY <= ctx.part.width + eps
  if (inside) return null
  return `extends outside the ${fmt(ctx.part.length)} × ${fmt(ctx.part.width)} mm part; cutting it would damage the sheet or a neighbouring part`
}

/** Names of numeric op fields that are not finite positive numbers. */
export function invalidOpFields(op: Op): string[] {
  const positive: Record<string, number> =
    op.kind === 'hole'
      ? { diameter: op.diameter, depth: op.depth }
      : op.kind === 'dado'
        ? { width: op.width, depth: op.depth }
        : { length: op.length, width: op.width, depth: op.depth }
  const finite: Record<string, number> =
    op.kind === 'dado' ? { x1: op.x1, y1: op.y1, x2: op.x2, y2: op.y2 } : { x: op.x, y: op.y }
  return [
    ...Object.entries(positive).filter(([, v]) => !(Number.isFinite(v) && v > 0)),
    ...Object.entries(finite).filter(([, v]) => !Number.isFinite(v)),
  ].map(([k]) => k)
}

function pointsOutside(points: readonly Vec3[], radius: Mm, maxX: Mm, maxY: Mm): boolean {
  const eps = GEOMETRY_EPSILON
  return points.some(
    (p) =>
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x - radius < -eps ||
      p.y - radius < -eps ||
      p.x + radius > maxX + eps ||
      p.y + radius > maxY + eps,
  )
}

/** Errors for a toolpath whose tool envelope leaves the sheet or the machine table. */
export function boundsWarnings(toolpath: PlannedToolpath, sheet: Sheet, machine: Machine): BuildWarning[] {
  const points = toolpath.passes.flat()
  const radius = toolpath.tool.diameter / 2
  const warnings: BuildWarning[] = []
  if (pointsOutside(points, radius, sheet.length, sheet.width)) {
    warnings.push({
      level: 'error',
      code: 'cam/outside-sheet',
      message: `Toolpath ${toolpath.id} leaves the ${fmt(sheet.length)} × ${fmt(sheet.width)} mm sheet`,
      partId: toolpath.partId,
    })
  }
  if (pointsOutside(points, radius, machine.tableX, machine.tableY)) {
    warnings.push({
      level: 'error',
      code: 'cam/outside-table',
      message: `Toolpath ${toolpath.id} leaves the ${fmt(machine.tableX)} × ${fmt(machine.tableY)} mm machine table`,
      partId: toolpath.partId,
    })
  }
  return warnings
}
