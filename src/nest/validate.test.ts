import { describe, expect, it } from 'vitest'
import type { NestResult, Placement, Sheet } from '@/core/types'
import { validateNest } from '.'
import { makeLinearMaterial, makePart, makeSettings, makeSheetMaterial } from './test-utils'

const material = makeSheetMaterial({ id: 'm', sheetLength: 1000, sheetWidth: 500, grained: true })
const linear = makeLinearMaterial({ id: 'lin' })
const materials = [material, linear]
const settings = makeSettings({ kerf: 5, edgeTrim: 10 })

const partA = makePart('a', 300, 200, { materialId: 'm', grain: 'length' })
const partB = makePart('b', 300, 200, { materialId: 'm', grain: 'width' })
const parts = [partA, partB]

const placeA: Placement = { partId: 'a', x: 10, y: 10, rotated: false, sizeX: 300, sizeY: 200 }
const placeB: Placement = { partId: 'b', x: 315, y: 10, rotated: true, sizeX: 200, sizeY: 300 }

function sheetWith(placements: Placement[], overrides: Partial<Sheet> = {}): Sheet {
  const area = placements.reduce((sum, p) => sum + p.sizeX * p.sizeY, 0)
  return { id: 'm#1', materialId: 'm', index: 1, length: 1000, width: 500, thickness: 18, placements, yield: area / 500000, ...overrides }
}

function resultWith(sheets: Sheet[], extra: Partial<NestResult> = {}): NestResult {
  return { sheets, linearPartIds: [], unplaced: [], summary: [], ...extra }
}

describe('validateNest', () => {
  it('accepts a valid hand-built nest', () => {
    expect(validateNest(resultWith([sheetWith([placeA, placeB])]), parts, materials, settings)).toEqual([])
  })

  it('accepts parts listed as unplaced', () => {
    const result = resultWith([sheetWith([placeA])], { unplaced: [{ partId: 'b', reason: 'test' }] })
    expect(validateNest(result, parts, materials, settings)).toEqual([])
  })

  it('flags parts that are neither placed nor unplaced', () => {
    expect(validateNest(resultWith([sheetWith([placeA])]), parts, materials, settings)).toEqual([
      expect.stringContaining('"b" is not placed'),
    ])
  })

  it('flags parts placed twice or both placed and unplaced', () => {
    const twice = resultWith([sheetWith([placeA, placeB]), sheetWith([placeA], { id: 'm#2', index: 2 })])
    expect(validateNest(twice, parts, materials, settings).join('\n')).toContain('"a" is placed 2 times')
    const both = resultWith([sheetWith([placeA, placeB])], { unplaced: [{ partId: 'a', reason: 'x' }] })
    expect(validateNest(both, parts, materials, settings).join('\n')).toContain('"a" is both placed and unplaced')
  })

  it('flags overlapping parts', () => {
    const overlap = { ...placeB, x: 200 }
    expect(validateNest(resultWith([sheetWith([placeA, overlap])]), parts, materials, settings).join('\n')).toContain(
      'too close',
    )
  })

  it('flags parts closer than kerf + spacing', () => {
    const tight = { ...placeB, x: 314 }
    const errors = validateNest(resultWith([sheetWith([placeA, tight])]), parts, materials, settings)
    expect(errors.join('\n')).toContain('"a" and "b" are too close')
  })

  it('accepts parts exactly kerf + spacing apart in Y', () => {
    const above = { ...placeB, x: 10, y: 215, rotated: true, sizeX: 200, sizeY: 275 }
    const shortB = makePart('b', 275, 200, { materialId: 'm', grain: 'width' })
    expect(validateNest(resultWith([sheetWith([placeA, above])]), [partA, shortB], materials, settings)).toEqual([])
  })

  it('flags parts outside the usable area', () => {
    const outside = { ...placeB, x: 795 }
    expect(validateNest(resultWith([sheetWith([placeA, outside])]), parts, materials, settings).join('\n')).toContain(
      'outside the usable area',
    )
    const inTrim = { ...placeA, x: 5 }
    expect(validateNest(resultWith([sheetWith([inTrim, placeB])]), parts, materials, settings).join('\n')).toContain(
      'outside the usable area',
    )
  })

  it('flags grain violations unless grain is ignored', () => {
    const wrong = { ...placeA, rotated: true, sizeX: 200, sizeY: 300 }
    const result = resultWith([sheetWith([wrong, placeB])])
    expect(validateNest(result, parts, materials, settings).join('\n')).toContain('grain')
    expect(validateNest(result, parts, materials, { ...settings, ignoreGrain: true })).toEqual([])
  })

  it('flags a placed size that does not match the part', () => {
    const wrongSize = { ...placeA, sizeX: 299 }
    expect(validateNest(resultWith([sheetWith([wrongSize, placeB])]), parts, materials, settings).join('\n')).toContain(
      'size',
    )
  })

  it('flags unknown placed parts and wrong materials', () => {
    const stranger: Placement = { partId: 'ghost', x: 600, y: 10, rotated: false, sizeX: 10, sizeY: 10 }
    expect(validateNest(resultWith([sheetWith([placeA, placeB, stranger])]), parts, materials, settings).join('\n')).toContain(
      'unknown part "ghost"',
    )
    const other = makePart('c', 100, 100, { materialId: 'other' })
    const onWrongSheet: Placement = { partId: 'c', x: 600, y: 10, rotated: false, sizeX: 100, sizeY: 100 }
    const errors = validateNest(resultWith([sheetWith([placeA, placeB, onWrongSheet])]), [...parts, other], materials, settings)
    expect(errors.join('\n')).toContain('material')
  })

  it('flags bad sheet records', () => {
    const errors = validateNest(
      resultWith([sheetWith([placeA, placeB], { id: 'wrong', length: 999, yield: 0.9 })]),
      parts,
      materials,
      settings,
    )
    const text = errors.join('\n')
    expect(text).toContain('id')
    expect(text).toContain('size')
    expect(text).toContain('yield')
    const unknownMaterial = validateNest(resultWith([sheetWith([], { materialId: 'zzz', id: 'zzz#1' })]), [], materials, settings)
    expect(unknownMaterial.join('\n')).toContain('unknown sheet material "zzz"')
  })

  it('requires linear parts in linearPartIds and never on sheets', () => {
    const rail = makePart('rail', 600, 38, { materialId: 'lin' })
    const missing = validateNest(resultWith([sheetWith([placeA, placeB])]), [...parts, rail], materials, settings)
    expect(missing.join('\n')).toContain('"rail"')
    const ok = validateNest(resultWith([sheetWith([placeA, placeB])], { linearPartIds: ['rail'] }), [...parts, rail], materials, settings)
    expect(ok).toEqual([])
  })

  it('flags non-linear parts listed in linearPartIds', () => {
    const result = resultWith([sheetWith([placeA, placeB])], { linearPartIds: ['a'] })
    expect(validateNest(result, parts, materials, settings).join('\n')).toContain('"a" is in linearPartIds')
  })

  it('flags summary counts that disagree with the sheets', () => {
    const good = { materialId: 'm', sheetCount: 1, partCount: 2, yield: 0 }
    expect(validateNest(resultWith([sheetWith([placeA, placeB])], { summary: [good] }), parts, materials, settings)).toEqual([])
    const bad = { ...good, partCount: 3 }
    expect(validateNest(resultWith([sheetWith([placeA, placeB])], { summary: [bad] }), parts, materials, settings).join('\n')).toContain(
      'summary "m"',
    )
  })

  it('flags a sheet thickness that differs from the material', () => {
    const errors = validateNest(resultWith([sheetWith([placeA, placeB], { thickness: 12 })]), parts, materials, settings)
    expect(errors.join('\n')).toContain('thickness')
  })

  it('requires parts with unknown material to be unplaced', () => {
    const orphan = makePart('orphan', 100, 100, { materialId: 'none' })
    expect(validateNest(resultWith([sheetWith([placeA, placeB])]), [...parts, orphan], materials, settings).join('\n')).toContain(
      '"orphan"',
    )
    const ok = resultWith([sheetWith([placeA, placeB])], { unplaced: [{ partId: 'orphan', reason: 'unknown' }] })
    expect(validateNest(ok, [...parts, orphan], materials, settings)).toEqual([])
  })
})
