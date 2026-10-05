import { describe, expect, it } from 'vitest'
import { DEFAULT_ROD_MATERIAL_ID } from '@/core/defaults'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { validateProject } from './lib/projectSchema'
import { ensureRodCatalog, setBayRod } from './projectOps'
import { createDesignerStore } from './store'

/** A project saved before rods existed: no rod material, no rod supports. */
function legacyProject(): Project {
  const p = fixtureProject()
  return { ...p, materials: p.materials.filter((m) => m.id !== DEFAULT_ROD_MATERIAL_ID), hardware: p.hardware.filter((h) => h.kind !== 'rod-support') }
}

const doorBay = (p: Project) => p.cabinets[0]!.sections[0]!.bays[1]!

describe('setBayRod', () => {
  it('adds a rod to a bay and removes the key again (no `rod: undefined` left behind)', () => {
    const p = fixtureProject()
    const withRod = setBayRod(p, 'cab_1', 'sec_1', 'bay_1_2', { dropFromTop: 70 })
    expect(doorBay(withRod).rod).toEqual({ dropFromTop: 70 })
    expect(doorBay(p).rod).toBeUndefined()
    const without = setBayRod(withRod, 'cab_1', 'sec_1', 'bay_1_2', null)
    expect('rod' in doorBay(without)).toBe(false)
    expect(validateProject(without)).toBeNull()
  })
})

describe('ensureRodCatalog', () => {
  it('is a no-op (same reference) when no cabinet has a rod', () => {
    const p = legacyProject()
    expect(ensureRodCatalog(p)).toBe(p)
  })

  it('adds the default rod material and supports to a project that lacks them, once', () => {
    const p = setBayRod(legacyProject(), 'cab_1', 'sec_1', 'bay_1_2', { dropFromTop: 65 })
    const next = ensureRodCatalog(p)
    expect(next.materials.some((m) => m.id === DEFAULT_ROD_MATERIAL_ID)).toBe(true)
    expect(next.hardware.filter((h) => h.kind === 'rod-support').length).toBeGreaterThan(0)
    expect(ensureRodCatalog(next)).toBe(next)
  })

  it('leaves a project alone that already has rod stock and supports', () => {
    const p = setBayRod(fixtureProject(), 'cab_1', 'sec_1', 'bay_1_2', { dropFromTop: 65 })
    expect(ensureRodCatalog(p)).toBe(p)
  })
})

describe('designer store: rods', () => {
  it('setBayRod toggles the rod and keeps the catalog complete', () => {
    const store = createDesignerStore(legacyProject())
    store.getState().setBayRod('cab_1', 'sec_1', 'bay_1_2', { dropFromTop: 65 })
    const p = store.getState().project
    expect(doorBay(p).rod).toEqual({ dropFromTop: 65 })
    expect(p.materials.some((m) => m.id === DEFAULT_ROD_MATERIAL_ID)).toBe(true)
    store.getState().setBayRod('cab_1', 'sec_1', 'bay_1_2', null)
    expect(doorBay(store.getState().project).rod).toBeUndefined()
  })

  it('adding the wardrobe preset to an old project brings its rod stock along', () => {
    const store = createDesignerStore(legacyProject())
    store.getState().addCabinetFromPreset('wardrobe')
    const p = store.getState().project
    expect(p.cabinets.at(-1)!.type).toBe('wardrobe')
    expect(p.materials.some((m) => m.id === DEFAULT_ROD_MATERIAL_ID)).toBe(true)
    expect(validateProject(p)).toBeNull()
  })
})
