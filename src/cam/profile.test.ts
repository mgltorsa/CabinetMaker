import { describe, expect, it } from 'vitest'
import type { Vec3 } from '@/core/types'
import { planProfile } from './profile'
import { makeContext, makeMachine, makePart, makeTools, placeAt } from './testing/fixtures'
import type { PlannedToolpath } from './types'

const R = 6.35 / 2

function signedArea(points: readonly Vec3[]): number {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length] ?? p
    return sum + (p.x * q.y - q.x * p.y)
  }, 0)
}

function profileOf(result: ReturnType<typeof planProfile>): PlannedToolpath {
  if (!result.toolpath) throw new Error(`no profile: ${result.warnings.map((w) => w.message).join('; ')}`)
  return result.toolpath
}

/** Number of tab windows in a pass: moves that rise in Z without moving in XY. */
function tabCount(pass: readonly Vec3[]): number {
  return pass.filter((p, i) => {
    const prev = pass[i - 1]
    return prev !== undefined && p.z > prev.z && p.x === prev.x && p.y === prev.y
  }).length
}

const noTabs = makeMachine({ tabs: { enabled: false, spacing: 400, width: 10, thickness: 3 } })

describe('planProfile without tabs', () => {
  const part = makePart({ length: 400, width: 300 })
  const ctx = makeContext(part, { machine: noTabs })

  it('runs clockwise around the part, offset by the tool radius', () => {
    const tp = profileOf(planProfile(ctx))
    expect(tp.kind).toBe('profile')
    expect(tp.phase).toBe('profile')
    expect(tp.tool.id).toBe('t1')
    expect(tp.id).toBe('ply-18#1:cab_1:side-left:profile')
    const first = tp.passes[0] ?? []
    expect(first).toHaveLength(5)
    expect(first[0]).toEqual({ x: 100 - R, y: 50 - R, z: first[0]?.z })
    const xs = first.map((p) => p.x)
    const ys = first.map((p) => p.y)
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([100 - R, 500 + R])
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([50 - R, 350 + R])
    expect(signedArea(first.slice(0, 4))).toBeLessThan(0)
  })

  it('steps down to thickness minus the onion skin', () => {
    const tp = profileOf(planProfile(ctx))
    expect(tp.passes.map((p) => p[0]?.z)).toEqual([-5.9, -11.8, -17.7])
  })

  it('reports an onion skin that leaves nothing to cut', () => {
    const machine = makeMachine({ tabs: { ...noTabs.tabs }, onionSkin: 18 })
    const result = planProfile(makeContext(part, { machine }))
    expect(result.toolpath).toBeNull()
    expect(result.warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/profile-skipped' })])
  })
})

describe('planProfile with tabs', () => {
  it('cuts through (thickness + throughCutExtra) and raises tabs on the final pass', () => {
    const part = makePart({ length: 400, width: 300 })
    const tp = profileOf(planProfile(makeContext(part)))
    const zs = tp.passes.map((pass) => Math.min(...pass.map((p) => p.z)))
    expect(zs).toEqual([-4.575, -9.15, -13.725, -18.3])
    const last = tp.passes[tp.passes.length - 1] ?? []
    expect(Math.max(...last.map((p) => p.z))).toBe(-15)
    expect(tabCount(last)).toBe(4)
    tp.passes.slice(0, -1).forEach((pass) => expect(tabCount(pass)).toBe(0))
  })

  it('makes each tab window tab width + tool diameter long', () => {
    const part = makePart({ length: 400, width: 300 })
    const tp = profileOf(planProfile(makeContext(part)))
    const last = tp.passes[tp.passes.length - 1] ?? []
    const raised = last.filter((p) => p.z === -15)
    expect(raised).toHaveLength(8)
    for (let i = 0; i < raised.length; i += 2) {
      const a = raised[i]
      const b = raised[i + 1]
      if (!a || !b) throw new Error('missing tab point')
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(10 + 6.35, 3)
    }
  })

  it('puts at least 2 tabs on sides longer than 2 × spacing', () => {
    const part = makePart({ length: 1000, width: 300 })
    const tp = profileOf(planProfile(makeContext(part, { placement: placeAt(part, 20, 20) })))
    const last = tp.passes[tp.passes.length - 1] ?? []
    expect(tabCount(last)).toBe(8)
  })

  it('also tabs earlier passes that go below the tab top', () => {
    const tools = makeTools().map((t) => (t.id === 't1' ? { ...t, stepDown: 3.05 } : t))
    const part = makePart({ length: 400, width: 300 })
    const tp = profileOf(planProfile(makeContext(part, { tools })))
    expect(tp.passes.map(tabCount)).toEqual([0, 0, 0, 0, 4, 4])
  })

  it('keeps 4 tabs on small parts when they fit', () => {
    const part = makePart({ length: 20, width: 20 })
    const result = planProfile(makeContext(part))
    const last = profileOf(result).passes.at(-1) ?? []
    expect(tabCount(last)).toBe(4)
    expect(result.warnings).toEqual([])
  })

  it('warns when a part is too small for tabs', () => {
    const part = makePart({ length: 10, width: 10 })
    const result = planProfile(makeContext(part))
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'cam/tabs-insufficient' })])
  })

  it('reports invalid tab settings and falls back to an onion skin', () => {
    const machine = makeMachine({ tabs: { enabled: true, spacing: 400, width: 10, thickness: 20 } })
    const part = makePart({ length: 400, width: 300 })
    const result = planProfile(makeContext(part, { machine }))
    expect(result.warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/tabs-invalid' })])
    expect(profileOf(result).passes.at(-1)?.[0]?.z).toBe(-17.7)
  })
})

describe('planProfile edge cases', () => {
  it('follows the rotated footprint', () => {
    const part = makePart({ length: 400, width: 300 })
    const tp = profileOf(planProfile(makeContext(part, { placement: placeAt(part, 100, 50, true), machine: noTabs })))
    const first = tp.passes[0] ?? []
    const xs = first.map((p) => p.x)
    const ys = first.map((p) => p.y)
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([100 - R, 400 + R])
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([50 - R, 450 + R])
    expect(signedArea(first.slice(0, 4))).toBeLessThan(0)
  })

  it('reports a part that cannot be profiled without a profile tool', () => {
    const tools = makeTools().filter((t) => t.id !== 't1')
    const result = planProfile(makeContext(makePart(), { tools }))
    expect(result.toolpath).toBeNull()
    expect(result.warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/profile-skipped' })])
  })

  it('warns when the profile is deeper than the flutes', () => {
    const tools = makeTools().map((t) => (t.id === 't1' ? { ...t, fluteLength: 12 } : t))
    const result = planProfile(makeContext(makePart(), { tools }))
    expect(result.warnings.map((w) => w.code)).toEqual(['cam/flute-length'])
  })
})
