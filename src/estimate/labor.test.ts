import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { EstimateSettings, LaborLine } from '@/core/types'
import { buildLabor, countOps } from './labor'
import { dado, hole, makeBuild, makeNest, makePart, mortise, usage } from './test-fixtures'

function settings(overrides: Partial<EstimateSettings['labor']> = {}, shopRate = 60): EstimateSettings {
  const base = fixtureProject().estimate
  return { ...base, shopRate, labor: { ...base.labor, ...overrides } }
}

function byBucket(lines: LaborLine[]): Record<LaborLine['bucket'], LaborLine> {
  return Object.fromEntries(lines.map((l) => [l.bucket, l])) as Record<LaborLine['bucket'], LaborLine>
}

describe('countOps', () => {
  it('splits ops into joinery and drilling', () => {
    const parts = [
      makePart({ id: 'a', ops: [dado('1'), mortise('2'), hole('3', 'dowel'), hole('4', 'domino')] }),
      makePart({ id: 'b', ops: [hole('5', 'shelf-pin'), hole('6', 'hinge-cup'), hole('7', 'system32'), dado('8')] }),
    ]
    expect(countOps(parts)).toEqual({ joinery: 5, drilling: 3 })
  })

  it('returns zeros for no parts', () => {
    expect(countOps([])).toEqual({ joinery: 0, drilling: 0 })
  })
})

describe('buildLabor', () => {
  const parts = [
    makePart({ id: 'p1', ops: [dado('d1'), hole('h1', 'dowel'), hole('h2', 'shelf-pin'), hole('h3', 'shelf-pin')] }),
    makePart({ id: 'p2', ops: [mortise('m1')] }),
    makePart({ id: 'p3' }),
    makePart({ id: 'lin', materialId: 'maple-19x63' }),
  ]
  const build = makeBuild(parts, [usage('pin-5', 8), usage('blum-cliptop-110', 2)])
  const nest = makeNest([{ materialId: 'ply-18', partIds: ['p1', 'p2'] }, { materialId: 'ply-18', partIds: ['p3'] }], ['lin'])

  it('computes minutes per bucket from the shop settings', () => {
    const s = settings({
      minutesPerSheet: 10,
      minutesPerPart: 2,
      minutesPerJoineryOp: 1.5,
      minutesPerHole: 0.25,
      minutesPerHardwareItem: 3,
      assemblyMinutesPerCabinet: 45,
    })
    const labor = byBucket(buildLabor(s, build, nest))
    // cutting: 2 sheets × 10 + (3 nested + 1 linear) × 2 = 28
    expect(labor.cutting).toEqual({ bucket: 'cutting', minutes: 28, cost: 28 })
    // joinery: dado + dowel + mortise = 3 × 1.5 = 4.5
    expect(labor.joinery).toEqual({ bucket: 'joinery', minutes: 4.5, cost: 4.5 })
    // drilling: 2 shelf-pin holes × 0.25 = 0.5
    expect(labor.drilling).toEqual({ bucket: 'drilling', minutes: 0.5, cost: 0.5 })
    // hardware: 10 items × 3 = 30
    expect(labor.hardware).toEqual({ bucket: 'hardware', minutes: 30, cost: 30 })
    // assembly: 1 cabinet × 45
    expect(labor.assembly).toEqual({ bucket: 'assembly', minutes: 45, cost: 45 })
  })

  it('always returns the five buckets in a fixed order', () => {
    const lines = buildLabor(settings(), makeBuild([]), makeNest([]))
    expect(lines.map((l) => l.bucket)).toEqual(['cutting', 'joinery', 'drilling', 'hardware', 'assembly'])
    expect(lines.every((l) => l.minutes === 0 && l.cost === 0)).toBe(true)
  })

  it('prices minutes at the shop rate and rounds cost to cents', () => {
    const s = settings({ minutesPerSheet: 7 }, 65)
    const cutting = buildLabor(s, makeBuild([]), makeNest([{ materialId: 'ply-18', partIds: [] }]))[0]
    // 7 / 60 × 65 = 7.58333…
    expect(cutting).toEqual({ bucket: 'cutting', minutes: 7, cost: 7.58 })
  })

  it('clamps negative or non-finite settings to zero', () => {
    const s = settings({ minutesPerSheet: -10, minutesPerPart: Number.NaN }, -65)
    const lines = buildLabor(s, build, nest)
    expect(lines.every((l) => l.minutes >= 0 && l.cost === 0)).toBe(true)
    expect(lines[0]?.minutes).toBe(0)
  })

  it('ignores non-positive hardware quantities', () => {
    const b = makeBuild([], [usage('pin-5', -4), usage('pin-5', Number.NaN), usage('pin-5', 2)])
    const hardware = byBucket(buildLabor(settings({ minutesPerHardwareItem: 1 }), b, makeNest([]))).hardware
    expect(hardware.minutes).toBe(2)
  })
})
