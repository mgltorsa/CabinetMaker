/**
 * Test helpers for the nest module. Builds `Part` / `Material` fixtures
 * directly so nest tests never depend on the construction engine.
 */
import type { Grain, LinearMaterial, Mm, NestSettings, Part, SheetMaterial } from '@/core/types'

export interface PartFixtureOptions {
  materialId?: string
  grain?: Grain
  thickness?: Mm
}

export function makePart(id: string, length: Mm, width: Mm, options: PartFixtureOptions = {}): Part {
  const thickness = options.thickness ?? 18
  return {
    id,
    cabinetId: 'cab_test',
    name: `Part ${id}`,
    group: 'carcass',
    role: id,
    length,
    width,
    thickness,
    materialId: options.materialId ?? 'sheet',
    grain: options.grain ?? 'none',
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: length, y: width, z: thickness } },
    axes: { length: 'x', width: 'y', thickness: 'z' },
    ops: [],
  }
}

export function makeSheetMaterial(overrides: Partial<Omit<SheetMaterial, 'kind'>> = {}): SheetMaterial {
  return {
    kind: 'sheet',
    id: 'sheet',
    name: 'Test sheet',
    thickness: 18,
    sheetLength: 2440,
    sheetWidth: 1220,
    grained: false,
    costPerSheet: 50,
    ...overrides,
  }
}

export function makeLinearMaterial(overrides: Partial<Omit<LinearMaterial, 'kind'>> = {}): LinearMaterial {
  return {
    kind: 'linear',
    id: 'linear',
    name: 'Test linear stock',
    thickness: 19,
    width: 63,
    stockLength: 2440,
    costPerMetre: 10,
    ...overrides,
  }
}

export function makeSettings(overrides: Partial<NestSettings> = {}): NestSettings {
  return { kerf: 0, edgeTrim: 0, partSpacing: 0, ignoreGrain: false, ...overrides }
}

/** Mulberry32: tiny seeded PRNG returning floats in [0, 1). Deterministic per seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pick<T>(rng: () => number, values: readonly T[]): T {
  const value = values[Math.floor(rng() * values.length)]
  if (value === undefined) throw new Error('pick() needs a non-empty list')
  return value
}

export interface RandomPartsOptions {
  count: number
  materialIds: readonly string[]
  minSide?: Mm
  maxLength?: Mm
  maxWidth?: Mm
}

/** Random cabinet-like parts with random grain, ids `p001`, `p002`, ... */
export function randomParts(rng: () => number, options: RandomPartsOptions): Part[] {
  const minSide = options.minSide ?? 40
  const maxLength = options.maxLength ?? 1300
  const maxWidth = options.maxWidth ?? 800
  const grains: readonly Grain[] = ['length', 'width', 'none']
  return Array.from({ length: options.count }, (_, i) => {
    const length = randomInt(rng, minSide, maxLength)
    const width = randomInt(rng, minSide, Math.min(maxWidth, length))
    return makePart(`p${String(i + 1).padStart(3, '0')}`, length, width, {
      materialId: pick(rng, options.materialIds),
      grain: pick(rng, grains),
    })
  })
}
