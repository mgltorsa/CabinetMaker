import { describe, expect, it } from 'vitest'
import { DEFAULT_MATERIALS } from '@/core/defaults'
import { fixtureProject } from '@/core/fixtures'
import type { LinearMaterial, Material, SheetMaterial } from '@/core/types'
import {
  isHexColor,
  librarySummary,
  MATERIAL_PALETTE,
  materialSpec,
  materialWarnings,
  nextMaterialColor,
} from './materials'

const ply = DEFAULT_MATERIALS[0] as SheetMaterial
const maple = DEFAULT_MATERIALS[4] as LinearMaterial

describe('librarySummary', () => {
  it('counts materials by kind', () => {
    expect(librarySummary(DEFAULT_MATERIALS)).toBe('5 materials · 4 sheet, 1 linear')
    expect(librarySummary([ply])).toBe('1 material · 1 sheet, 0 linear')
  })
})

describe('materialSpec', () => {
  it('describes sheet goods and linear stock in project units', () => {
    expect(materialSpec(ply, 'metric')).toBe('18 mm · 2440 × 1220 mm · grained')
    expect(materialSpec({ ...ply, grained: false }, 'metric')).toBe('18 mm · 2440 × 1220 mm')
    expect(materialSpec(maple, 'metric')).toBe('19 × 63 mm · 2440 mm boards')
    expect(materialSpec(ply, 'imperial')).toBe('11/16" · 96 1/16" × 48 1/16" · grained')
  })
})

describe('materialWarnings', () => {
  const project = fixtureProject()

  it('is empty for the default catalog', () => {
    for (const m of project.materials) expect(materialWarnings(m, project)).toEqual([])
  })

  it('warns when a sheet is larger than the machine table', () => {
    const big: Material = { ...ply, sheetLength: 3050, sheetWidth: 1525 }
    expect(materialWarnings(big, project)).toEqual(['Sheet is larger than the 2500 × 1250 mm machine table; CAM will flag it.'])
  })

  it('warns when stock is thinner than 1 mm', () => {
    expect(materialWarnings({ ...maple, thickness: 0.5 }, project)).toEqual(['Thinner than 1 mm: check the thickness.'])
  })

  it('warns about a name shared with another material', () => {
    const twin: Material = { ...ply, id: 'twin' }
    expect(materialWarnings(twin, { ...project, materials: [...project.materials, twin] })).toEqual(['Another material has the same name.'])
  })
})

describe('colours', () => {
  it('validates #rrggbb hex colours only', () => {
    expect(isHexColor('#a1b2c3')).toBe(true)
    expect(isHexColor('#A1B2C3')).toBe(true)
    expect(isHexColor('#abc')).toBe(false)
    expect(isHexColor('a1b2c3')).toBe(false)
    expect(isHexColor('#a1b2c3ff')).toBe(false)
    expect(isHexColor('red')).toBe(false)
  })

  it('has a palette of distinct valid colours', () => {
    expect(MATERIAL_PALETTE.every(isHexColor)).toBe(true)
    expect(new Set(MATERIAL_PALETTE).size).toBe(MATERIAL_PALETTE.length)
  })

  it('picks the first palette colour no material uses yet, then cycles', () => {
    expect(nextMaterialColor([])).toBe(MATERIAL_PALETTE[0])
    expect(nextMaterialColor([{ ...ply, color: MATERIAL_PALETTE[0] }])).toBe(MATERIAL_PALETTE[1])
    const all = MATERIAL_PALETTE.map((color, i): Material => ({ ...ply, id: `m${i}`, color }))
    expect(nextMaterialColor(all)).toBe(MATERIAL_PALETTE[all.length % MATERIAL_PALETTE.length])
    expect(MATERIAL_PALETTE).toContain(nextMaterialColor([...all, ply]))
  })
})
