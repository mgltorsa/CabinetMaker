/**
 * Room shell: a rectangular room builder over the `Room` contract (walls +
 * openings) and the pure geometry the 3D view renders.
 *
 * Room space (see core/types): mm, origin at the inner back-left corner, +X
 * along the back wall, +Z into the room; wall points are (x, z) in `Vec2.x/y`.
 * A wall's segment is its inner face; its thickness extends to the outside,
 * on the side of (dz, -dx) — the builder lists walls in that winding.
 */
import type { Mm, Room, Wall, WallOpening } from '@/core/types'

export const BACK_WALL_ID = 'wall-back'
const WALL_IDS = [BACK_WALL_ID, 'wall-right', 'wall-front', 'wall-left'] as const

export interface RectRoomParams {
  width: Mm
  depth: Mm
  height: Mm
  thickness: Mm
}

export const DEFAULT_ROOM: RectRoomParams = { width: 4000, depth: 3000, height: 2400, thickness: 100 }

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

/** Keep an opening inside its wall (same width when it fits, shifted left if needed). */
export function clampOpening(opening: WallOpening, wall: Wall): WallOpening {
  const length = wallFrame(wall).length
  const width = clamp(opening.width, 0, length)
  const sillHeight = clamp(opening.sillHeight, 0, wall.height)
  return {
    ...opening,
    width,
    offset: clamp(opening.offset, 0, length - width),
    sillHeight,
    height: clamp(opening.height, 0, wall.height - sillHeight),
  }
}

/** Four walls around a `width` × `depth` floor. Openings on surviving walls are kept and clamped. */
export function rectangularRoom(params: RectRoomParams, openings: readonly WallOpening[] = []): Room {
  const { width: w, depth: d, height, thickness } = params
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d },
    { x: 0, y: d },
  ]
  const walls: Wall[] = WALL_IDS.map((id, i) => ({
    id,
    start: corners[i]!,
    end: corners[(i + 1) % corners.length]!,
    thickness,
    height,
  }))
  const byId = new Map(walls.map((wall) => [wall.id, wall]))
  const kept = openings.flatMap((o) => {
    const wall = byId.get(o.wallId)
    return wall ? [clampOpening(o, wall)] : []
  })
  return { walls, openings: kept }
}

/** Builder parameters of a room the builder made, else `null` (hand-edited or imported shapes). */
export function rectRoomParams(room: Room): RectRoomParams | null {
  const [back, right] = room.walls
  if (room.walls.length !== WALL_IDS.length || !back || !right) return null
  const params = { width: back.end.x, depth: right.end.y, height: back.height, thickness: back.thickness }
  const rebuilt = rectangularRoom(params).walls
  return JSON.stringify(rebuilt) === JSON.stringify(room.walls) ? params : null
}

/** Inner extents of the room's walls (room space, mm). */
export function roomBounds(room: Room): { minX: Mm; maxX: Mm; minZ: Mm; maxZ: Mm } {
  const xs = room.walls.flatMap((w) => [w.start.x, w.end.x])
  const zs = room.walls.flatMap((w) => [w.start.y, w.end.y])
  if (xs.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

/** Room-space X of the room's centre: the 3D view centres on it while the room is shown. */
export function roomCentreX(room: Room): Mm {
  const { minX, maxX } = roomBounds(room)
  return (minX + maxX) / 2
}

export interface WallFrame {
  length: Mm
  /** Unit direction start → end, room (x, z). */
  dir: { x: number; z: number }
  /** Unit normal pointing out of the room (the side the thickness is on). */
  outward: { x: number; z: number }
}

export function wallFrame(wall: Wall): WallFrame {
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.y - wall.start.y
  const length = Math.hypot(dx, dz)
  const ux = length === 0 ? 1 : dx / length
  const uz = length === 0 ? 0 : dz / length
  // `|| 0` folds -0 into 0.
  return { length, dir: { x: ux || 0, z: uz || 0 }, outward: { x: uz || 0, z: -ux || 0 } }
}

/** A solid rectangle of wall in wall space: u along the wall from its start, v up from the floor. */
export interface WallPiece {
  u0: Mm
  u1: Mm
  v0: Mm
  v1: Mm
}

type Span = [number, number]

/** `[0, height]` minus the union of `holes`, as sorted solid spans. */
function solidSpans(height: number, holes: readonly Span[]): Span[] {
  const sorted = [...holes].sort((a, b) => a[0] - b[0])
  const spans: Span[] = []
  let cursor = 0
  for (const [lo, hi] of sorted) {
    if (lo > cursor) spans.push([cursor, lo])
    cursor = Math.max(cursor, hi)
  }
  if (cursor < height) spans.push([cursor, height])
  return spans
}

/** Solid parts of a wall once its openings are cut out (columns between opening edges, merged when equal). */
export function wallPieces(wall: Wall, openings: readonly WallOpening[]): WallPiece[] {
  const { length } = wallFrame(wall)
  const holes = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => clampOpening(o, wall))
    .filter((o) => o.width > 0 && o.height > 0)
  const edges = [...new Set([0, length, ...holes.flatMap((o) => [o.offset, o.offset + o.width])])].sort((a, b) => a - b)
  const pieces: WallPiece[] = []
  let open: { u0: number; u1: number; spans: Span[] } | null = null
  const flush = (): void => {
    if (open) for (const [v0, v1] of open.spans) pieces.push({ u0: open.u0, u1: open.u1, v0, v1 })
    open = null
  }
  for (let i = 0; i + 1 < edges.length; i++) {
    const u0 = edges[i]!
    const u1 = edges[i + 1]!
    const mid = (u0 + u1) / 2
    const cut = holes.filter((o) => o.offset < mid && mid < o.offset + o.width).map((o): Span => [o.sillHeight, o.sillHeight + o.height])
    const spans = solidSpans(wall.height, cut)
    const current: { u0: number; u1: number; spans: Span[] } | null = open
    if (current && JSON.stringify(current.spans) === JSON.stringify(spans)) {
      current.u1 = u1
    } else {
      flush()
      open = { u0, u1, spans }
    }
  }
  flush()
  return pieces
}
