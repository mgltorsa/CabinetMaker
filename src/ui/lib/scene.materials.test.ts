import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { buildProject } from '@/engine'
import { DEFAULT_VIEW } from '../store'
import { updateMaterial } from '../projectOps'
import { buildScene } from './scene'

const opts = { units: 'metric' as const, selectedCabinetId: 'cab_1' }

describe('buildScene: material colours', () => {
  it('colours each mesh with its part material colour', () => {
    const project = updateMaterial(fixtureProject(), 'ply-18', { color: '#123abc' })
    const build = buildProject(project)
    const scene = buildScene(build, project.cabinets, DEFAULT_VIEW, { ...opts, materials: project.materials })
    const side = scene.meshes.find((m) => m.partId === 'cab_1:side-left')!
    expect(side.color).toBe('#123abc')
    const back = scene.meshes.find((m) => m.finish === 'back')!
    expect(back.color).toBe('#5a5651')
  })

  it('leaves the colour unset (viewer falls back to the finish) without a material colour', () => {
    const project = updateMaterial(fixtureProject(), 'ply-18', { color: undefined })
    const build = buildProject(project)
    const withMaterials = buildScene(build, project.cabinets, DEFAULT_VIEW, { ...opts, materials: project.materials })
    expect(withMaterials.meshes.find((m) => m.partId === 'cab_1:side-left')!.color).toBeUndefined()
    const without = buildScene(build, project.cabinets, DEFAULT_VIEW, opts)
    expect(without.meshes.every((m) => m.color === undefined)).toBe(true)
  })
})
