import { describe, expect, it } from 'vitest'
import { DEFAULT_MATERIALS, DEFAULT_NEST } from '@/core/defaults'
import type { Part } from '@/core/types'
import { nestParts, validateNest } from '.'
import { makeLinearMaterial, makePart, makeSettings, makeSheetMaterial } from './test-utils'

const small = makeSheetMaterial({ id: 'small', sheetLength: 1000, sheetWidth: 600 })
const smallGrained = makeSheetMaterial({ id: 'small', sheetLength: 1000, sheetWidth: 600, grained: true })

describe('nestParts: basics', () => {
  it('returns an empty result for no parts', () => {
    expect(nestParts([], [small], makeSettings())).toEqual({ sheets: [], linearPartIds: [], unplaced: [], summary: [] })
  })

  it('places a single part at the trim corner and builds the sheet record', () => {
    const material = makeSheetMaterial({ id: 'ply', sheetLength: 2440, sheetWidth: 1220, thickness: 18, grained: true })
    const part = makePart('a', 600, 400, { materialId: 'ply', grain: 'length' })
    const result = nestParts([part], [material], makeSettings({ edgeTrim: 10, kerf: 6 }))

    expect(result.unplaced).toEqual([])
    expect(result.sheets).toHaveLength(1)
    const sheet = result.sheets[0]
    expect(sheet).toMatchObject({ id: 'ply#1', materialId: 'ply', index: 1, length: 2440, width: 1220, thickness: 18 })
    expect(sheet?.placements).toEqual([{ partId: 'a', x: 10, y: 10, rotated: false, sizeX: 600, sizeY: 400 }])
    expect(sheet?.yield).toBeCloseTo((600 * 400) / (2440 * 1220), 10)
    expect(result.summary).toEqual([{ materialId: 'ply', sheetCount: 1, partCount: 1, yield: sheet?.yield }])
  })

  it('lists linear-stock parts without nesting them', () => {
    const linear = makeLinearMaterial({ id: 'maple' })
    const parts = [makePart('stile', 700, 38, { materialId: 'maple' }), makePart('panel', 500, 300, { materialId: 'small' })]
    const result = nestParts(parts, [small, linear], makeSettings())
    expect(result.linearPartIds).toEqual(['stile'])
    expect(result.sheets.flatMap((s) => s.placements.map((p) => p.partId))).toEqual(['panel'])
    expect(result.summary.map((s) => s.materialId)).toEqual(['small'])
  })

  it('reports parts with an unknown material', () => {
    const result = nestParts([makePart('x', 100, 100, { materialId: 'nope' })], [small], makeSettings())
    expect(result.unplaced).toEqual([{ partId: 'x', reason: expect.stringContaining('unknown material "nope"') }])
    expect(result.sheets).toEqual([])
  })

  it('reports parts too large for an empty sheet with sizes in the reason', () => {
    const result = nestParts([makePart('big', 1200, 300, { materialId: 'small' })], [small], makeSettings({ edgeTrim: 10 }))
    expect(result.unplaced).toHaveLength(1)
    expect(result.unplaced[0]?.reason).toContain('1200 × 300')
    expect(result.unplaced[0]?.reason).toContain('980 × 580')
    expect(result.summary).toEqual([{ materialId: 'small', sheetCount: 0, partCount: 0, yield: 0 }])
  })

  it('mentions locked rotation when grain prevents an otherwise possible fit', () => {
    const part = makePart('tall', 300, 900, { materialId: 'small', grain: 'length' })
    const result = nestParts([part], [smallGrained], makeSettings())
    expect(result.unplaced[0]?.reason).toContain('grain')
  })

  it('reports parts with invalid dimensions', () => {
    const parts = [makePart('zero', 0, 100, { materialId: 'small' }), makePart('nan', Number.NaN, 100, { materialId: 'small' })]
    const result = nestParts(parts, [small], makeSettings())
    expect(result.unplaced.map((u) => u.partId)).toEqual(['zero', 'nan'])
    expect(result.unplaced[0]?.reason).toContain('invalid part size')
  })

  it('reports duplicate part ids instead of placing them twice', () => {
    const parts = [makePart('dup', 100, 100, { materialId: 'small' }), makePart('dup', 100, 100, { materialId: 'small' })]
    const result = nestParts(parts, [small], makeSettings())
    expect(result.sheets[0]?.placements).toHaveLength(1)
    expect(result.unplaced).toEqual([{ partId: 'dup', reason: expect.stringContaining('duplicate part id') }])
  })

  it('reports every part when the edge trim leaves no usable area', () => {
    const result = nestParts([makePart('a', 10, 10, { materialId: 'small' })], [small], makeSettings({ edgeTrim: 300 }))
    expect(result.unplaced[0]?.reason).toContain('no usable area')
  })

  it.each([
    ['negative kerf', { kerf: -1 }],
    ['NaN trim', { edgeTrim: Number.NaN }],
    ['negative spacing', { partSpacing: -2 }],
  ])('reports every sheet part when settings are invalid (%s)', (_label, overrides) => {
    const result = nestParts([makePart('a', 10, 10, { materialId: 'small' })], [small], makeSettings(overrides))
    expect(result.sheets).toEqual([])
    expect(result.unplaced[0]?.reason).toContain('invalid nest settings')
  })
})

describe('nestParts: rotation and grain', () => {
  // Two 600 × 450 parts on a 1000 × 600 sheet: side by side only when rotated (450 + 450 ≤ 1000).
  const pair = (grain: Part['grain']): Part[] => [
    makePart('a', 600, 450, { materialId: 'small', grain }),
    makePart('b', 600, 450, { materialId: 'small', grain }),
  ]

  it('rotates parts to fit them side by side on one sheet', () => {
    const result = nestParts(pair('none'), [small], makeSettings())
    expect(result.sheets).toHaveLength(1)
    expect(result.sheets[0]?.placements.every((p) => p.rotated && p.sizeX === 450 && p.sizeY === 600)).toBe(true)
  })

  it('needs a second sheet when grain locks rotation', () => {
    const result = nestParts(pair('length'), [smallGrained], makeSettings())
    expect(result.sheets.map((s) => s.id)).toEqual(['small#1', 'small#2'])
    expect(result.sheets.flatMap((s) => s.placements).every((p) => !p.rotated)).toBe(true)
    expect(result.summary).toEqual([
      { materialId: 'small', sheetCount: 2, partCount: 2, yield: expect.closeTo((2 * 600 * 450) / (2 * 1000 * 600), 10) },
    ])
  })

  it('ignores grain when settings.ignoreGrain is set', () => {
    const result = nestParts(pair('length'), [smallGrained], makeSettings({ ignoreGrain: true }))
    expect(result.sheets).toHaveLength(1)
  })

  it('ignores part grain on an ungrained material', () => {
    expect(nestParts(pair('length'), [small], makeSettings()).sheets).toHaveLength(1)
  })

  it('always rotates width-grain parts on grained material', () => {
    const part = makePart('w', 400, 200, { materialId: 'small', grain: 'width' })
    const placement = nestParts([part], [smallGrained], makeSettings()).sheets[0]?.placements[0]
    expect(placement).toMatchObject({ rotated: true, sizeX: 200, sizeY: 400 })
  })
})

describe('nestParts: kerf, spacing and trim', () => {
  const halves = [makePart('a', 500, 500, { materialId: 'sq' }), makePart('b', 500, 500, { materialId: 'sq' })]
  const sq = makeSheetMaterial({ id: 'sq', sheetLength: 1000, sheetWidth: 500 })

  it('fits two exact halves with zero kerf', () => {
    expect(nestParts(halves, [sq], makeSettings()).sheets).toHaveLength(1)
  })

  it('kerf makes an exact fit fail', () => {
    expect(nestParts(halves, [sq], makeSettings({ kerf: 3 })).sheets).toHaveLength(2)
  })

  it('lets parts touch the trim boundary', () => {
    const trimmed = makeSheetMaterial({ id: 'sq', sheetLength: 1020, sheetWidth: 520 })
    const result = nestParts(halves, [trimmed], makeSettings({ edgeTrim: 10 }))
    expect(result.sheets).toHaveLength(1)
    const xs = result.sheets[0]?.placements.map((p) => p.x).sort((m, n) => m - n)
    expect(xs).toEqual([10, 510])
  })

  it('keeps kerf + partSpacing between parts', () => {
    const parts = [makePart('a', 495, 500, { materialId: 'sq' }), makePart('b', 495, 500, { materialId: 'sq' })]
    const fits = nestParts(parts, [sq], makeSettings({ kerf: 5, partSpacing: 5 }))
    expect(fits.sheets).toHaveLength(1)
    const [p, q] = [...(fits.sheets[0]?.placements ?? [])].sort((m, n) => m.x - n.x)
    expect((q?.x ?? 0) - ((p?.x ?? 0) + (p?.sizeX ?? 0))).toBeCloseTo(10, 10)

    expect(nestParts(parts, [sq], makeSettings({ kerf: 5, partSpacing: 6 })).sheets).toHaveLength(2)
  })
})

describe('nestParts: multiple materials and determinism', () => {
  it('nests each material separately in materials order', () => {
    const a = makeSheetMaterial({ id: 'a', sheetLength: 500, sheetWidth: 500 })
    const b = makeSheetMaterial({ id: 'b', sheetLength: 500, sheetWidth: 500 })
    const parts = [
      makePart('b1', 400, 400, { materialId: 'b' }),
      makePart('a1', 400, 400, { materialId: 'a' }),
      makePart('a2', 400, 400, { materialId: 'a' }),
    ]
    const result = nestParts(parts, [a, b], makeSettings())
    expect(result.sheets.map((s) => s.id)).toEqual(['a#1', 'a#2', 'b#1'])
    expect(result.summary.map((s) => [s.materialId, s.sheetCount, s.partCount])).toEqual([
      ['a', 2, 2],
      ['b', 1, 1],
    ])
  })

  it('is deterministic and independent of input order', () => {
    const parts = Array.from({ length: 40 }, (_, i) =>
      makePart(`p${i}`, 200 + ((i * 37) % 500), 100 + ((i * 53) % 300), { materialId: 'ply-18', grain: i % 3 === 0 ? 'none' : 'length' }),
    )
    const first = nestParts(parts, DEFAULT_MATERIALS, DEFAULT_NEST)
    const again = nestParts(parts, DEFAULT_MATERIALS, DEFAULT_NEST)
    const reversed = nestParts([...parts].reverse(), DEFAULT_MATERIALS, DEFAULT_NEST)
    expect(again).toEqual(first)
    expect(reversed.sheets).toEqual(first.sheets)
    expect(validateNest(first, parts, DEFAULT_MATERIALS, DEFAULT_NEST)).toEqual([])
  })

  it('does not mutate its inputs', () => {
    const parts = [makePart('a', 300, 200, { materialId: 'small' })]
    const materials = [small]
    const settings = makeSettings({ kerf: 4 })
    const snapshot = structuredClone({ parts, materials, settings })
    nestParts(parts, materials, settings)
    expect({ parts, materials, settings }).toEqual(snapshot)
  })
})
