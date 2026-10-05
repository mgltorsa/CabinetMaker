import { describe, expect, it } from 'vitest'
import type { WallOpening } from '@/core/types'
import { BACK_WALL_ID, clampOpening, rectangularRoom, rectRoomParams, roomBounds, wallFrame, wallPieces } from './room'

const PARAMS = { width: 4000, depth: 3000, height: 2400, thickness: 100 }

describe('rectangularRoom', () => {
  it('builds four walls around a floor whose back-left inner corner is the origin', () => {
    const room = rectangularRoom(PARAMS)
    expect(room.walls.map((w) => w.id)).toEqual(['wall-back', 'wall-right', 'wall-front', 'wall-left'])
    expect(room.walls[0]).toMatchObject({ id: BACK_WALL_ID, start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, height: 2400, thickness: 100 })
    expect(room.openings).toEqual([])
    expect(roomBounds(room)).toEqual({ minX: 0, maxX: 4000, minZ: 0, maxZ: 3000 })
  })

  it('round-trips through rectRoomParams', () => {
    expect(rectRoomParams(rectangularRoom(PARAMS))).toEqual(PARAMS)
  })

  it('keeps openings when resized, clamped to their (shorter) wall', () => {
    const door: WallOpening = { id: 'o1', wallId: BACK_WALL_ID, kind: 'door', offset: 3000, width: 900, height: 2100, sillHeight: 0 }
    const room = rectangularRoom(PARAMS, [door])
    const smaller = rectangularRoom({ ...PARAMS, width: 2000, height: 2000 }, room.openings)
    expect(smaller.openings).toEqual([{ ...door, offset: 1100, height: 2000 }])
  })

  it('drops openings whose wall no longer exists', () => {
    const lost: WallOpening = { id: 'o1', wallId: 'gone', kind: 'window', offset: 0, width: 500, height: 500, sillHeight: 900 }
    expect(rectangularRoom(PARAMS, [lost]).openings).toEqual([])
  })
})

describe('rectRoomParams', () => {
  it('is null for rooms that are not the builder’s rectangle', () => {
    const room = rectangularRoom(PARAMS)
    expect(rectRoomParams({ ...room, walls: room.walls.slice(0, 3) })).toBeNull()
    expect(rectRoomParams({ walls: room.walls.map((w, i) => (i === 1 ? { ...w, end: { x: 4100, y: 3000 } } : w)), openings: [] })).toBeNull()
  })
})

describe('wallFrame', () => {
  it('puts the thickness on the outside of the room', () => {
    const [back, right, front, left] = rectangularRoom(PARAMS).walls
    expect(wallFrame(back!).outward).toEqual({ x: 0, z: -1 })
    expect(wallFrame(right!).outward).toEqual({ x: 1, z: 0 })
    expect(wallFrame(front!).outward).toEqual({ x: 0, z: 1 })
    expect(wallFrame(left!).outward).toEqual({ x: -1, z: 0 })
    expect(wallFrame(back!).length).toBe(4000)
  })
})

describe('clampOpening', () => {
  it('keeps an opening inside its wall', () => {
    const wall = rectangularRoom(PARAMS).walls[0]!
    const o: WallOpening = { id: 'o', wallId: wall.id, kind: 'window', offset: -50, width: 5000, height: 3000, sillHeight: 2000 }
    expect(clampOpening(o, wall)).toEqual({ ...o, offset: 0, width: 4000, height: 400, sillHeight: 2000 })
  })
})

describe('wallPieces', () => {
  const wall = rectangularRoom(PARAMS).walls[0]!

  it('is one solid piece without openings', () => {
    expect(wallPieces(wall, [])).toEqual([{ u0: 0, u1: 4000, v0: 0, v1: 2400 }])
  })

  it('cuts a door: left, right and the lintel above', () => {
    const door: WallOpening = { id: 'd', wallId: wall.id, kind: 'door', offset: 1000, width: 900, height: 2100, sillHeight: 0 }
    expect(wallPieces(wall, [door])).toEqual([
      { u0: 0, u1: 1000, v0: 0, v1: 2400 },
      { u0: 1000, u1: 1900, v0: 2100, v1: 2400 },
      { u0: 1900, u1: 4000, v0: 0, v1: 2400 },
    ])
  })

  it('cuts a window: sill below and lintel above', () => {
    const win: WallOpening = { id: 'w', wallId: wall.id, kind: 'window', offset: 2000, width: 1000, height: 1000, sillHeight: 900 }
    const pieces = wallPieces(wall, [win])
    expect(pieces).toContainEqual({ u0: 2000, u1: 3000, v0: 0, v1: 900 })
    expect(pieces).toContainEqual({ u0: 2000, u1: 3000, v0: 1900, v1: 2400 })
    const area = pieces.reduce((a, p) => a + (p.u1 - p.u0) * (p.v1 - p.v0), 0)
    expect(area).toBe(4000 * 2400 - 1000 * 1000)
  })

  it('ignores openings of other walls and merges overlapping ones', () => {
    const a: WallOpening = { id: 'a', wallId: wall.id, kind: 'window', offset: 500, width: 1000, height: 1000, sillHeight: 1000 }
    const b: WallOpening = { ...a, id: 'b', offset: 1200 }
    const other: WallOpening = { ...a, id: 'c', wallId: 'wall-left' }
    const pieces = wallPieces(wall, [a, b, other])
    const area = pieces.reduce((s, p) => s + (p.u1 - p.u0) * (p.v1 - p.v0), 0)
    expect(area).toBe(4000 * 2400 - 1700 * 1000)
    for (const p of pieces) expect(p.u1).toBeGreaterThan(p.u0)
  })
})
