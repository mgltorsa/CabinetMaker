import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { validateProject } from './lib/projectSchema'
import { createDesignerStore } from './store'

function setup() {
  const store = createDesignerStore(fixtureProject())
  return { get: () => store.getState() }
}

describe('designer store: material library', () => {
  it('adds, edits, duplicates and deletes materials', () => {
    const { get } = setup()
    const id = get().addMaterial('sheet')
    expect(id).not.toBeNull()
    get().updateMaterial(id!, { name: 'Walnut ply 19', thickness: 19, color: '#6b4630' })
    expect(get().project.materials.find((m) => m.id === id)).toMatchObject({ name: 'Walnut ply 19', thickness: 19, color: '#6b4630' })

    const copyId = get().duplicateMaterial(id!)
    expect(get().project.materials.find((m) => m.id === copyId)?.name).toBe('Walnut ply 19 copy')

    get().deleteMaterial(copyId!)
    expect(get().project.materials.some((m) => m.id === copyId)).toBe(false)
    expect(validateProject(get().project)).toBeNull()
  })

  it('blocks deleting a material in use until its uses are replaced', () => {
    const { get } = setup()
    const id = get().addMaterial('sheet')!
    get().updateConstruction('cab_1', { carcassMaterialId: id })
    const before = get().project
    get().deleteMaterial(id)
    expect(get().project).toBe(before)

    get().deleteMaterial(id, 'ply-18')
    expect(get().project.materials.some((m) => m.id === id)).toBe(false)
    expect(get().project.cabinets[0]!.construction.carcassMaterialId).toBe('ply-18')
    expect(validateProject(get().project)).toBeNull()
  })

  it('replaces uses without deleting', () => {
    const { get } = setup()
    get().replaceMaterialUses('ply-6', 'bb-12')
    expect(get().project.cabinets[0]!.construction.backMaterialId).toBe('bb-12')
    expect(get().project.materials.some((m) => m.id === 'ply-6')).toBe(true)
  })

  it('a preset added after a default material was deleted references known materials', () => {
    const { get } = setup()
    get().deleteMaterial('ply-18', 'mdf-18')
    get().addCabinetFromPreset('wall')
    expect(validateProject(get().project)).toBeNull()
    expect(get().project.cabinets.at(-1)!.construction.carcassMaterialId).not.toBe('ply-18')
  })
})
