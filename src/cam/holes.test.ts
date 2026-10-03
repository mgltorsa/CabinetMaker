import { describe, expect, it } from 'vitest'
import type { Vec3 } from '@/core/types'
import { planHole } from './holes'
import { planOp } from './ops'
import { hole, makeContext, makePart, makeTools } from './testing/fixtures'
import type { OpPlan, PlannedToolpath } from './types'

function machined(plan: OpPlan): PlannedToolpath {
  if (plan.status !== 'machined') throw new Error(`expected machined, got manual: ${plan.reason}`)
  return plan.toolpath
}

function signedArea(points: readonly Vec3[]): number {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length] ?? p
    return sum + (p.x * q.y - q.x * p.y)
  }, 0)
}

describe('planHole: drilling', () => {
  const part = makePart()
  const ctx = makeContext(part)

  it('pecks a drill-sized hole by the drill stepDown, in sheet space', () => {
    const tp = machined(planHole(hole('h1', 37, 50, 5, 12), ctx))
    expect(tp.kind).toBe('drill')
    expect(tp.phase).toBe('drill')
    expect(tp.tool.id).toBe('t3')
    expect(tp.id).toBe('ply-18#1:cab_1:side-left:h1')
    expect(tp.passes).toEqual([
      [
        { x: 137, y: 100, z: 0 },
        { x: 137, y: 100, z: -4 },
      ],
      [
        { x: 137, y: 100, z: -4 },
        { x: 137, y: 100, z: -8 },
      ],
      [
        { x: 137, y: 100, z: -8 },
        { x: 137, y: 100, z: -12 },
      ],
    ])
  })

  it('drills holes within ±0.2 mm of the drill diameter', () => {
    expect(machined(planHole(hole('h', 37, 50, 5.2, 5), ctx)).kind).toBe('drill')
    expect(machined(planHole(hole('h', 37, 50, 4.8, 5), ctx)).kind).toBe('drill')
  })

  it('warns when a hole is deeper than the flutes and the stock', () => {
    const plan = planHole(hole('h1', 37, 50, 5, 25), ctx)
    expect(plan.status).toBe('machined')
    expect(plan.warnings.map((w) => w.code)).toEqual(['cam/flute-length', 'cam/deeper-than-stock'])
  })
})

describe('planHole: circular pockets', () => {
  const part = makePart()
  const ctx = makeContext(part)

  it('pockets a 35 mm hinge cup with the largest end mill that fits', () => {
    const tp = machined(planHole(hole('cup', 100, 100, 35, 13), ctx))
    expect(tp.kind).toBe('pocket')
    expect(tp.phase).toBe('groove')
    expect(tp.tool.id).toBe('t1')
    expect(tp.passes).toHaveLength(3) // 13 mm at 6 mm stepDown
    const centre = { x: 200, y: 150 }
    const toolR = 6.35 / 2
    const radii = tp.passes.flat().map((p) => Math.hypot(p.x - centre.x, p.y - centre.y))
    expect(Math.max(...radii)).toBeCloseTo(17.5 - toolR, 3)
    expect(Math.min(...tp.passes.flat().map((p) => p.z))).toBe(-13)
    expect(tp.passes[0]?.[0]?.z).toBe(0)
  })

  it('steps down by stepDown with a helical entry', () => {
    const tp = machined(planHole(hole('cup', 100, 100, 35, 13), ctx))
    tp.passes.forEach((pass) => {
      const zs = pass.map((p) => p.z)
      for (let i = 1; i < zs.length; i++) {
        const prev = zs[i - 1] ?? 0
        const z = zs[i] ?? 0
        expect(z).toBeLessThanOrEqual(prev)
        expect(prev - z).toBeLessThanOrEqual(6)
      }
      expect((zs[0] ?? 0) - (zs[zs.length - 1] ?? 0)).toBeLessThanOrEqual(6 + 1e-9)
    })
  })

  it('cuts rings counter-clockwise (climb with M3) and within the chord error', () => {
    const tp = machined(planHole(hole('cup', 100, 100, 35, 6), ctx))
    const pass = tp.passes[0] ?? []
    const outer = pass.slice(-40)
    expect(signedArea(outer)).toBeGreaterThan(0)
    for (let i = 1; i < pass.length; i++) {
      const a = pass[i - 1]
      const b = pass[i]
      if (!a || !b) continue
      const ra = Math.hypot(a.x - 200, a.y - 150)
      const rb = Math.hypot(b.x - 200, b.y - 150)
      if (Math.abs(ra - rb) > 1e-3) continue
      const chord = Math.hypot(a.x - b.x, a.y - b.y)
      const sagitta = ra - Math.sqrt(Math.max(0, ra * ra - (chord / 2) ** 2))
      expect(sagitta).toBeLessThanOrEqual(0.05 + 1e-3)
    }
  })

  it('spaces rings so the whole hole is cleared with ≥ 10 % overlap', () => {
    const tp = machined(planHole(hole('cup', 100, 100, 35, 6), ctx))
    const radii = [
      ...new Set(tp.passes.flat().map((p) => Math.round(Math.hypot(p.x - 200, p.y - 150) * 100) / 100)),
    ].sort((a, b) => a - b)
    const toolD = 6.35
    expect(radii[0]).toBeLessThanOrEqual(toolD / 2 + 1e-3)
    for (let i = 1; i < radii.length; i++) {
      expect((radii[i] ?? 0) - (radii[i - 1] ?? 0)).toBeLessThanOrEqual(toolD * 0.9 + 1e-3)
    }
  })

  it('plunges straight when the hole matches an end mill diameter', () => {
    const tp = machined(planHole(hole('h', 100, 100, 6.35, 10), ctx))
    expect(tp.kind).toBe('pocket')
    expect(tp.passes.flat().every((p) => p.x === 200 && p.y === 150)).toBe(true)
  })

  it('falls back to an end mill when the drill is missing', () => {
    const tools = makeTools().filter((t) => t.id !== 't3')
    const tp = machined(planHole(hole('h', 37, 50, 5, 10), makeContext(part, { tools })))
    expect(tp.kind).toBe('pocket')
    expect(tp.tool.id).toBe('t2')
  })
})

describe('planHole: manual ops', () => {
  const part = makePart()
  const ctx = makeContext(part)

  it('reports holes smaller than every tool', () => {
    const plan = planHole(hole('tiny', 37, 50, 3, 10), ctx)
    expect(plan).toMatchObject({ status: 'manual' })
    if (plan.status === 'manual') expect(plan.reason).toMatch(/3 mm/)
  })

  it('reports holes that leave the part', () => {
    expect(planOp(hole('edge', 1, 50, 5, 10), ctx)).toMatchObject({ status: 'manual' })
  })

  it('reports holes with invalid numbers', () => {
    const plan = planOp(hole('bad', 37, 50, Number.NaN, 10), ctx)
    expect(plan).toMatchObject({ status: 'manual' })
    if (plan.status === 'manual') expect(plan.reason).toMatch(/diameter/)
  })
})
