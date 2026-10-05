import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { HardwareItem, Project } from '@/core/types'
import { buildProject } from '@/engine'
import { DEFAULT_VIEW } from '../store'
import { buildScene, type SceneSpec } from './scene'

const opts = { units: 'metric' as const, selectedCabinetId: 'cab_1' }

function withPull(pullId: string, extra: HardwareItem[] = []): Project {
  const project = fixtureProject()
  project.hardware = [...project.hardware, ...extra]
  project.cabinets[0]!.hardware.pullId = pullId
  return project
}

function scene(project: Project, view = DEFAULT_VIEW): SceneSpec {
  return buildScene(buildProject(project), project.cabinets, view, { ...opts, hardware: project.hardware })
}

const len = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)

describe('buildScene: handle styles', () => {
  it('keeps the bar pull as before, with its style, size and colour', () => {
    const s = scene(fixtureProject())
    expect(s.pulls).toHaveLength(3)
    for (const p of s.pulls) {
      expect(p.style).toBe('bar')
      expect(p.standoff).toBeCloseTo(0.028, 9)
      expect(len(p.a, p.b)).toBeCloseTo(0.128, 9)
      expect(p.length).toBeCloseTo(0.158, 9)
      expect(p.diameter).toBeCloseTo(0.012, 9)
      expect(p.color).toBe('#c9ccd0')
      expect(p.model).toBeUndefined()
    }
  })

  it('draws bars without a catalog the old way (length from the holes)', () => {
    const project = fixtureProject()
    const s = buildScene(buildProject(project), project.cabinets, DEFAULT_VIEW, opts)
    for (const p of s.pulls) {
      expect(p.style).toBe('bar')
      expect(p.length).toBeCloseTo(0.158, 9)
    }
  })

  it('gives a knob one point (a = b = centre) and its diameter', () => {
    const s = scene(withPull('pull-knob-30'))
    expect(s.pulls).toHaveLength(3)
    for (const p of s.pulls) {
      expect(p.style).toBe('knob')
      expect(p.a).toEqual(p.b)
      expect(p.centre).toEqual(p.a)
      expect(p.diameter).toBeCloseTo(0.03, 9)
    }
  })

  it('runs a J-profile along the top edge of every front', () => {
    const project = withPull('pull-j-profile')
    const build = buildProject(project)
    const s = scene(project)
    const fronts = build.parts.filter((p) => p.group === 'front')
    expect(s.pulls).toHaveLength(fronts.length)
    for (const p of s.pulls) {
      expect(p.style).toBe('j-profile')
      expect(p.up).toEqual([0, 1, 0])
      expect(p.frontThickness).toBeCloseTo(0.018, 9)
    }
    const drawer = fronts.find((f) => f.role.startsWith('drawer-front'))!
    const pull = s.pulls.find((p) => p.id.startsWith(drawer.id))!
    expect(pull.length).toBeCloseTo((drawer.bounds.max.x - drawer.bounds.min.x) / 1000, 9)
    expect(pull.centre[1]).toBeCloseTo(drawer.bounds.max.y / 1000, 9)
  })

  it('carries the handle colour and an edge pull’s distance to its edge', () => {
    const project = withPull('pull-edge-150')
    project.hardware = project.hardware.map((h) => (h.id === 'pull-edge-150' ? { ...h, handle: { ...h.handle!, color: '#112233' } } : h))
    const [p] = scene(project).pulls
    expect(p!.style).toBe('edge')
    expect(p!.color).toBe('#112233')
    expect(p!.edgeDistance).toBeCloseTo(0.01, 9)
    expect(p!.length).toBeCloseTo(0.15, 9)
  })

  it('passes a custom handle’s model along for the viewer', () => {
    const custom: HardwareItem = {
      id: 'pull-custom',
      kind: 'pull',
      name: 'Custom',
      manufacturer: '',
      sku: '',
      unitCost: 1,
      props: { centers: 0 },
      handle: { style: 'custom', blobId: 'sha256-abc', format: 'glb', unit: 'cm', nativeSize: { x: 12, y: 3, z: 2.5 } },
    }
    const [p] = scene(withPull('pull-custom', [custom])).pulls
    expect(p!.style).toBe('custom')
    expect(p!.model).toEqual({ blobId: 'sha256-abc', format: 'glb', unit: 'cm', nativeSize: { x: 12, y: 3, z: 2.5 } })
    expect(p!.length).toBeCloseTo(0.12, 9)
  })

  it('moves pulls with the door when doors are open', () => {
    const project = withPull('pull-knob-30')
    const closed = scene(project).pulls
    const open = scene(project, { ...DEFAULT_VIEW, doorsOpen: true }).pulls
    const doorPulls = (ps: SceneSpec['pulls']) => ps.filter((p) => p.id.includes(':door'))
    expect(doorPulls(open)).toHaveLength(2)
    doorPulls(open).forEach((p, i) => expect(p.centre[2]).toBeGreaterThan(doorPulls(closed)[i]!.centre[2]))
  })
})
