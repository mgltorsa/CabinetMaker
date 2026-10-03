import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Part, ProjectBuild, Sheet } from '@/core/types'
import { DEFAULT_VIEW } from '../store'
import { sheetFilename, slugify } from './download'
import { parseLengthField, parseNumberField, parseOptionalLengthField } from './fieldParse'
import { dimsLabel, lengthLabel, money } from './format'
import { buildScene, isDrawerPart, isPartVisible } from './scene'
import { overallYield } from './sheets'

describe('field parsing', () => {
  it('parses metric and imperial lengths into mm', () => {
    expect(parseLengthField('600', 'metric')).toEqual({ ok: true, value: 600 })
    const inches = parseLengthField('23 5/8"', 'imperial')
    expect(inches.ok && inches.value).toBeCloseTo(600.075, 3)
  })

  it('rejects garbage and out-of-range values without producing NaN', () => {
    for (const text of ['', 'abc', 'NaN', '1/0', '12mm']) {
      const r = parseLengthField(text, text === '1/0' ? 'imperial' : 'metric')
      expect(r.ok).toBe(false)
    }
    expect(parseLengthField('-5', 'metric', { min: 0 })).toEqual({ ok: false, error: 'Must be at least 0' })
    expect(parseLengthField('5000', 'metric', { max: 3000 }).ok).toBe(false)
  })

  it('treats an empty optional length as auto', () => {
    expect(parseOptionalLengthField('  ', 'metric')).toEqual({ ok: true, value: null })
    expect(parseOptionalLengthField('300', 'metric')).toEqual({ ok: true, value: 300 })
    expect(parseOptionalLengthField('x', 'metric').ok).toBe(false)
  })

  it('parses plain numbers with integer and range rules', () => {
    expect(parseNumberField('3', { integer: true, min: 0 })).toEqual({ ok: true, value: 3 })
    expect(parseNumberField('2.5', { integer: true })).toEqual({ ok: false, error: 'Enter a whole number' })
    expect(parseNumberField('', {}).ok).toBe(false)
    expect(parseNumberField('Infinity', {}).ok).toBe(false)
  })
})

describe('formatting and downloads', () => {
  it('labels lengths in project units', () => {
    expect(lengthLabel(564, 'metric')).toBe('564 mm')
    expect(lengthLabel(600.075, 'imperial')).toBe('23 5/8"')
    expect(dimsLabel({ length: 564, width: 580, thickness: 18 }, 'metric')).toBe('564 × 580 × 18 mm')
  })

  it('falls back when the currency code is invalid', () => {
    expect(money(12.5, 'not-a-code')).toBe('12.50 not-a-code')
  })

  it('slugs project names for file names', () => {
    expect(slugify('Kitchen Run #2')).toBe('kitchen-run-2')
    expect(slugify('Café  Cabinets!')).toBe('cafe-cabinets')
    expect(slugify('***')).toBe('cabinet-project')
    expect(sheetFilename('untitled-cabinet', { materialId: 'ply-18', index: 2 })).toBe('untitled-cabinet-ply-18-2.nc')
  })
})

describe('nest stats', () => {
  const sheet = (length: number, width: number, y: number): Sheet => ({
    id: `m#${length}`,
    materialId: 'm',
    index: 0,
    length,
    width,
    thickness: 18,
    placements: [],
    yield: y,
  })

  it('weights yield by sheet area', () => {
    expect(overallYield([])).toBe(0)
    expect(overallYield([sheet(100, 100, 1), sheet(100, 300, 0)])).toBeCloseTo(0.25)
  })
})

describe('3D scene', () => {
  const part = (over: Partial<Part>): Part => ({
    id: 'c:x',
    cabinetId: 'cab_1',
    name: 'X',
    group: 'carcass',
    role: 'x',
    length: 100,
    width: 100,
    thickness: 18,
    materialId: 'ply-18',
    grain: 'length',
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 200, z: 300 } },
    axes: { length: 'y', width: 'z', thickness: 'x' },
    ops: [],
    ...over,
  })
  const buildOf = (parts: Part[]): ProjectBuild => ({ cabinets: [], parts, hardware: [], warnings: [] })

  it('hides groups by toggle', () => {
    expect(isPartVisible(part({ group: 'front' }), { ...DEFAULT_VIEW, fronts: false })).toBe(false)
    expect(isPartVisible(part({ group: 'back' }), { ...DEFAULT_VIEW, back: false })).toBe(false)
    expect(isPartVisible(part({ group: 'carcass' }), { ...DEFAULT_VIEW, back: false, fronts: false, top: false, drawerBoxes: false })).toBe(true)
  })

  it('recognises drawer parts', () => {
    expect(isDrawerPart(part({ group: 'drawer-box' }))).toBe(true)
    expect(isDrawerPart(part({ group: 'front', role: 'drawer-front-1' }))).toBe(true)
    expect(isDrawerPart(part({ group: 'front', role: 'door-left' }))).toBe(false)
  })

  it('builds metre-scale meshes centred on the run', () => {
    const { cabinets } = fixtureProject()
    const scene = buildScene(buildOf([part({})]), cabinets, DEFAULT_VIEW)
    expect(scene.meshes).toHaveLength(1)
    const mesh = scene.meshes[0]!
    expect(mesh.size).toEqual([0.1, 0.2, 0.3])
    expect(mesh.position).toEqual([0, 0.1, 0])
  })

  it('slides drawer parts out along +Z when open', () => {
    const { cabinets } = fixtureProject()
    const drawer = part({ id: 'c:d', group: 'drawer-box', role: 'drawer-1-side' })
    const carcass = part({ id: 'c:s' })
    const closed = buildScene(buildOf([carcass, drawer]), cabinets, DEFAULT_VIEW)
    const open = buildScene(buildOf([carcass, drawer]), cabinets, { ...DEFAULT_VIEW, open: true })
    const z = (s: typeof open, id: string) => s.meshes.find((m) => m.partId === id)!.position[2]
    expect(z(open, 'c:d') - z(open, 'c:s')).toBeGreaterThan(z(closed, 'c:d') - z(closed, 'c:s'))
  })

  it('handles an empty build', () => {
    expect(buildScene(buildOf([]), [], DEFAULT_VIEW).meshes).toEqual([])
  })
})
