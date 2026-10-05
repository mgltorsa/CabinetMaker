import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Bay, Cabinet, Project } from '@/core/types'
import { createPreset } from '@/engine/presets'
import { ROD_DROP } from './limits'
import { validateProject } from './projectSchema'

/** JSON round trip of the fixture, edited in place (the copy is ours). */
function edited(edit: (p: Project) => void): unknown {
  const project = JSON.parse(JSON.stringify(fixtureProject())) as Project
  edit(project)
  return project
}

const cab = (p: Project): Cabinet => p.cabinets[0]!
const doorBay = (p: Project): Bay => cab(p).sections[0]!.bays[1]!

describe('validateProject: hanging rods and wardrobes', () => {
  it('accepts a wardrobe preset, a bay rod, a rod material choice and rod supports', () => {
    expect(validateProject(edited((p) => (p.cabinets = [{ ...createPreset('wardrobe'), id: 'cab_w' }])))).toBeNull()
    expect(validateProject(edited((p) => (doorBay(p).rod = { dropFromTop: 65 })))).toBeNull()
    expect(validateProject(edited((p) => (cab(p).construction.rodMaterialId = 'rod-25-chrome')))).toBeNull()
    expect(fixtureProject().hardware.some((h) => h.kind === 'rod-support')).toBe(true)
    expect(validateProject(fixtureProject())).toBeNull()
  })

  it('accepts projects saved before rods existed (no rod, no rod material, no round profile)', () => {
    const legacy = edited((p) => {
      p.materials = p.materials.filter((m) => m.id !== 'rod-25-chrome')
      p.hardware = p.hardware.filter((h) => h.kind !== 'rod-support')
    })
    expect(validateProject(legacy)).toBeNull()
  })

  it.each([
    ['a zero rod drop', (p: Project) => (doorBay(p).rod = { dropFromTop: 0 }), 'project.cabinets[0].sections[0].bays[1].rod.dropFromTop'],
    ['a huge rod drop', (p: Project) => (doorBay(p).rod = { dropFromTop: ROD_DROP.max + 1 }), 'project.cabinets[0].sections[0].bays[1].rod.dropFromTop'],
    ['a rod that is not an object', (p: Project) => ((doorBay(p) as unknown as Record<string, unknown>).rod = true), 'project.cabinets[0].sections[0].bays[1].rod'],
    ['a numeric rod material id', (p: Project) => ((cab(p).construction as unknown as Record<string, unknown>).rodMaterialId = 7), 'project.cabinets[0].construction.rodMaterialId'],
    ['an unknown linear profile', (p: Project) => ((p.materials[4] as unknown as Record<string, unknown>).profile = 'oval'), 'project.materials[4].profile'],
    ['an unknown cabinet type', (p: Project) => ((cab(p) as unknown as Record<string, unknown>).type = 'closet'), 'project.cabinets[0].type'],
  ])('rejects %s and names the path', (_, edit, path) => {
    const error = validateProject(edited(edit))
    expect(error).not.toBeNull()
    expect(error!.startsWith(path)).toBe(true)
  })
})
