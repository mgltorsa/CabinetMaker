import { describe, expect, it } from 'vitest'
import { buildCabinet } from '@/engine'
import { bay, section, testCabinet } from '@/engine/testkit'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from './defaults'
import { resolveHandle } from './handles'
import { pullPlacements } from './pull-placement'
import type { Cabinet, CabinetType, Part, Vec3 } from './types'

function front(pullId: string, role: string, type: CabinetType = 'base'): { part: Part; cabinet: Cabinet; placements: ReturnType<typeof pullPlacements> } {
  const base = testCabinet({ type, sections: [section([bay('drawer', 150), bay('door', null, { hingeSide: 'left' })])] })
  const cabinet: Cabinet = { ...base, hardware: { ...base.hardware, pullId } }
  const b = buildCabinet(cabinet, { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE })
  const part = b.parts.find((p) => p.role === role)!
  const item = DEFAULT_HARDWARE.find((h) => h.id === pullId)!
  return { part, cabinet, placements: pullPlacements(part, cabinet, resolveHandle(item)) }
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })

describe('pullPlacements', () => {
  it('places a bar between its two holes on the show face, pointing out of the front', () => {
    const { part, placements } = front('pull-bar-128', 'drawer-front-1-1')
    expect(placements).toHaveLength(1)
    const [p] = placements
    expect(p!.style).toBe('bar')
    expect(p!.holes).toHaveLength(2)
    expect(p!.normal).toEqual({ x: 0, y: 0, z: 1 })
    expect(p!.centre.z).toBeCloseTo(part.bounds.max.z, 6)
    expect(p!.centre.x).toBeCloseTo((part.bounds.min.x + part.bounds.max.x) / 2, 6)
    expect(Math.abs(p!.along.x)).toBe(1)
    expect(p!.length).toBe(158)
  })

  it('runs door bars vertically', () => {
    const { placements } = front('pull-bar-128', 'door-1-2')
    expect(Math.abs(placements[0]!.along.y)).toBe(1)
  })

  it('places a knob on its single hole', () => {
    const { placements } = front('pull-knob-30', 'door-1-2')
    expect(placements).toHaveLength(1)
    expect(placements[0]!.holes).toHaveLength(1)
    expect(placements[0]!.centre).toEqual(placements[0]!.holes[0])
  })

  it('points an edge pull at the grip edge it hugs', () => {
    const { part, placements } = front('pull-edge-150', 'drawer-front-1-1')
    const [p] = placements
    expect(p!.up).toEqual({ x: 0, y: 1, z: 0 })
    expect(p!.edgeDistance).toBeCloseTo(10, 6)
    expect(p!.centre.y + p!.edgeDistance).toBeCloseTo(part.bounds.max.y, 6)
    expect(p!.length).toBe(150)
  })

  it('runs a J-profile along the whole top edge (bottom edge on wall cabinets)', () => {
    const { part, placements } = front('pull-j-profile', 'door-1-2')
    expect(placements).toHaveLength(1)
    const [p] = placements
    expect(p!.holes).toEqual([])
    expect(p!.length).toBeCloseTo(part.bounds.max.x - part.bounds.min.x, 6)
    expect(p!.centre.y).toBeCloseTo(part.bounds.max.y, 6)
    expect(p!.up).toEqual({ x: 0, y: 1, z: 0 })

    const wall = front('pull-j-profile', 'door-1-2', 'wall')
    expect(wall.placements[0]!.centre.y).toBeCloseTo(wall.part.bounds.min.y, 6)
    expect(wall.placements[0]!.up).toEqual({ x: 0, y: -1, z: 0 })
  })

  it('always gives a right-handed frame (along × up = normal)', () => {
    for (const [id, role, type] of [
      ['pull-bar-128', 'door-1-2', 'base'],
      ['pull-edge-150', 'door-1-2', 'wall'],
      ['pull-j-profile', 'drawer-front-1-1', 'wall'],
      ['pull-cup-96', 'drawer-front-1-1', 'base'],
    ] as const) {
      for (const p of front(id, role, type).placements) expect(dot(cross(p.along, p.up), p.normal)).toBeCloseTo(1, 9)
    }
  })

  it('gives non-front parts no pulls', () => {
    const { cabinet } = front('pull-bar-128', 'door-1-2')
    const b = buildCabinet(cabinet, { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE })
    const side = b.parts.find((p) => p.role === 'side-left')!
    expect(pullPlacements(side, cabinet, resolveHandle(DEFAULT_HARDWARE.find((h) => h.id === 'pull-j-profile')!))).toEqual([])
  })
})
