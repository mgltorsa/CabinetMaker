import { describe, expect, it } from 'vitest'
import { defaultConstruction } from '@/core/defaults'
import type { Bay, BayKind, Cabinet, ConstructionMethod, Section } from '@/core/types'
import { build, testCabinet } from './testkit'
import { validateBuild } from './validate'

/** mulberry32: tiny deterministic PRNG so failures reproduce from the seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)] as T
}

function between(r: () => number, lo: number, hi: number): number {
  return Math.round(lo + r() * (hi - lo))
}

function randomBay(r: () => number, id: string): Bay {
  const kind: BayKind = pick(r, ['drawer', 'door', 'open'] as const)
  return {
    id,
    kind,
    height: r() < 0.3 ? between(r, 100, 400) : null,
    shelfCount: kind === 'drawer' ? 0 : between(r, 0, 3),
    doorCount: r() < 0.5 ? 1 : 2,
    hingeSide: r() < 0.5 ? 'left' : 'right',
  }
}

function randomConstruction(r: () => number): ConstructionMethod {
  const c = defaultConstruction()
  return {
    ...c,
    style: pick(r, ['frameless-overlay', 'frameless-inset', 'face-frame-overlay', 'face-frame-inset'] as const),
    joinery: pick(r, ['none', 'dowel', 'domino', 'dado'] as const),
    back: { ...c.back, construction: pick(r, ['captured', 'applied'] as const) },
    toeKick: { type: pick(r, ['none', 'panel', 'full'] as const), height: between(r, 60, 150), setback: between(r, 0, 100) },
    top: pick(r, ['full-top', 'stretchers'] as const),
    rearNailer: r() < 0.6,
    system32: r() < 0.7,
    drawer: { ...c.drawer, slideMount: pick(r, ['undermount', 'side-mount'] as const), joinery: pick(r, ['none', 'dowel', 'domino', 'dado'] as const) },
  }
}

function randomCabinet(seed: number): Cabinet {
  const r = rng(seed)
  const sections: Section[] = Array.from({ length: between(r, 1, 3) }, (_, si) => ({
    id: `s${si}`,
    width: r() < 0.25 ? between(r, 150, 400) : null,
    bays: Array.from({ length: between(r, 1, 4) }, (_, bi) => randomBay(r, `b${si}_${bi}`)),
  }))
  return {
    ...testCabinet({
      type: pick(r, ['base', 'wall', 'tall', 'custom'] as const),
      width: between(r, 300, 1200),
      height: between(r, 400, 2400),
      depth: between(r, 280, 700),
      floorHeight: r() < 0.2 ? between(r, 0, 1500) : 0,
      top: { kind: pick(r, ['none', 'finished', 'countertop'] as const), materialId: r() < 0.5 ? 'ply-18' : null, thickness: 18, overhangFront: between(r, 0, 40), overhangSides: between(r, 0, 20) },
    }),
    id: `rnd${seed}`,
    construction: randomConstruction(r),
    sections,
  }
}

describe('validation sweep over random-but-valid cabinets', () => {
  const SEEDS = Array.from({ length: 1000 }, (_, i) => i + 1)

  it.each(SEEDS)('seed %i builds a valid cabinet', (seed) => {
    const b = build(randomCabinet(seed))
    expect(b.warnings.filter((w) => w.code === 'engine-failure')).toEqual([])
    expect(b.parts.length).toBeGreaterThan(0)
    expect(validateBuild(b)).toEqual([])
  })
})

describe('performance', () => {
  it('builds a typical cabinet in well under 5 ms', () => {
    const cab = randomCabinet(42)
    for (let i = 0; i < 20; i++) build(cab)
    const runs = 200
    const t0 = performance.now()
    for (let i = 0; i < runs; i++) build(cab)
    expect((performance.now() - t0) / runs).toBeLessThan(5)
  })
})
