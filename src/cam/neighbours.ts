/**
 * Checks between the parts on one sheet: a cut that reaches a neighbouring
 * part would ruin it. All geometry is sheet space (mm).
 *
 * - Profiles: the profile tool runs one radius outside the footprint, so it
 *   removes material up to one **diameter** from the part edge. Two placed
 *   footprints closer than that (Euclidean distance, so diagonal neighbours
 *   are measured corner to corner) are an error. A nest valid for a part gap
 *   ≥ the profile tool diameter never triggers it.
 * - Other toolpaths (through-dado overruns, in practice): any cutting move
 *   whose tool envelope enters another part's footprint is an error.
 */
import type { BuildWarning, Id, Mm, Tool } from '@/core/types'
import { GEOMETRY_EPSILON } from './constants'
import { formatForMessage as f } from './format'
import type { Rect } from './transform'
import type { PlannedToolpath } from './types'

export interface PlacedFootprint {
  partId: Id
  cabinetId: Id
  rect: Rect
}

interface Point {
  x: Mm
  y: Mm
}

/** Clear distance between two rectangles; 0 when they touch or overlap. */
export function rectDistance(a: Rect, b: Rect): Mm {
  const dx = Math.max(0, b.minX - a.maxX, a.minX - b.maxX)
  const dy = Math.max(0, b.minY - a.maxY, a.minY - b.maxY)
  return Math.hypot(dx, dy)
}

function pointRectDistance(p: Point, r: Rect): Mm {
  return rectDistance({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }, r)
}

function pointSegmentDistance(p: Point, a: Point, b: Point): Mm {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Liang–Barsky: does the closed segment a→b touch the closed rectangle? */
function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edges: readonly (readonly [number, number])[] = [
    [-dx, a.x - r.minX],
    [dx, r.maxX - a.x],
    [-dy, a.y - r.minY],
    [dy, r.maxY - a.y],
  ]
  let t0 = 0
  let t1 = 1
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return true
}

/** Distance from the segment a→b to the rectangle; 0 when they touch. */
export function segmentRectDistance(a: Point, b: Point, r: Rect): Mm {
  if (segmentHitsRect(a, b, r)) return 0
  const corners: Point[] = [
    { x: r.minX, y: r.minY },
    { x: r.minX, y: r.maxY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
  ]
  return Math.min(pointRectDistance(a, r), pointRectDistance(b, r), ...corners.map((c) => pointSegmentDistance(c, a, b)))
}

/** Largest profile tool used on either part, or null when neither is profiled. */
function profileToolOf(a: Id, b: Id, profiles: ReadonlyMap<Id, Tool>): Tool | null {
  const tools = [profiles.get(a), profiles.get(b)].filter((t): t is Tool => t !== undefined)
  return tools.reduce<Tool | null>((big, t) => (big === null || t.diameter > big.diameter ? t : big), null)
}

function spacingWarnings(footprints: readonly PlacedFootprint[], profiles: ReadonlyMap<Id, Tool>): BuildWarning[] {
  return footprints.flatMap((a, i) =>
    footprints.slice(i + 1).flatMap((b): BuildWarning[] => {
      const tool = profileToolOf(a.partId, b.partId, profiles)
      if (!tool) return []
      const distance = rectDistance(a.rect, b.rect)
      if (!(distance < tool.diameter - GEOMETRY_EPSILON)) return []
      const message =
        `Parts ${a.partId} and ${b.partId} are ${f(distance)} mm apart, less than the ${f(tool.diameter)} mm profile tool T${tool.number}: ` +
        `profiling one cuts into the other. Nest with at least ${f(tool.diameter)} mm between parts`
      return [{ level: 'error', code: 'cam/parts-too-close', message, cabinetId: a.cabinetId, partId: a.partId }]
    }),
  )
}

/** Sheet-space box around every cutting point of a toolpath, grown by the tool radius. */
function envelopeBox(toolpath: PlannedToolpath): Rect | null {
  const points = toolpath.passes.flat()
  const first = points[0]
  if (!first) return null
  const r = toolpath.tool.diameter / 2
  const start: Rect = { minX: first.x, minY: first.y, maxX: first.x, maxY: first.y }
  // reduce, not Math.min(...points): pockets can have more points than a call takes arguments
  const box = points.reduce(
    (b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }),
    start,
  )
  return { minX: box.minX - r, minY: box.minY - r, maxX: box.maxX + r, maxY: box.maxY + r }
}

/** How far the toolpath's tool envelope reaches into `rect` (0 when it stays out). */
function intrusion(toolpath: PlannedToolpath, rect: Rect): Mm {
  const r = toolpath.tool.diameter / 2
  const nearest = toolpath.passes.reduce((best, pass) => {
    const segments = pass.length === 1 ? [[pass[0], pass[0]] as const] : pass.slice(1).map((p, i) => [pass[i] ?? p, p] as const)
    return segments.reduce((min, [a, b]) => (a && b ? Math.min(min, segmentRectDistance(a, b, rect)) : min), best)
  }, Number.POSITIVE_INFINITY)
  return Math.max(0, r - nearest)
}

function overrunWarnings(footprints: readonly PlacedFootprint[], toolpaths: readonly PlannedToolpath[]): BuildWarning[] {
  return toolpaths
    .filter((tp) => tp.phase !== 'profile')
    .flatMap((tp) => {
      const box = envelopeBox(tp)
      if (!box) return []
      return footprints
        .filter((other) => other.partId !== tp.partId && rectDistance(box, other.rect) === 0)
        .flatMap((other): BuildWarning[] => {
          const depth = intrusion(tp, other.rect)
          if (!(depth > GEOMETRY_EPSILON)) return []
          const message = `Toolpath ${tp.id} cuts ${f(depth)} mm into neighbouring part ${other.partId} with T${tp.tool.number}; space the parts further apart`
          return [{ level: 'error', code: 'cam/cut-reaches-neighbour', message, partId: tp.partId }]
        })
    })
}

/** Errors for cuts that reach a neighbouring part on the sheet. */
export function neighbourWarnings(footprints: readonly PlacedFootprint[], toolpaths: readonly PlannedToolpath[]): BuildWarning[] {
  const profiles = new Map(toolpaths.filter((tp) => tp.phase === 'profile').map((tp) => [tp.partId, tp.tool]))
  return [...spacingWarnings(footprints, profiles), ...overrunWarnings(footprints, toolpaths)]
}
