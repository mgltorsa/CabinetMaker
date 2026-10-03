import { describe, expect, it } from 'vitest'
import { planDado, planMortise } from './grooves'
import { dado, makeContext, makePart, makeTools, mortise, placeAt } from './testing/fixtures'
import type { OpPlan, PlannedToolpath } from './types'

function machined(plan: OpPlan): PlannedToolpath {
  if (plan.status !== 'machined') throw new Error(`expected machined, got manual: ${plan.reason}`)
  return plan.toolpath
}

const R = 4.76 / 2

describe('planDado', () => {
  const part = makePart({ length: 400, width: 300 })
  const ctx = makeContext(part, { placement: placeAt(part, 0, 0) })

  it('cuts a tool-width through dado edge to edge in stepDown passes', () => {
    const tp = machined(planDado(dado('d1', [100, 0], [100, 300], 4.76, 8), ctx))
    expect(tp.kind).toBe('dado')
    expect(tp.phase).toBe('groove')
    expect(tp.tool.id).toBe('t2')
    expect(tp.passes).toEqual([
      [
        { x: 100, y: 0, z: -4 },
        { x: 100, y: 300, z: -4 },
      ],
      [
        { x: 100, y: 0, z: -8 },
        { x: 100, y: 300, z: -8 },
      ],
    ])
  })

  it('stops a stopped end one tool radius short (radius compensation)', () => {
    const tp = machined(planDado(dado('d1', [100, 0], [100, 250], 4.76, 4), ctx))
    expect(tp.passes[0]).toEqual([
      { x: 100, y: 0, z: -4 },
      { x: 100, y: 250 - 2.38, z: -4 },
    ])
  })

  it('stops both ends inside the part', () => {
    const tp = machined(planDado(dado('d1', [50, 20], [350, 20], 4.76, 4), ctx))
    expect(tp.passes[0]).toEqual([
      { x: 50 + R, y: 20, z: -4 },
      { x: 350 - R, y: 20, z: -4 },
    ])
  })

  it('treats a groove along an edge as stopped where it ends inside the part', () => {
    const tp = machined(planDado(dado('d1', [0, 5], [200, 5], 4.76, 4), ctx))
    expect(tp.passes[0]).toEqual([
      { x: 0, y: 5, z: -4 },
      { x: 200 - R, y: 5, z: -4 },
    ])
  })

  it('widens with parallel passes overlapping ≥ 10 %', () => {
    const tp = machined(planDado(dado('d1', [0, 150], [400, 150], 18, 4), ctx))
    const ys = tp.passes.map((p) => p[0]?.y ?? 0)
    expect(Math.min(...ys)).toBeCloseTo(150 - (18 - 4.76) / 2, 3)
    expect(Math.max(...ys)).toBeCloseTo(150 + (18 - 4.76) / 2, 3)
    const sorted = [...ys].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      expect((sorted[i] ?? 0) - (sorted[i - 1] ?? 0)).toBeLessThanOrEqual(4.76 * 0.9 + 1e-3)
    }
  })

  it('maps to sheet space for rotated parts', () => {
    const rotated = makeContext(part, { placement: placeAt(part, 100, 50, true) })
    const tp = machined(planDado(dado('d1', [100, 0], [100, 300], 4.76, 4), rotated))
    // panel (100, 0) -> (100 + 300 - 0, 50 + 100); panel (100, 300) -> (100, 150)
    expect(tp.passes[0]).toEqual([
      { x: 400, y: 150, z: -4 },
      { x: 100, y: 150, z: -4 },
    ])
  })

  it('reports dados narrower than the tool', () => {
    const plan = planDado(dado('d1', [100, 0], [100, 300], 3, 4), ctx)
    expect(plan).toMatchObject({ status: 'manual' })
    if (plan.status === 'manual') expect(plan.reason).toMatch(/narrower/)
  })

  it('reports stopped dados shorter than the tool', () => {
    expect(planDado(dado('d1', [100, 100], [102, 100], 4.76, 4), ctx)).toMatchObject({ status: 'manual' })
  })

  it('reports zero-length dados', () => {
    expect(planDado(dado('d1', [100, 100], [100, 100], 4.76, 4), ctx)).toMatchObject({ status: 'manual' })
  })

  it('reports a missing dado tool', () => {
    const tools = makeTools().filter((t) => t.id !== 't2')
    const plan = planDado(dado('d1', [100, 0], [100, 300], 6.35, 4), makeContext(part, { tools }))
    expect(plan).toMatchObject({ status: 'manual' })
  })

  it('never grooves with a drill, even when handed one as the dado tool', () => {
    const drill = ctx.tools.drill
    const plan = planDado(dado('d1', [100, 0], [100, 300], 6.35, 4), { ...ctx, tools: { ...ctx.tools, dado: drill } })
    expect(plan).toMatchObject({ status: 'manual', reason: expect.stringMatching(/T3 is a drill/) })
  })

  it('warns when deeper than the flutes', () => {
    const plan = planDado(dado('d1', [100, 0], [100, 300], 4.76, 17), ctx)
    expect(plan.warnings.map((w) => w.code)).toEqual(['cam/flute-length'])
  })
})

describe('planMortise', () => {
  const part = makePart({ length: 400, width: 300 })
  const ctx = makeContext(part, { placement: placeAt(part, 0, 0) })

  it('pockets a Domino mortise with both ends stopped', () => {
    const tp = machined(planMortise(mortise('m1', 200, 100, 30, 5, 12, 'x'), ctx))
    expect(tp.kind).toBe('pocket')
    const xs = tp.passes.flat().map((p) => p.x)
    const ys = tp.passes.flat().map((p) => p.y)
    expect(Math.min(...xs)).toBeCloseTo(185 + R, 3)
    expect(Math.max(...xs)).toBeCloseTo(215 - R, 3)
    expect(Math.min(...ys)).toBeCloseTo(100 - (5 - 4.76) / 2, 3)
    expect(Math.min(...tp.passes.flat().map((p) => p.z))).toBe(-12)
  })

  it('runs along y for axis y', () => {
    const tp = machined(planMortise(mortise('m1', 200, 100, 30, 4.76, 4, 'y'), ctx))
    expect(tp.passes[0]).toEqual([
      { x: 200, y: 85 + R, z: -4 },
      { x: 200, y: 115 - R, z: -4 },
    ])
  })
})
