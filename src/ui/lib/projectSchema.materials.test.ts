import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Material, Project } from '@/core/types'
import { MATERIAL_THICKNESS, STOCK_SIZE } from './limits'
import { validateProject } from './projectSchema'

const withMaterial = (patch: Record<string, unknown>, index = 0): Project => {
  const p = fixtureProject()
  p.materials[index] = { ...p.materials[index], ...patch } as Material
  return p
}

describe('validateProject: materials', () => {
  it('accepts materials with or without a colour', () => {
    expect(validateProject(fixtureProject())).toBeNull()
    const p = fixtureProject()
    delete p.materials[0]!.color
    expect('color' in p.materials[0]!).toBe(false)
    expect(validateProject(p)).toBeNull()
  })

  it.each(['red', '#abc', '#a1b2c3ff', 'a1b2c3', 42, null])('rejects colour %s', (color) => {
    expect(validateProject(withMaterial({ color }))).toMatch(/^project\.materials\[0\]\.color/)
    expect(validateProject(withMaterial({ color }, 4))).toMatch(/^project\.materials\[4\]\.color/)
  })

  it('bounds thickness and stock sizes to the editor limits', () => {
    expect(validateProject(withMaterial({ thickness: MATERIAL_THICKNESS.min }))).toBeNull()
    expect(validateProject(withMaterial({ thickness: MATERIAL_THICKNESS.max }))).toBeNull()
    expect(validateProject(withMaterial({ thickness: MATERIAL_THICKNESS.max + 1 }))).toMatch(/thickness/)
    expect(validateProject(withMaterial({ sheetLength: STOCK_SIZE.max + 1 }))).toMatch(/sheetLength/)
    expect(validateProject(withMaterial({ width: STOCK_SIZE.min - 0.5 }, 4))).toMatch(/width/)
    expect(validateProject(withMaterial({ costPerSheet: -1 }))).toMatch(/costPerSheet/)
  })
})
