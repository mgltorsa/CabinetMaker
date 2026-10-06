import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Cabinet, CabinetBuild, Project } from '@/core/types'
import { buildCabinet } from '@/engine'
import { createDesignerStore } from '../store'
import { cabinetDimensionEdits } from './dimensionEdits'
import { CABINET_DIMENSION, FLOOR_HEIGHT } from './limits'

function setup(project: Project = fixtureProject()) {
  const store = createDesignerStore(project)
  const cab = (): Cabinet => store.getState().project.cabinets[0]!
  const build = (): CabinetBuild => buildCabinet(cab(), { materials: store.getState().project.materials, hardware: store.getState().project.hardware })
  const edits = () => cabinetDimensionEdits(store.getState().project, cab(), build(), store.getState())
  return { store, cab, build, edits }
}

const frontHeight = (b: CabinetBuild, role: string): number => {
  const p = b.parts.find((x) => x.role === role)!
  return p.bounds.max.y - p.bounds.min.y
}

describe('cabinetDimensionEdits', () => {
  it('offers width, height and depth with the cabinet values and sidebar bounds', () => {
    const { edits } = setup()
    const e = edits()
    expect(e.width).toMatchObject({ name: 'Width', value: 600, units: 'metric', ...CABINET_DIMENSION })
    expect(e.height).toMatchObject({ name: 'Height', value: 870 })
    expect(e.depth).toMatchObject({ name: 'Depth', value: 580 })
    expect(e['floor-height']).toMatchObject({ name: 'Floor height', value: 0, ...FLOOR_HEIGHT })
  })

  it('commits width, height, depth and floor height through the store', () => {
    const { edits, cab } = setup()
    expect(edits().width!.onCommit(700)).toBeNull()
    expect(edits().height!.onCommit(900)).toBeNull()
    expect(edits().depth!.onCommit(596.9)).toBeNull()
    expect(edits()['floor-height']!.onCommit(1450)).toBeNull()
    expect(cab()).toMatchObject({ width: 700, height: 900, depth: 596.9, floorHeight: 1450 })
  })

  it('commits the toe kick height into the construction', () => {
    const { edits, cab } = setup()
    expect(edits()['toe-kick']).toMatchObject({ name: 'Toe kick height', value: cab().construction.toeKick.height })
    expect(edits()['toe-kick']!.onCommit(120)).toBeNull()
    expect(cab().construction.toeKick).toMatchObject({ height: 120 })
  })

  it('maps a drawer front height to its bay so the front comes out as typed', () => {
    const { edits, build, cab } = setup()
    const drawer = edits()['front:0:0']!
    expect(drawer.name).toBe('Drawer 1.1 front height')
    expect(drawer.value).toBeCloseTo(frontHeight(build(), 'drawer-front-1-1'), 6)
    expect(drawer.onCommit(200)).toBeNull()
    expect(frontHeight(build(), 'drawer-front-1-1')).toBeCloseTo(200, 2)
    expect(cab().sections[0]!.bays[0]!.height).toBeCloseTo(200, 2)
  })

  it('names door fronts and returns the engine error for a front that cannot fit', () => {
    const { edits, store } = setup()
    const door = edits()['front:0:1']!
    expect(door.name).toBe('Door 1.2 front height')
    const before = store.getState().project
    expect(door.onCommit(5000)).toMatch(/does not fit/)
    expect(store.getState().project).toBe(before)
  })

  it('leaves out fronts that fill their section', () => {
    const project = fixtureProject()
    project.cabinets[0]!.sections[0]!.bays = [project.cabinets[0]!.sections[0]!.bays[1]!]
    const { edits } = setup(project)
    expect(Object.keys(edits()).filter((k) => k.startsWith('front:'))).toEqual([])
  })

  it('does not touch the store when the value is unchanged', () => {
    const { edits, store } = setup()
    const before = store.getState().project
    expect(edits().width!.onCommit(600)).toBeNull()
    expect(store.getState().project).toBe(before)
  })
})
