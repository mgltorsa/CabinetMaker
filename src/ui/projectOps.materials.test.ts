import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultCabinet } from '@/core/defaults'
import { fixtureProject } from '@/core/fixtures'
import type { LinearMaterial, Project, SheetMaterial } from '@/core/types'
import { runPipeline } from '@/pipeline'
import { MAX_CATALOG_ITEMS } from './lib/limits'
import { MATERIAL_PALETTE } from './lib/materials'
import { validateProject } from './lib/projectSchema'
import {
  addCabinet,
  addMaterial,
  deleteMaterial,
  duplicateMaterial,
  materialDeleteBlock,
  materialSlug,
  materialUses,
  newMaterialId,
  replaceMaterialUses,
  updateMaterial,
} from './projectOps'

const sheet = (p: Project, id: string): SheetMaterial => {
  const m = p.materials.find((x) => x.id === id)
  if (m?.kind !== 'sheet') throw new Error(`no sheet ${id}`)
  return m
}

const linear = (p: Project, id: string): LinearMaterial => {
  const m = p.materials.find((x) => x.id === id)
  if (m?.kind !== 'linear') throw new Error(`no linear ${id}`)
  return m
}

afterEach(() => vi.restoreAllMocks())

describe('material ids', () => {
  it('slugs a name to lowercase ascii words joined by dashes', () => {
    expect(materialSlug('Walnut ply 19')).toBe('walnut-ply-19')
    expect(materialSlug('  Ébène  18 mm (fronts)! ')).toBe('ebene-18-mm-fronts')
    expect(materialSlug('×××')).toBe('material')
    expect(materialSlug('a'.repeat(80)).length).toBeLessThanOrEqual(24)
  })

  it('appends a short suffix and never collides with a taken id', () => {
    const random = vi.spyOn(Math, 'random')
    // newId takes base-36 digits from Math.random: first two draws give the same id.
    random.mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValueOnce(0.25)
    const first = newMaterialId('Walnut ply 19', new Set())
    expect(first).toMatch(/^walnut-ply-19_[a-z0-9]+$/)
    const second = newMaterialId('Walnut ply 19', new Set([first]))
    expect(second).not.toBe(first)
    expect(second).toMatch(/^walnut-ply-19_[a-z0-9]+$/)
  })
})

describe('addMaterial', () => {
  it('adds a sheet material with sensible defaults that fit the machine table', () => {
    const p = fixtureProject()
    const { project, materialId } = addMaterial(p, 'sheet')
    expect(materialId).not.toBeNull()
    const m = sheet(project, materialId!)
    expect(m.name).toBe('New sheet material')
    expect(m.thickness).toBe(18)
    expect(m.sheetLength).toBeLessThanOrEqual(p.machine.tableX)
    expect(m.sheetWidth).toBeLessThanOrEqual(p.machine.tableY)
    expect(m.costPerSheet).toBeGreaterThanOrEqual(0)
    expect(project.materials).toHaveLength(p.materials.length + 1)
    expect(p.materials).toHaveLength(5) // input untouched
    expect(validateProject(project)).toBeNull()
  })

  it('adds linear stock with defaults', () => {
    const { project, materialId } = addMaterial(fixtureProject(), 'linear')
    const m = linear(project, materialId!)
    expect(m.name).toBe('New linear stock')
    expect(m.width).toBeGreaterThan(0)
    expect(m.stockLength).toBeGreaterThan(0)
    expect(validateProject(project)).toBeNull()
  })

  it('gives every added material a unique id and name', () => {
    let p = fixtureProject()
    for (let i = 0; i < 5; i++) p = addMaterial(p, 'sheet').project
    expect(new Set(p.materials.map((m) => m.id)).size).toBe(p.materials.length)
    expect(new Set(p.materials.map((m) => m.name)).size).toBe(p.materials.length)
    expect(p.materials.at(-1)!.name).toBe('New sheet material 5')
  })

  it('stops at the catalog limit', () => {
    const p = fixtureProject()
    const filler = Array.from({ length: MAX_CATALOG_ITEMS - p.materials.length }, (_, i) => ({ ...sheet(p, 'ply-18'), id: `x${i}` }))
    const full = { ...p, materials: [...p.materials, ...filler] }
    expect(addMaterial(full, 'sheet')).toEqual({ project: full, materialId: null })
    expect(duplicateMaterial(full, 'ply-18')).toEqual({ project: full, copyId: null })
  })
})

describe('material colours', () => {
  it('gives each added material a distinct palette colour', () => {
    let p = fixtureProject()
    const added: string[] = []
    for (let i = 0; i < MATERIAL_PALETTE.length; i++) {
      const r = addMaterial(p, i % 2 === 0 ? 'sheet' : 'linear')
      p = r.project
      added.push(p.materials.find((m) => m.id === r.materialId)!.color!)
    }
    expect(new Set(added).size).toBe(MATERIAL_PALETTE.length)
    const defaults = new Set(fixtureProject().materials.map((m) => m.color))
    expect(added.some((c) => defaults.has(c))).toBe(false)
    expect(validateProject(p)).toBeNull()
  })

  it('gives a duplicate its own colour', () => {
    const { project, copyId } = duplicateMaterial(fixtureProject(), 'ply-18')
    expect(sheet(project, copyId!).color).toMatch(/^#[0-9a-f]{6}$/)
    expect(sheet(project, copyId!).color).not.toBe(sheet(project, 'ply-18').color)
  })

  it('sets and clears a colour', () => {
    const p = updateMaterial(fixtureProject(), 'ply-18', { color: '#123abc' })
    expect(sheet(p, 'ply-18').color).toBe('#123abc')
    const cleared = updateMaterial(p, 'ply-18', { color: undefined })
    expect('color' in sheet(cleared, 'ply-18')).toBe(false)
    expect(validateProject(cleared)).toBeNull()
  })
})

describe('updateMaterial', () => {
  it('patches fields of the material kind and keeps id and kind', () => {
    const p = fixtureProject()
    const next = updateMaterial(p, 'ply-18', { name: 'Birch ply', thickness: 19, grained: false })
    expect(sheet(next, 'ply-18')).toMatchObject({ id: 'ply-18', kind: 'sheet', name: 'Birch ply', thickness: 19, grained: false })
    expect(sheet(p, 'ply-18').thickness).toBe(18)
  })

  it('ignores keys that do not belong to the material kind', () => {
    const p = fixtureProject()
    const next = updateMaterial(p, 'maple-19x63', { grained: true, width: 50 } as never)
    expect(linear(next, 'maple-19x63').width).toBe(50)
    expect('grained' in linear(next, 'maple-19x63')).toBe(false)
    expect(validateProject(next)).toBeNull()
  })

  it('returns the same project for an unknown id', () => {
    const p = fixtureProject()
    expect(updateMaterial(p, 'nope', { name: 'x' })).toBe(p)
  })

  it('flows a thickness change through the pipeline', () => {
    const p = fixtureProject()
    const next = updateMaterial(p, 'ply-18', { thickness: 19 })
    const parts = runPipeline(next).build.parts.filter((part) => part.materialId === 'ply-18')
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.every((part) => part.thickness === 19)).toBe(true)
  })
})

describe('duplicateMaterial', () => {
  it('inserts a renamed copy with a fresh id after the source', () => {
    const p = fixtureProject()
    const { project, copyId } = duplicateMaterial(p, 'ply-6')
    const index = project.materials.findIndex((m) => m.id === 'ply-6')
    expect(project.materials[index + 1]!.id).toBe(copyId)
    expect(copyId).toMatch(/^6-mm-plywood-backs-copy_/)
    expect(sheet(project, copyId!)).toMatchObject({ name: '6 mm plywood (backs) copy', thickness: 6, costPerSheet: 35 })
    expect(duplicateMaterial(project, 'ply-6').project.materials.find((m) => m.name === '6 mm plywood (backs) copy 2')).toBeDefined()
  })

  it('is a no-op for an unknown id', () => {
    const p = fixtureProject()
    expect(duplicateMaterial(p, 'nope')).toEqual({ project: p, copyId: null })
  })
})

/** Fixture with a second cabinet and a top, so every use field is covered. */
function busyProject(): Project {
  const p = fixtureProject()
  const second = defaultCabinet('cab_2')
  second.name = 'Wall cabinet'
  second.top = { ...second.top, kind: 'finished', materialId: 'ply-18' }
  return { ...p, cabinets: [...p.cabinets, second] }
}

describe('materialUses', () => {
  it('lists every cabinet and field that references a material', () => {
    expect(materialUses(busyProject(), 'ply-18')).toEqual([
      { cabinetId: 'cab_1', cabinetName: 'Base cabinet', fields: ['carcass'] },
      { cabinetId: 'cab_2', cabinetName: 'Wall cabinet', fields: ['carcass', 'top'] },
    ])
    expect(materialUses(busyProject(), 'ply-6')[0]!.fields).toEqual(['back', 'drawerBottom'])
    expect(materialUses(busyProject(), 'mdf-18')[0]!.fields).toEqual(['fronts'])
    expect(materialUses(busyProject(), 'bb-12')[0]!.fields).toEqual(['drawerBox'])
    expect(materialUses(busyProject(), 'maple-19x63')[0]!.fields).toEqual(['faceFrame'])
  })

  it('is empty for an unused material', () => {
    const { project, materialId } = addMaterial(fixtureProject(), 'sheet')
    expect(materialUses(project, materialId!)).toEqual([])
  })
})

describe('replaceMaterialUses', () => {
  it('reassigns every use to a material of the same kind', () => {
    const p = busyProject()
    const next = replaceMaterialUses(p, 'ply-18', 'mdf-18')
    expect(materialUses(next, 'ply-18')).toEqual([])
    expect(next.cabinets[0]!.construction.carcassMaterialId).toBe('mdf-18')
    expect(next.cabinets[1]!.top.materialId).toBe('mdf-18')
    expect(next.cabinets[0]!.construction.backMaterialId).toBe('ply-6')
    expect(p.cabinets[0]!.construction.carcassMaterialId).toBe('ply-18')
  })

  it('refuses a missing target, the same material or another kind', () => {
    const p = busyProject()
    expect(replaceMaterialUses(p, 'ply-18', 'nope')).toBe(p)
    expect(replaceMaterialUses(p, 'ply-18', 'ply-18')).toBe(p)
    expect(replaceMaterialUses(p, 'ply-18', 'maple-19x63')).toBe(p)
  })

  it('returns the same project when nothing uses the material', () => {
    const { project, materialId } = addMaterial(fixtureProject(), 'sheet')
    expect(replaceMaterialUses(project, materialId!, 'ply-18')).toBe(project)
  })
})

describe('deleteMaterial', () => {
  it('deletes an unused material', () => {
    const { project, materialId } = addMaterial(fixtureProject(), 'sheet')
    expect(materialDeleteBlock(project, materialId!)).toBeNull()
    const next = deleteMaterial(project, materialId!)
    expect(next.materials.some((m) => m.id === materialId)).toBe(false)
  })

  it('is blocked while the material is in use', () => {
    const p = busyProject()
    expect(materialDeleteBlock(p, 'ply-18')).toBe('in-use')
    expect(deleteMaterial(p, 'ply-18')).toBe(p)
  })

  it('replaces every use, then deletes', () => {
    const p = busyProject()
    const next = deleteMaterial(p, 'ply-18', 'mdf-18')
    expect(next.materials.some((m) => m.id === 'ply-18')).toBe(false)
    expect(next.cabinets[1]!.construction.carcassMaterialId).toBe('mdf-18')
    expect(validateProject(next)).toBeNull()
  })

  it('stays blocked when the replacement is invalid', () => {
    const p = busyProject()
    expect(deleteMaterial(p, 'ply-18', 'maple-19x63')).toBe(p)
    expect(deleteMaterial(p, 'ply-18', 'nope')).toBe(p)
  })

  it('keeps the last material of each kind', () => {
    const p = fixtureProject()
    const noCabinets = { ...p, cabinets: [] }
    expect(materialDeleteBlock(noCabinets, 'maple-19x63')).toBe('last-of-kind')
    expect(deleteMaterial(noCabinets, 'maple-19x63')).toBe(noCabinets)
    expect(materialDeleteBlock(noCabinets, 'nope')).toBe('missing')
    expect(deleteMaterial(noCabinets, 'nope')).toBe(noCabinets)
  })
})

describe('addCabinet after a default material was deleted', () => {
  it('points the new cabinet at materials the project still has', () => {
    let p = busyProject()
    for (const [from, to] of [
      ['ply-18', 'mdf-18'],
      ['ply-6', 'bb-12'],
    ] as const)
      p = deleteMaterial(p, from, to)
    const preset = defaultCabinet('cab_3')
    preset.top = { ...preset.top, kind: 'finished', materialId: 'ply-18' }
    const next = addCabinet(p, preset)
    const added = next.cabinets.at(-1)!
    expect(added.construction.carcassMaterialId).toBe('bb-12')
    expect(added.construction.backMaterialId).toBe('bb-12')
    expect(added.construction.frontMaterialId).toBe('mdf-18')
    expect(added.top.materialId).toBeNull()
    expect(validateProject(next)).toBeNull()
  })
})
