import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { buildProject } from '@/engine'
import { createPreset } from '@/engine/presets'
import { DEFAULT_VIEW } from '../store'
import { buildScene } from './scene'

describe('buildScene: hanging rods', () => {
  const project = fixtureProject()
  project.cabinets = [{ ...createPreset('wardrobe'), id: 'cab_w' }]
  const build = buildProject(project)
  const rod = build.parts.find((p) => p.group === 'rod')!
  const scene = buildScene(build, project.cabinets, DEFAULT_VIEW, { units: 'metric', selectedCabinetId: 'cab_w' })
  const mesh = scene.meshes.find((m) => m.partId === rod.id)!

  it('renders the rod with the chrome finish as a cylinder along its length axis', () => {
    expect(mesh.finish).toBe('rod')
    expect(mesh.rod).toEqual({ axis: 'x', radius: rod.thickness / 2 / 1000, length: rod.length / 1000 })
  })

  it('keeps the box size and centre of the part (supports sit at both ends)', () => {
    expect(mesh.size[0]).toBeCloseTo(rod.length / 1000, 9)
    expect(mesh.position[1]).toBeCloseTo((rod.bounds.min.y + rod.bounds.max.y) / 2 / 1000, 9)
  })

  it('gives every other part no rod spec', () => {
    expect(scene.meshes.filter((m) => m.rod !== undefined).map((m) => m.partId)).toEqual([rod.id])
  })
})
