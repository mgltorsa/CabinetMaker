import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import { panelToCabinet } from '@/core/panel'
import type { Cabinet, CabinetBuild, HardwareItem, HoleOp, Part, Vec3 } from '@/core/types'
import { buildCabinet } from '.'
import { DOOR_PULL_EDGE_OFFSET, DOOR_PULL_END_OFFSET, EDGE_PULL_HOLE_INSET } from './constants'
import { bay, part, section, testCabinet, usage } from './testkit'

const CUSTOM_SINGLE: HardwareItem = { id: 'pull-custom-1', kind: 'pull', name: 'Custom', manufacturer: '', sku: '', unitCost: 2, props: { centers: 0 }, handle: { style: 'custom' } }
const CUSTOM_PAIR: HardwareItem = { ...CUSTOM_SINGLE, id: 'pull-custom-2', props: { centers: 64 } }
const CATALOG = [...DEFAULT_HARDWARE, CUSTOM_SINGLE, CUSTOM_PAIR]

function withPull(pullId: string, extra: Partial<Cabinet> = {}, sections = [section([bay('drawer', 150), bay('door')])]): CabinetBuild {
  const base = testCabinet({ sections, ...extra })
  return buildCabinet({ ...base, hardware: { ...base.hardware, pullId } }, { materials: DEFAULT_MATERIALS, hardware: CATALOG })
}

const pullHoles = (p: Part): HoleOp[] => p.ops.filter((o): o is HoleOp => o.kind === 'hole' && o.purpose === 'pull')
/** Hole centres on the show face, cabinet space. */
const at = (p: Part): Vec3[] => pullHoles(p).map((h) => panelToCabinet(p, h.x, h.y, 0))

describe('pull holes per handle style', () => {
  it('keeps bar pulls as before: two through holes per pull', () => {
    const b = withPull('pull-bar-128')
    const door = part(b, 'door-1-2')
    expect(pullHoles(door)).toHaveLength(2)
    expect(pullHoles(door)[0]).toMatchObject({ face: 'A', diameter: 5, depth: door.thickness })
  })

  it('drills one centred through hole per drawer for a knob, two on a wide drawer', () => {
    const b = withPull('pull-knob-30')
    const front = part(b, 'drawer-front-1-1')
    const [hole] = at(front)
    expect(pullHoles(front)).toHaveLength(1)
    expect(pullHoles(front)[0]!.depth).toBe(front.thickness)
    expect(hole!.x).toBeCloseTo((front.bounds.min.x + front.bounds.max.x) / 2, 6)
    expect(hole!.y).toBeCloseTo((front.bounds.min.y + front.bounds.max.y) / 2, 6)
    expect(usage(b, 'pull-knob-30')).toBe(2) // drawer + door

    const wide = withPull('pull-knob-30', { width: 900 }, [section([bay('drawer', 150)])])
    expect(pullHoles(part(wide, 'drawer-front-1-1'))).toHaveLength(2)
    expect(usage(wide, 'pull-knob-30')).toBe(2)
  })

  it('puts a door knob on the latch side near the top (near the bottom on wall cabinets)', () => {
    const base = withPull('pull-knob-30', {}, [section([bay('door', null, { hingeSide: 'left' })])])
    const door = part(base, 'door-1-1')
    const [k] = at(door)
    expect(k!.x).toBeCloseTo(door.bounds.max.x - DOOR_PULL_EDGE_OFFSET, 6)
    expect(k!.y).toBeCloseTo(door.bounds.max.y - DOOR_PULL_END_OFFSET, 6)

    const wall = withPull('pull-knob-30', { type: 'wall', floorHeight: 1400, height: 700, depth: 320 }, [section([bay('door', null, { hingeSide: 'right' })])])
    const wdoor = part(wall, 'door-1-1')
    const [w] = at(wdoor)
    expect(w!.x).toBeCloseTo(wdoor.bounds.min.x + DOOR_PULL_EDGE_OFFSET, 6)
    expect(w!.y).toBeCloseTo(wdoor.bounds.min.y + DOOR_PULL_END_OFFSET, 6)
  })

  it('drills edge-pull screws blind from the inside face, along the top edge of a drawer front', () => {
    const b = withPull('pull-edge-150')
    const front = part(b, 'drawer-front-1-1')
    const holes = pullHoles(front)
    expect(holes).toHaveLength(2)
    for (const h of holes) {
      expect(h.face).toBe('A')
      expect(h.depth).toBeLessThan(front.thickness)
    }
    const pts = at(front)
    for (const p of pts) expect(p.y).toBeCloseTo(front.bounds.max.y - EDGE_PULL_HOLE_INSET, 6)
    expect(Math.abs(pts[0]!.x - pts[1]!.x)).toBeCloseTo(128, 6)
  })

  it('puts a door edge pull on the top edge near the latch side, the bottom edge on wall cabinets', () => {
    const base = withPull('pull-edge-150', {}, [section([bay('door', null, { hingeSide: 'left' })])])
    const door = part(base, 'door-1-1')
    const pts = at(door)
    expect(pts).toHaveLength(2)
    for (const p of pts) expect(p.y).toBeCloseTo(door.bounds.max.y - EDGE_PULL_HOLE_INSET, 6)
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(door.bounds.max.x - DOOR_PULL_EDGE_OFFSET, 6)

    const wall = withPull('pull-edge-150', { type: 'wall', floorHeight: 1400, height: 700, depth: 320 }, [section([bay('door', null, { hingeSide: 'left' })])])
    const wdoor = part(wall, 'door-1-1')
    for (const p of at(wdoor)) expect(p.y).toBeCloseTo(wdoor.bounds.min.y + EDGE_PULL_HOLE_INSET, 6)
  })

  it('drills a cup pull like a bar on its own centres', () => {
    const b = withPull('pull-cup-96')
    const pts = at(part(b, 'drawer-front-1-1'))
    expect(pts).toHaveLength(2)
    expect(Math.abs(pts[0]!.x - pts[1]!.x)).toBeCloseTo(96, 6)
    expect(pullHoles(part(b, 'drawer-front-1-1'))[0]!.depth).toBe(18)
  })

  it('drills nothing for a J-profile but still counts one per front', () => {
    const b = withPull('pull-j-profile')
    expect(b.parts.flatMap(pullHoles)).toHaveLength(0)
    expect(usage(b, 'pull-j-profile')).toBe(2)
    expect(b.hardware.find((h) => h.hardwareId === 'pull-j-profile')?.note).toMatch(/J-profile/)
  })

  it('drills one hole for a custom handle with 0 centres and two on its centres otherwise', () => {
    expect(pullHoles(part(withPull('pull-custom-1'), 'drawer-front-1-1'))).toHaveLength(1)
    const pair = at(part(withPull('pull-custom-2'), 'drawer-front-1-1'))
    expect(pair).toHaveLength(2)
    expect(Math.abs(pair[0]!.x - pair[1]!.x)).toBeCloseTo(64, 6)
  })

  it('keeps part ids and roles identical whatever the handle', () => {
    const ids = (pullId: string): string[] => withPull(pullId).parts.map((p) => p.id)
    const bar = ids('pull-bar-128')
    for (const id of ['pull-knob-30', 'pull-edge-150', 'pull-cup-96', 'pull-j-profile', 'pull-custom-1']) expect(ids(id)).toEqual(bar)
  })

  it('leaves a front too small for the edge pull without holes', () => {
    const b = withPull('pull-edge-150', { width: 140 }, [section([bay('drawer', 150)])])
    expect(pullHoles(part(b, 'drawer-front-1-1'))).toHaveLength(0)
    expect(usage(b, 'pull-edge-150')).toBe(0)
  })
})
