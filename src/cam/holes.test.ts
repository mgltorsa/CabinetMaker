import { describe, expect, it } from 'vitest'
import type { Vec3 } from '@/core/types'
import { MAX_HELIX_ANGLE_DEG } from './constants'
import { planHole } from './holes'
import { planOp } from './ops'
import { hole, makeContext, makeMachine, makePart, makeSheet, makeTools, placeAt } from './testing/fixtures'
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

  it('warns when a hole is deeper than the flutes', () => {
    const tools = makeTools().map((t) => (t.id === 't3' ? { ...t, fluteLength: 10 } : t))
    const plan = planHole(hole('h1', 37, 50, 5, 12), makeContext(part, { tools }))
    expect(plan.status).toBe('machined')
    expect(plan.warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/flute-length' })])
  })
})

describe('planHole: through holes', () => {
  const part = makePart()
  const ctx = makeContext(part)
  const minZ = (tp: PlannedToolpath): number => Math.min(...tp.passes.flat().map((p) => p.z))

  it('drills a hole as deep as the stock through by throughCutExtra', () => {
    const plan = planHole(hole('h', 37, 50, 5, 18), ctx)
    expect(minZ(machined(plan))).toBe(-18.3)
    expect(plan.warnings).toEqual([])
  })

  it('pockets a through hole with an end mill through by throughCutExtra', () => {
    const plan = planHole(hole('h', 100, 100, 20, 18), ctx)
    expect(machined(plan).kind).toBe('pocket')
    expect(minZ(machined(plan))).toBe(-18.3)
  })

  it('treats a hole deeper than the stock as through, with a warning', () => {
    const plan = planHole(hole('h', 37, 50, 5, 25), ctx)
    expect(minZ(machined(plan))).toBe(-18.3)
    expect(plan.warnings).toEqual([expect.objectContaining({ level: 'warn', code: 'cam/deeper-than-stock' })])
  })

  it('ignores a negative throughCutExtra (reported by the machine checks)', () => {
    const plan = planHole(hole('h', 37, 50, 5, 18), makeContext(part, { machine: makeMachine({ throughCutExtra: -1 }) }))
    expect(minZ(machined(plan))).toBe(-18)
  })

  it('checks the flutes against the through depth', () => {
    const tools = makeTools().map((t) => (t.id === 't3' ? { ...t, fluteLength: 18.1 } : t))
    const plan = planHole(hole('h', 37, 50, 5, 18), makeContext(part, { tools }))
    expect(plan.warnings.map((w) => w.code)).toEqual(['cam/flute-length'])
  })

  it('keeps the hole depth when the stock thickness is invalid', () => {
    const nan = makeContext(part, { sheet: makeSheet([placeAt(part, 100, 50)], { thickness: Number.NaN }) })
    expect(minZ(machined(planHole(hole('h', 37, 50, 5, 12), nan)))).toBe(-12)
  })

  it('leaves blind holes at their depth', () => {
    expect(minZ(machined(planHole(hole('h', 37, 50, 5, 17.9), ctx)))).toBe(-17.9)
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

  it(`ramps into each level no steeper than ${MAX_HELIX_ANGLE_DEG}°, adding helix turns as needed`, () => {
    const limit = Math.tan((MAX_HELIX_ANGLE_DEG * Math.PI) / 180) + 1e-3
    for (const diameter of [35, 12, 8]) {
      const tp = machined(planHole(hole('h', 100, 100, diameter, 13), ctx))
      const descending = tp.passes.flatMap((pass) =>
        pass.slice(1).flatMap((p, i) => {
          const prev = pass[i]
          if (!prev || p.z >= prev.z) return []
          return [{ dz: prev.z - p.z, run: Math.hypot(p.x - prev.x, p.y - prev.y) }]
        }),
      )
      expect(descending.length).toBeGreaterThan(0)
      descending.forEach(({ dz, run }) => expect(dz / run).toBeLessThanOrEqual(limit))
    }
  })

  it('plunges straight down when a helix would need too many turns', () => {
    const tp = machined(planHole(hole('h', 100, 100, 6.5, 10), ctx))
    const first = tp.passes[0] ?? []
    expect(first[0]?.z).toBe(0)
    expect(first[1]).toEqual({ x: first[0]?.x, y: first[0]?.y, z: -5 })
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
