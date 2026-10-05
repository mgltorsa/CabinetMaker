import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Estimate, HardwareUsage, NestResult, Part, Project, ProjectBuild } from '@/core/types'
import { buildBom } from './bom'
import { clampMargin, estimateCost, MAX_MARGIN } from './cost'
import { toCents } from './money'
import { dado, hole, lcg, makeBuild, makeNest, makePart, usage } from './test-fixtures'

function withSettings(patch: Partial<Project['estimate']>): Project {
  const base = fixtureProject()
  return { ...base, estimate: { ...base.estimate, ...patch } }
}

function run(project: Project, build: ProjectBuild, nest: NestResult): Estimate {
  return estimateCost(project, build, nest, buildBom(project, build, nest))
}

function smallJob(): { build: ProjectBuild; nest: NestResult } {
  const parts = [
    makePart({ id: 'p1', ops: [dado('d1'), hole('h1', 'shelf-pin')] }),
    makePart({ id: 'lin', materialId: 'maple-19x63', length: 1000 }),
  ]
  const build = makeBuild(parts, [usage('blum-cliptop-110', 2)])
  const nest = makeNest([{ materialId: 'ply-18', partIds: ['p1'] }], ['lin'])
  return { build, nest }
}

describe('clampMargin', () => {
  it.each([
    [0.2, 0.2],
    [0, 0],
    [-0.1, 0],
    [1, MAX_MARGIN],
    [5, MAX_MARGIN],
    [Number.NaN, 0],
  ])('clamps %d to %d', (input, expected) => {
    expect(clampMargin(input)).toBe(expected)
  })
})

describe('estimateCost', () => {
  it('prices a small job by hand', () => {
    const project = withSettings({
      shopRate: 60,
      margin: 0.2,
      linearWaste: 0,
      labor: {
        minutesPerSheet: 10,
        minutesPerPart: 1,
        minutesPerJoineryOp: 1,
        minutesPerHole: 1,
        minutesPerHardwareItem: 2,
        assemblyMinutesPerCabinet: 30,
      },
    })
    const { build, nest } = smallJob()
    const estimate = run(project, build, nest)

    // materials: 1 sheet × 85 + 1 m maple × 12 = 97
    expect(estimate.materials.map((l) => l.total)).toEqual([85, 12])
    expect(estimate.materialCost).toBe(97)
    // hardware: 2 hinges × 6.5 = 13
    expect(estimate.hardwareCost).toBe(13)
    // labor minutes: cutting 10 + 2 = 12, joinery 1, drilling 1, hardware 4, assembly 30 = 48 → 48 at 60/h
    expect(estimate.labor.map((l) => l.minutes)).toEqual([12, 1, 1, 4, 30])
    expect(estimate.laborCost).toBe(48)
    expect(estimate.subtotal).toBe(158)
    // 158 / 0.8 = 197.5
    expect(estimate.price).toBe(197.5)
    expect(estimate.marginAmount).toBe(39.5)
    expect(estimate.currency).toBe('USD')
  })

  it('splits BOM lines into materials and hardware', () => {
    const { build, nest } = smallJob()
    const estimate = run(fixtureProject(), build, nest)
    expect(estimate.materials.map((l) => l.category)).toEqual(['sheet', 'linear'])
    expect(estimate.hardware.map((l) => l.category)).toEqual(['hardware'])
  })

  it('charges no margin when margin is zero', () => {
    const { build, nest } = smallJob()
    const estimate = run(withSettings({ margin: 0 }), build, nest)
    expect(estimate.price).toBe(estimate.subtotal)
    expect(estimate.marginAmount).toBe(0)
  })

  it('clamps an impossible margin instead of dividing by zero', () => {
    const { build, nest } = smallJob()
    const estimate = run(withSettings({ margin: 1 }), build, nest)
    expect(Number.isFinite(estimate.price)).toBe(true)
    expect(estimate.price).toBeCloseTo(estimate.subtotal / (1 - MAX_MARGIN), 2)
  })

  it('treats a negative margin as zero', () => {
    const { build, nest } = smallJob()
    const estimate = run(withSettings({ margin: -0.5 }), build, nest)
    expect(estimate.price).toBe(estimate.subtotal)
  })

  it('returns an all-zero estimate for an empty build', () => {
    const estimate = run(fixtureProject(), makeBuild([]), makeNest([]))
    expect(estimate).toMatchObject({ materialCost: 0, hardwareCost: 0, laborCost: 0, subtotal: 0, marginAmount: 0, price: 0, tax: 0, total: 0 })
  })

  it('applies markups, extras, margin, tax and the minimum charge by hand', () => {
    const project = withSettings({
      shopRate: 60,
      margin: 0.2,
      linearWaste: 0,
      labor: {
        minutesPerSheet: 10,
        minutesPerPart: 1,
        minutesPerJoineryOp: 1,
        minutesPerHole: 1,
        minutesPerHardwareItem: 2,
        assemblyMinutesPerCabinet: 30,
      },
      materialMarkup: 0.1,
      hardwareMarkup: 0.5,
      extras: [
        { id: 'x1', label: 'Installation', qty: 3, unit: 'h', unitCost: 50 },
        { id: 'x2', label: 'Delivery', qty: 1, unit: 'job', unitCost: 40.5 },
      ],
      taxRate: 0.1,
    })
    const { build, nest } = smallJob()
    const e = run(project, build, nest)

    // materials 97 (+10 % = 9.70), hardware 13 (+50 % = 6.50), labor 48
    expect(e.materialMarkupAmount).toBe(9.7)
    expect(e.hardwareMarkupAmount).toBe(6.5)
    expect(e.markupAmount).toBe(16.2)
    expect(e.extras).toEqual([
      { category: 'extra', refId: 'x1', description: 'Installation', qty: 3, unit: 'h', unitCost: 50, total: 150 },
      { category: 'extra', refId: 'x2', description: 'Delivery', qty: 1, unit: 'job', unitCost: 40.5, total: 40.5 },
    ])
    expect(e.extrasCost).toBe(190.5)
    // 97 + 13 + 48 + 190.5 + 16.2 = 364.7
    expect(e.subtotal).toBe(364.7)
    // 364.7 / 0.8 = 455.875 → 455.88
    expect(e.price).toBe(455.88)
    expect(e.marginAmount).toBe(91.18)
    expect(e.minimumChargeAdjustment).toBe(0)
    expect(e.taxRate).toBe(0.1)
    // 455.88 × 10 % = 45.588 → 45.59
    expect(e.tax).toBe(45.59)
    expect(e.total).toBe(501.47)
  })

  it('defaults the commercial parameters for a project saved without them', () => {
    const base = fixtureProject()
    const legacy: Project = {
      ...base,
      estimate: { currency: 'USD', shopRate: 60, margin: 0.2, linearWaste: 0, labor: base.estimate.labor },
    }
    const { build, nest } = smallJob()
    const e = run(legacy, build, nest)
    expect(e).toMatchObject({ extras: [], extrasCost: 0, markupAmount: 0, minimumChargeAdjustment: 0, taxRate: 0, tax: 0 })
    expect(e.subtotal).toBe(e.materialCost + e.hardwareCost + e.laborCost)
    expect(e.total).toBe(e.price)
  })

  it('raises the price to the minimum charge and taxes the raised price', () => {
    const { build, nest } = smallJob()
    const e = run(withSettings({ margin: 0, minimumCharge: 1000, taxRate: 0.2 }), build, nest)
    expect(e.price).toBe(1000)
    expect(toCents(e.minimumChargeAdjustment)).toBe(100_000 - toCents(e.subtotal))
    expect(e.marginAmount).toBe(0)
    expect(e.tax).toBe(200)
    expect(e.total).toBe(1200)
  })

  it('ignores a minimum charge below the computed price', () => {
    const { build, nest } = smallJob()
    const without = run(withSettings({ minimumCharge: 0 }), build, nest)
    const low = run(withSettings({ minimumCharge: 1 }), build, nest)
    expect(low.price).toBe(without.price)
    expect(low.minimumChargeAdjustment).toBe(0)
  })

  it('treats negative or non-finite commercial parameters as zero', () => {
    const { build, nest } = smallJob()
    const plain = run(fixtureProject(), build, nest)
    const e = run(
      withSettings({
        materialMarkup: -1,
        hardwareMarkup: Number.NaN,
        taxRate: -0.2,
        minimumCharge: Number.POSITIVE_INFINITY,
        extras: [{ id: 'x', label: 'Refund?', qty: -2, unit: 'pcs', unitCost: 10 }],
      }),
      build,
      nest,
    )
    expect(e.markupAmount).toBe(0)
    expect(e.extrasCost).toBe(0)
    expect(e.extras[0]).toMatchObject({ qty: 0, total: 0 })
    expect(e.tax).toBe(0)
    expect(e.minimumChargeAdjustment).toBe(0)
    expect(e.price).toBe(plain.price)
  })

  it('does not mutate its inputs', () => {
    const project = fixtureProject()
    const { build, nest } = smallJob()
    const bom = buildBom(project, build, nest)
    const before = structuredClone({ project, build, nest, bom })
    estimateCost(project, build, nest, bom)
    expect({ project, build, nest, bom }).toEqual(before)
  })
})

/** Random but deterministic job with awkward prices so rounding is exercised. */
function randomJob(seed: number): { project: Project; build: ProjectBuild; nest: NestResult } {
  const rnd = lcg(seed)
  const int = (n: number): number => Math.floor(rnd() * n)
  const base = fixtureProject()
  const project: Project = {
    ...base,
    materials: base.materials.map((m) =>
      m.kind === 'sheet' ? { ...m, costPerSheet: 10 + rnd() * 100 } : { ...m, costPerMetre: rnd() * 30 },
    ),
    hardware: base.hardware.map((h) => ({ ...h, unitCost: rnd() * 20 })),
    estimate: {
      ...base.estimate,
      shopRate: 20 + rnd() * 100,
      margin: rnd() * 0.6,
      linearWaste: rnd() * 0.3,
      materialMarkup: rnd() * 0.5,
      hardwareMarkup: rnd() * 0.5,
      taxRate: rnd() * 0.25,
      minimumCharge: rnd() < 0.3 ? rnd() * 5000 : 0,
      extras: Array.from({ length: int(4) }, (_, i) => ({ id: `x${i}`, label: `Extra ${i}`, qty: rnd() * 10, unit: 'h' as const, unitCost: rnd() * 90 })),
    },
  }
  const sheetIds = project.materials.filter((m) => m.kind === 'sheet').map((m) => m.id)
  const cabinetIds = ['cab_1', 'cab_2', 'cab_3'].slice(0, 1 + int(3))
  const parts: Part[] = Array.from({ length: 1 + int(30) }, (_, i) => {
    const linear = rnd() < 0.2
    const materialId = linear ? 'maple-19x63' : (sheetIds[int(sheetIds.length)] ?? 'ply-18')
    const ops = Array.from({ length: int(6) }, (_, j) => (rnd() < 0.5 ? dado(`o${j}`) : hole(`o${j}`, rnd() < 0.5 ? 'dowel' : 'shelf-pin')))
    return makePart({ id: `p${i}`, cabinetId: cabinetIds[int(cabinetIds.length)], materialId, length: 100 + rnd() * 2000, ops })
  })
  const hardware: HardwareUsage[] = Array.from({ length: int(8) }, () =>
    usage(project.hardware[int(project.hardware.length)]?.id ?? 'pin-5', 1 + int(10), cabinetIds[0]),
  )
  const sheetParts = parts.filter((p) => p.materialId !== 'maple-19x63')
  const nest = makeNest(
    sheetParts.map((p) => ({ materialId: p.materialId, partIds: [p.id] })),
    parts.filter((p) => p.materialId === 'maple-19x63').map((p) => p.id),
  )
  return { project, build: makeBuild(parts, hardware, cabinetIds), nest }
}

const sumCents = (values: number[]): number => values.reduce((acc, v) => acc + toCents(v), 0)

describe('estimate invariants', () => {
  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('totals equal the sum of their lines (seed %d)', (seed) => {
    const { project, build, nest } = randomJob(seed)
    const bom = buildBom(project, build, nest)
    const e = estimateCost(project, build, nest, bom)

    expect(toCents(e.materialCost)).toBe(sumCents(e.materials.map((l) => l.total)))
    expect(toCents(e.hardwareCost)).toBe(sumCents(e.hardware.map((l) => l.total)))
    expect(toCents(e.laborCost)).toBe(sumCents(e.labor.map((l) => l.cost)))
    expect(toCents(e.extrasCost)).toBe(sumCents(e.extras.map((l) => l.total)))
    expect(toCents(e.markupAmount)).toBe(toCents(e.materialMarkupAmount) + toCents(e.hardwareMarkupAmount))
    expect(toCents(e.subtotal)).toBe(
      toCents(e.materialCost) + toCents(e.hardwareCost) + toCents(e.laborCost) + toCents(e.extrasCost) + toCents(e.markupAmount),
    )
    expect(toCents(e.price)).toBe(toCents(e.subtotal) + toCents(e.marginAmount) + toCents(e.minimumChargeAdjustment))
    expect(toCents(e.total)).toBe(toCents(e.price) + toCents(e.tax))
    expect(toCents(e.price)).toBeGreaterThanOrEqual(toCents(project.estimate.minimumCharge ?? 0))
    expect(e.minimumChargeAdjustment).toBeGreaterThanOrEqual(0)
    expect(sumCents(bom.lines.map((l) => l.total))).toBe(toCents(e.materialCost) + toCents(e.hardwareCost))

    // Every money value is already rounded to cents.
    const money = [
      e.materialCost,
      e.hardwareCost,
      e.laborCost,
      e.extrasCost,
      e.materialMarkupAmount,
      e.hardwareMarkupAmount,
      e.markupAmount,
      e.subtotal,
      e.marginAmount,
      e.minimumChargeAdjustment,
      e.price,
      e.tax,
      e.total,
      ...bom.lines.map((l) => l.total),
      ...e.labor.map((l) => l.cost),
      ...e.extras.map((l) => l.total),
    ]
    expect(money.every((v) => toCents(v) / 100 === v)).toBe(true)

    // BOM sheet counts equal nest sheet counts.
    const sheetQty = bom.lines.filter((l) => l.category === 'sheet').reduce((acc, l) => acc + l.qty, 0)
    expect(sheetQty).toBe(nest.sheets.length)
    // One schedule row per part.
    expect(new Set(bom.parts.map((r) => r.partId))).toEqual(new Set(build.parts.map((p) => p.id)))
    expect(bom.parts).toHaveLength(build.parts.length)
  })
})
