import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE } from '@/core/defaults'
import { fixtureProject } from '@/core/fixtures'
import type { Cabinet, CabinetBuild, Part, Shape } from '@/core/types'
import { buildCabinet } from '@/engine'
import { frontElevation } from '.'

type Of<T extends Shape['type']> = Extract<Shape, { type: T }>
const ofType = <T extends Shape['type']>(shapes: Shape[], type: T): Of<T>[] => shapes.filter((s): s is Of<T> => s.type === type)

function setup(pullId: string, edit: (c: Cabinet) => Cabinet = (c) => c): { cabinet: Cabinet; build: CabinetBuild; fronts: Part[] } {
  const project = fixtureProject()
  const cabinet = edit({ ...project.cabinets[0]!, hardware: { ...project.cabinets[0]!.hardware, pullId } })
  const build = buildCabinet(cabinet, { materials: project.materials, hardware: project.hardware })
  return { cabinet, build, fronts: build.parts.filter((p) => p.group === 'front') }
}

const draw = (pullId: string, edit?: (c: Cabinet) => Cabinet): { shapes: Shape[]; fronts: Part[] } => {
  const { cabinet, build, fronts } = setup(pullId, edit)
  return { shapes: frontElevation(cabinet, build, 'metric', { hardware: DEFAULT_HARDWARE }).shapes, fronts }
}

const top = (p: Part): number => p.bounds.max.y
const midX = (p: Part): number => (p.bounds.min.x + p.bounds.max.x) / 2

describe('frontElevation: handle styles', () => {
  it('draws bar pulls exactly as before when the catalog is given', () => {
    const { cabinet, build } = setup('pull-bar-128')
    expect(frontElevation(cabinet, build, 'metric', { hardware: DEFAULT_HARDWARE })).toEqual(frontElevation(cabinet, build, 'metric'))
  })

  it('draws a knob as a circle of its diameter on the hole', () => {
    const { shapes, fronts } = draw('pull-knob-30')
    const knobs = ofType(shapes, 'circle').filter((c) => c.r === 15)
    expect(knobs).toHaveLength(fronts.length)
    const drawer = fronts.find((f) => f.role.startsWith('drawer-front'))!
    expect(knobs).toContainEqual(expect.objectContaining({ cx: midX(drawer), cy: (drawer.bounds.min.y + drawer.bounds.max.y) / 2 }))
  })

  it('draws a cup pull as a closed arc below its hole line', () => {
    const { shapes, fronts } = draw('pull-cup-96')
    const cups = ofType(shapes, 'polyline').filter((p) => p.closed && p.layer === 'outline')
    expect(cups).toHaveLength(fronts.length)
    const drawer = fronts.find((f) => f.role.startsWith('drawer-front'))!
    const cy = (drawer.bounds.min.y + drawer.bounds.max.y) / 2
    const cup = cups.find((c) => c.points.every((p) => Math.abs(p.y - cy) <= 21))!
    const xs = cup.points.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(128, 6)
  })

  it('draws an edge pull as its lip hanging from the grip edge, with the hidden screws', () => {
    const { shapes, fronts } = draw('pull-edge-150')
    const drawer = fronts.find((f) => f.role.startsWith('drawer-front'))!
    expect(ofType(shapes, 'rect')).toContainEqual(expect.objectContaining({ x: midX(drawer) - 75, w: 150, y: top(drawer) - 25, h: 25, layer: 'outline' }))
    expect(ofType(shapes, 'circle').filter((c) => c.layer === 'hidden').length).toBe(2 * fronts.length)
  })

  it('draws a J-profile along the whole grip edge of every front', () => {
    const { shapes, fronts } = draw('pull-j-profile')
    for (const f of fronts) {
      expect(ofType(shapes, 'rect')).toContainEqual(expect.objectContaining({ x: f.bounds.min.x, w: f.bounds.max.x - f.bounds.min.x, y: top(f) - 30, h: 30, layer: 'outline' }))
    }
  })

  it('puts a wall-cabinet J-profile on the bottom edge of the doors', () => {
    const { shapes, fronts } = draw('pull-j-profile', (c) => ({ ...c, type: 'wall', floorHeight: 1400, height: 700, depth: 320 }))
    const door = fronts.find((f) => f.role.startsWith('door'))!
    expect(ofType(shapes, 'rect')).toContainEqual(expect.objectContaining({ x: door.bounds.min.x, y: door.bounds.min.y, h: 30, layer: 'outline' }))
  })
})
