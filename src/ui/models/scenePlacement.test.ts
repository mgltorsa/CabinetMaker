import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Cabinet, Project } from '@/core/types'
import { buildProject } from '@/engine'
import { buildScene, depthOffsets, runOffsets } from '../lib/scene'
import { DEFAULT_VIEW } from '../store'

const opts = { units: 'metric' as const, selectedCabinetId: 'cab_1' }

function run(): Project {
  const project = fixtureProject()
  const base = project.cabinets[0]!
  const second: Cabinet = { ...structuredClone(base), id: 'cab_2', width: 900 }
  const third: Cabinet = { ...structuredClone(base), id: 'cab_3', width: 500 }
  return { ...project, cabinets: [base, second, third] }
}

const placed = (cab: Cabinet, x: number, z: number): Cabinet => ({ ...cab, placement: { wallId: null, offset: x, rotationDeg: 0, position: { x, z } } })

describe('runOffsets with free placement', () => {
  it('uses the position of a placed cabinet and closes the run around it', () => {
    const project = run()
    const cabinets = [project.cabinets[0]!, placed(project.cabinets[1]!, 3000, 500), project.cabinets[2]!]
    const offsets = runOffsets(cabinets)
    expect(offsets.get('cab_2')).toBe(3000)
    expect(offsets.get('cab_3')).toBe(620) // took cab_2's slot in the automatic run
    expect(depthOffsets(cabinets).get('cab_2')).toBe(500)
    expect(depthOffsets(cabinets).get('cab_1')).toBe(0)
  })

  it('ignores a placement without a position (today’s run layout)', () => {
    const project = run()
    const cabinets = project.cabinets.map((c) => ({ ...c, placement: { wallId: null, offset: 0, rotationDeg: 0 } }))
    expect([...runOffsets(cabinets).values()]).toEqual([0, 620, 1540])
  })
})

describe('buildScene with free placement', () => {
  it('moves a placed cabinet’s parts, dimension lines and camera focus by its room position', () => {
    const project = fixtureProject()
    const cab = project.cabinets[0]!
    const build = buildProject(project)
    const at = buildScene(build, [placed(cab, 0, 400)], DEFAULT_VIEW, opts)
    const home = buildScene(build, [cab], DEFAULT_VIEW, opts)
    for (const [i, mesh] of at.meshes.entries()) {
      expect(mesh.position[0]).toBeCloseTo(home.meshes[i]!.position[0], 9)
      expect(mesh.position[2]).toBeCloseTo(home.meshes[i]!.position[2] + 0.4, 9)
    }
    expect(at.dimensions[0]!.from[2]).toBeCloseTo(home.dimensions[0]!.from[2] + 0.4, 9)
    expect(at.focus.target[2]).toBeCloseTo(home.focus.target[2] + 0.4, 9)
  })

  it('centres on the run by default and reports the centre it used', () => {
    const project = fixtureProject()
    const scene = buildScene(buildProject(project), project.cabinets, DEFAULT_VIEW, opts)
    expect(scene.centreX).toBeCloseTo(300, 0) // 600 mm cabinet → centre 300 mm (± overlay fronts)
  })

  it('centres on a fixed room-space X when asked (room view), so the cabinets do not drift', () => {
    const project = fixtureProject()
    const build = buildProject(project)
    const scene = buildScene(build, project.cabinets, DEFAULT_VIEW, { ...opts, centreX: 2000 })
    expect(scene.centreX).toBe(2000)
    const auto = buildScene(build, project.cabinets, DEFAULT_VIEW, opts)
    const shift = (auto.centreX - 2000) / 1000
    expect(scene.meshes[0]!.position[0]).toBeCloseTo(auto.meshes[0]!.position[0] + shift, 9)
  })

  it('reports the requested centre for an empty build', () => {
    expect(buildScene({ cabinets: [], parts: [], hardware: [], warnings: [] }, [], DEFAULT_VIEW, { ...opts, centreX: 1500 }).centreX).toBe(1500)
  })
})
