import { describe, expect, it } from 'vitest'
import { getAssetDef } from '@/assets'
import { createProject } from '@/core/defaults'
import type { Cabinet, Project } from '@/core/types'
import { createPreset } from '@/engine/presets'
import { rectangularRoom } from '../models/room'
import {
  DEFAULT_CEILING_HEIGHT,
  DEFAULT_COUNTER_HEIGHT,
  DEFAULT_UNDER_CABINET_HEIGHT,
  FRONT_CLEARANCE,
  SIDE_GAP,
  STAGGER,
  defaultAssetPosition,
  sceneAnchors,
  snapPosition,
} from './placement'

function cabinet(type: Cabinet['type'], id: string, over: Partial<Cabinet> = {}): Cabinet {
  return { ...createPreset(type), id, ...over }
}

/** Two 600 mm base cabinets (870 high + 30 mm top, 580 deep; the run leaves 20 mm between them) and one wall cabinet over the first. */
function kitchen(): Project {
  const base = (id: string): Cabinet => {
    const c = cabinet('base', id, { width: 600, height: 870, depth: 580, floorHeight: 0 })
    return { ...c, top: { ...c.top, kind: 'countertop', thickness: 30 } }
  }
  const wall = cabinet('wall', 'w1', { width: 600, height: 720, depth: 330, floorHeight: 1450 })
  return { ...createProject(), cabinets: [base('b1'), base('b2'), wall] }
}

const empty = (): Project => ({ ...createProject(), cabinets: [] })
const def = (id: string) => getAssetDef(id)!

describe('sceneAnchors', () => {
  it('reads the run, the worktop, the wall cabinets and the ceiling', () => {
    const a = sceneAnchors(kitchen())
    expect(a.run).toEqual({ left: 0, right: 1220, depth: 580 })
    expect(a.counterHeight).toBe(900)
    expect(a.wallCabinets).toEqual({ left: 0, right: 600, bottom: 1450, front: 330 })
    expect(a.ceilingHeight).toBe(DEFAULT_CEILING_HEIGHT)
  })

  it('falls back to typical heights in an empty project and uses the room height', () => {
    const a = sceneAnchors(empty())
    expect(a.run).toBeNull()
    expect(a.counterHeight).toBe(DEFAULT_COUNTER_HEIGHT)
    expect(a.wallCabinets).toBeNull()
    const roomed = { ...empty(), room: rectangularRoom({ width: 4000, depth: 3000, height: 2700, thickness: 100 }) }
    expect(sceneAnchors(roomed).ceilingHeight).toBe(2700)
    expect(sceneAnchors(roomed).centreX).toBe(2000)
  })
})

describe('defaultAssetPosition', () => {
  it('puts floor-against-wall assets right of the run, backs on the back wall', () => {
    const fridge = def('fridge')
    const p = defaultAssetPosition(kitchen(), fridge, fridge.defaultSize)
    expect(p).toEqual({ x: 1220 + SIDE_GAP + 350, y: 0, z: 340 })
  })

  it('lines several floor-against-wall assets up instead of stacking them', () => {
    const project = kitchen()
    const fridge = def('fridge')
    const first = defaultAssetPosition(project, fridge, fridge.defaultSize)
    const withFridge: Project = {
      ...project,
      assets: [{ id: 'a', assetId: 'fridge', name: 'Fridge', position: first, rotationYDeg: 0, size: fridge.defaultSize, visible: true }],
    }
    const next = defaultAssetPosition(withFridge, def('dishwasher'), def('dishwasher').defaultSize)
    expect(next.x).toBe(first.x + 350 + SIDE_GAP + 300)
    expect(next.z).toBe(285)
  })

  it('puts free-standing furniture on the floor in front of the run', () => {
    const island = def('island')
    const p = defaultAssetPosition(kitchen(), island, island.defaultSize)
    expect(p).toEqual({ x: 610, y: 0, z: 580 + FRONT_CLEARANCE + 500 })
  })

  it('puts counter assets on the worktop over the base cabinets', () => {
    const cooktop = def('cooktop')
    const p = defaultAssetPosition(kitchen(), cooktop, cooktop.defaultSize)
    expect(p.y).toBe(900)
    expect(p.x).toBe(610)
    expect(p.z - cooktop.defaultSize.z / 2).toBeGreaterThanOrEqual(0)
    expect(p.z + cooktop.defaultSize.z / 2).toBeLessThanOrEqual(580)
    expect(defaultAssetPosition(empty(), cooktop, cooktop.defaultSize).y).toBe(DEFAULT_COUNTER_HEIGHT)
  })

  it('hangs ceiling lights from the ceiling and wall pieces at their lift', () => {
    const pendant = def('pendant')
    expect(defaultAssetPosition(kitchen(), pendant, pendant.defaultSize).y).toBe(DEFAULT_CEILING_HEIGHT - 800)
    const sconce = def('wall-sconce')
    const s = defaultAssetPosition(kitchen(), sconce, sconce.defaultSize)
    expect(s.y).toBe(sconce.defaultLift)
    expect(s.z).toBe(sconce.defaultSize.z / 2)
  })

  it('puts LED strips under the wall cabinets, near their front', () => {
    const strip = def('led-strip')
    const p = defaultAssetPosition(kitchen(), strip, strip.defaultSize)
    expect(p.y).toBe(1450 - strip.defaultSize.y)
    expect(p.x).toBe(300)
    expect(p.z + strip.defaultSize.z / 2).toBeLessThanOrEqual(330)
    expect(p.z).toBeGreaterThan(165)
    expect(defaultAssetPosition(empty(), strip, strip.defaultSize).y).toBe(DEFAULT_UNDER_CABINET_HEIGHT - strip.defaultSize.y)
  })

  it('puts counter assets over the run, not the room centre', () => {
    const roomed = { ...kitchen(), room: rectangularRoom({ width: 4000, depth: 3000, height: 2400, thickness: 100 }) }
    const vase = def('vase')
    expect(defaultAssetPosition(roomed, vase, vase.defaultSize).x).toBe(610)
    expect(defaultAssetPosition(roomed, def('sofa'), def('sofa').defaultSize).x).toBe(2000)
  })

  it('staggers successive free-standing assets so they do not overlap exactly', () => {
    const chair = def('chair')
    const project = kitchen()
    const first = defaultAssetPosition(project, chair, chair.defaultSize)
    const second = defaultAssetPosition(
      { ...project, assets: [{ id: 'a', assetId: 'chair', name: 'Chair', position: first, rotationYDeg: 0, size: chair.defaultSize, visible: true }] },
      chair,
      chair.defaultSize,
    )
    expect(second.x).not.toBe(first.x)
    const plant = def('plant')
    const third = defaultAssetPosition(
      { ...project, assets: [{ id: 'a', assetId: 'chair', name: 'Chair', position: first, rotationYDeg: 0, size: chair.defaultSize, visible: true }] },
      plant,
      plant.defaultSize,
    )
    expect(third.x).toBe(first.x + STAGGER)
  })
})

describe('snapPosition', () => {
  const asset = { position: { x: 100, y: 500, z: 900 }, size: { x: 600, y: 12, z: 24 }, rotationYDeg: 0 }

  it('snaps to the floor, the back wall, the ceiling, the counter and under the wall cabinets', () => {
    const project = kitchen()
    expect(snapPosition(project, asset, 'floor')).toEqual({ x: 100, y: 0, z: 900 })
    expect(snapPosition(project, asset, 'wall')).toEqual({ x: 100, y: 500, z: 12 })
    expect(snapPosition(project, asset, 'ceiling')).toEqual({ x: 100, y: DEFAULT_CEILING_HEIGHT - 12, z: 900 })
    expect(snapPosition(project, asset, 'counter')).toEqual({ x: 100, y: 900, z: 900 })
    const under = snapPosition(project, asset, 'under-cabinet')
    expect(under.y).toBe(1450 - 12)
    expect(under.z + 12).toBeLessThanOrEqual(330)
  })

  it('uses the rotated footprint against the wall', () => {
    const turned = { ...asset, size: { x: 600, y: 100, z: 200 }, rotationYDeg: 90 }
    expect(snapPosition(kitchen(), turned, 'wall').z).toBeCloseTo(300, 6)
  })
})
