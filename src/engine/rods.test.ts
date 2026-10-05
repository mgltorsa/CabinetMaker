import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS, DEFAULT_ROD_MATERIAL_ID } from '@/core/defaults'
import type { Cabinet, ConstructionStyle, JoineryType, Part } from '@/core/types'
import { DEFAULT_ROD_DROP, ROD_END_CLEARANCE, ROD_MAX_UNSUPPORTED_SPAN, ROD_SHELF_CLEARANCE } from './constants'
import { buildCabinet } from './index'
import { createPreset, PRESETS } from './presets'
import { bay, build, part, section, testCabinet, usage, warningCodes } from './testkit'
import { validateBuild } from './validate'

const rods = (parts: readonly Part[]): Part[] => parts.filter((p) => p.group === 'rod')
const shelves = (parts: readonly Part[]): Part[] => parts.filter((p) => p.group === 'shelf')
const mid = (p: Part, axis: 'x' | 'y' | 'z'): number => (p.bounds.min[axis] + p.bounds.max[axis]) / 2

/** 1000 × 2100 × 600 tall box, one door bay (pair) with a rod; frameless overlay unless overridden. */
function wardrobe(extra: Partial<Cabinet['sections'][number]['bays'][number]> = {}, style: ConstructionStyle = 'frameless-overlay', width = 1000) {
  return testCabinet({
    type: 'wardrobe',
    width,
    height: 2100,
    depth: 600,
    construction: { style, top: 'full-top' },
    sections: [section([bay('door', null, { doorCount: 2, rod: { dropFromTop: DEFAULT_ROD_DROP }, ...extra })])],
  })
}

describe('hanging rods: geometry', () => {
  it('frameless: spans the interior less the end clearance, centred the drop below the bay top and on the usable depth', () => {
    const b = build(wardrobe())
    const rod = part(b, 'rod-1-1')
    // 1000 wide, 18 mm sides → interior 18…982; toe kick 100 + 18 bottom → interior y 118…2082.
    expect(rod.group).toBe('rod')
    expect(rod.name).toBe('Rod 1.1')
    expect(rod.materialId).toBe(DEFAULT_ROD_MATERIAL_ID)
    expect(rod.grain).toBe('none')
    expect(rod.bounds.min.x).toBeCloseTo(18 + ROD_END_CLEARANCE, 6)
    expect(rod.bounds.max.x).toBeCloseTo(982 - ROD_END_CLEARANCE, 6)
    expect(rod.length).toBeCloseTo(964 - 2 * ROD_END_CLEARANCE, 6)
    expect(rod.thickness).toBe(25)
    expect(rod.width).toBe(25)
    expect(mid(rod, 'y')).toBeCloseTo(2082 - DEFAULT_ROD_DROP, 6)
    // Captured back (12 inset + 6) and an 18 mm rear nailer → usable depth 36…600.
    expect(mid(rod, 'z')).toBeCloseTo((36 + 600) / 2, 6)
    expect(validateBuild(b)).toEqual([])
  })

  it('face frame: spans the carcass (not the narrower frame opening) and drops from the opening top', () => {
    const b = build(wardrobe({}, 'face-frame-overlay'))
    const rod = part(b, 'rod-1-1')
    const left = part(b, 'side-left')
    const right = part(b, 'side-right')
    expect(rod.bounds.min.x).toBeCloseTo(left.bounds.max.x + ROD_END_CLEARANCE, 6)
    expect(rod.bounds.max.x).toBeCloseTo(right.bounds.min.x - ROD_END_CLEARANCE, 6)
    // Face-frame openings stop at the 38 mm rails: 100 kick + 38 … 2100 − 38.
    expect(mid(rod, 'y')).toBeCloseTo(2062 - DEFAULT_ROD_DROP, 6)
    expect(validateBuild(b)).toEqual([])
  })

  it.each<ConstructionStyle>(['frameless-overlay', 'face-frame-inset'])('%s: rods in two sections stop short of the divider', (style) => {
    const cab = testCabinet({
      width: 1200,
      height: 2100,
      depth: 600,
      construction: { style, top: 'full-top' },
      sections: [section([bay('open', null, { rod: { dropFromTop: 80 } })]), section([bay('door', null, { rod: { dropFromTop: 80 } })])],
    })
    const b = build(cab)
    const divider = b.parts.find((p) => p.group === 'divider')!
    expect(part(b, 'rod-1-1').bounds.max.x).toBeCloseTo(divider.bounds.min.x - ROD_END_CLEARANCE, 6)
    expect(part(b, 'rod-2-1').bounds.min.x).toBeCloseTo(divider.bounds.max.x + ROD_END_CLEARANCE, 6)
    expect(validateBuild(b)).toEqual([])
  })

  it('ignores a rod on a drawer bay and builds no rod without one', () => {
    expect(rods(build(wardrobe({ kind: 'drawer' })).parts)).toEqual([])
    expect(rods(build(testCabinet({ sections: [section([bay('door', null, { doorCount: 2 })])] })).parts)).toEqual([])
  })

  it('warns and skips a rod whose drop puts it outside the bay', () => {
    for (const dropFromTop of [5, 3000]) {
      const b = build(wardrobe({ rod: { dropFromTop } }))
      expect(rods(b.parts), `drop ${dropFromTop}`).toEqual([])
      expect(warningCodes(b)).toContain('rod-doesnt-fit')
    }
  })

  it('cuts the rod from the construction rod material (diameter = thickness)', () => {
    const cab = wardrobe()
    cab.construction.rodMaterialId = 'rod-32'
    const materials = [...DEFAULT_MATERIALS, { kind: 'linear' as const, id: 'rod-32', name: 'Rod Ø32', thickness: 32, width: 32, stockLength: 2440, costPerMetre: 9, profile: 'round' as const }]
    const rod = buildCabinet(cab, { materials, hardware: DEFAULT_HARDWARE }).parts.find((p) => p.group === 'rod')!
    expect(rod.materialId).toBe('rod-32')
    expect(rod.thickness).toBe(32)
    expect(rod.width).toBe(32)
  })

  it('warns (without failing the cabinet) when the rod material is unknown', () => {
    const cab = wardrobe()
    cab.construction.rodMaterialId = 'nope'
    const b = build(cab)
    expect(rods(b.parts)).toEqual([])
    expect(b.warnings).toContainEqual(expect.objectContaining({ level: 'warn', code: 'unknown-material' }))
    expect(b.parts.some((p) => p.role === 'side-left')).toBe(true)
  })
})

describe('hanging rods: supports', () => {
  it('uses two end supports per rod', () => {
    const b = build(wardrobe())
    expect(usage(b, 'rod-end-25')).toBe(2)
    expect(usage(b, 'rod-centre-25')).toBe(0)
    expect(warningCodes(b)).not.toContain('rod-centre-support')
  })

  it(`adds a centre support and warns when a rod is longer than ${ROD_MAX_UNSUPPORTED_SPAN} mm`, () => {
    const b = build(wardrobe({}, 'frameless-overlay', 1400))
    expect(part(b, 'rod-1-1').length).toBeGreaterThan(ROD_MAX_UNSUPPORTED_SPAN)
    expect(usage(b, 'rod-end-25')).toBe(2)
    expect(usage(b, 'rod-centre-25')).toBe(1)
    expect(b.warnings).toContainEqual(expect.objectContaining({ level: 'warn', code: 'rod-centre-support', partId: 'cab:rod-1-1' }))
  })

  it('warns when the catalog has no rod supports', () => {
    const b = buildCabinet(wardrobe(), { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE.filter((h) => h.kind !== 'rod-support') })
    expect(rods(b.parts)).toHaveLength(1)
    expect(b.warnings).toContainEqual(expect.objectContaining({ code: 'unknown-hardware' }))
  })
})

describe('hanging rods: shelves stay above the rod', () => {
  it('puts the lowest shelf just above the rod, clear of the hanging space', () => {
    const b = build(wardrobe({ shelfCount: 1, rod: { dropFromTop: 350 } }))
    const rodY = mid(part(b, 'rod-1-1'), 'y')
    const [shelf] = shelves(b.parts)
    expect(shelf).toBeDefined()
    expect(shelf!.bounds.min.y).toBeGreaterThanOrEqual(rodY + ROD_SHELF_CLEARANCE - 0.001)
    // Snapped to the 32 mm pin grid at most one pitch above the clearance line.
    expect(shelf!.bounds.min.y).toBeLessThan(rodY + ROD_SHELF_CLEARANCE + 32)
    expect(validateBuild(b)).toEqual([])
  })

  it('spreads further shelves evenly above the lowest one', () => {
    const b = build(wardrobe({ shelfCount: 3, rod: { dropFromTop: 900 } }))
    const rodY = mid(part(b, 'rod-1-1'), 'y')
    const ys = shelves(b.parts).map((p) => p.bounds.min.y).sort((a, c) => a - c)
    expect(ys).toHaveLength(3)
    expect(ys[0]!).toBeGreaterThanOrEqual(rodY + ROD_SHELF_CLEARANCE - 0.001)
    expect(ys[0]!).toBeLessThan(rodY + ROD_SHELF_CLEARANCE + 32)
    expect(validateBuild(b)).toEqual([])
  })

  it('warns and omits shelves that would sit in the hanging space', () => {
    const b = build(wardrobe({ shelfCount: 2 }))
    expect(shelves(b.parts)).toEqual([])
    expect(warningCodes(b)).toContain('shelves-in-hanging-space')
    expect(rods(b.parts)).toHaveLength(1)
  })

  it('leaves shelves in bays without a rod where they were', () => {
    const shelved = section([bay('open', null, { shelfCount: 2 })])
    const withRod = build(testCabinet({ width: 1000, sections: [section([bay('open', null, { rod: { dropFromTop: 80 } })]), shelved] }))
    const plain = build(testCabinet({ width: 1000, sections: [section([bay('open')]), shelved] }))
    expect(rods(withRod.parts)).toHaveLength(1)
    expect(shelves(withRod.parts).map((p) => p.bounds)).toEqual(shelves(plain.parts).map((p) => p.bounds))
  })
})

describe('hanging rods: every preset and style accepts rods in every door/open bay', () => {
  const STYLES: ConstructionStyle[] = ['frameless-overlay', 'frameless-inset', 'face-frame-overlay', 'face-frame-inset']
  const JOINERY: JoineryType[] = ['none', 'dado']
  const cases = PRESETS.flatMap((p) => STYLES.flatMap((s) => JOINERY.map((j) => [p.type, s, j] as const)))

  it.each(cases)('%s / %s / %s', (type, style, joinery) => {
    const cab = createPreset(type)
    cab.id = 'cab'
    cab.construction.style = style
    cab.construction.joinery = joinery
    cab.sections = cab.sections.map((s) => ({ ...s, bays: s.bays.map((b) => (b.kind === 'drawer' ? b : { ...b, rod: { dropFromTop: DEFAULT_ROD_DROP } })) }))
    const b = buildCabinet(cab, { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE })
    expect(b.warnings.filter((w) => w.level === 'error')).toEqual([])
    expect(validateBuild(b)).toEqual([])
    for (const rod of rods(b.parts)) {
      const bayShelves = shelves(b.parts).filter((s) => s.role.startsWith(`shelf-${rod.role.slice('rod-'.length)}-`))
      for (const shelf of bayShelves) expect(shelf.bounds.min.y, `${shelf.role} above ${rod.role}`).toBeGreaterThan(rod.bounds.max.y)
    }
  })
})
