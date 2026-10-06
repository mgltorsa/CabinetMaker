import { describe, expect, it } from 'vitest'
import type { Vec3 } from '@/core/types'
import { ASSET_CATALOG, ASSET_CATEGORIES, getAssetDef, searchAssets } from './catalog'
import { hasPositiveDims, primitiveBounds } from './geometry'
import { resolveLook, ROLE_LOOK } from './materials'
import type { AssetDef, Primitive } from './types'

const EPS = 1e-6
const HEX = /^#[0-9a-f]{6}$/

/** Sizes every asset must fill correctly: its default, much smaller, much larger, skewed and tiny. */
function sizesFor(def: AssetDef): Vec3[] {
  const d = def.defaultSize
  return [
    d,
    { x: d.x * 0.25, y: d.y * 0.25, z: d.z * 0.25 },
    { x: d.x * 3, y: d.y * 3, z: d.z * 3 },
    { x: d.x * 2, y: d.y * 0.5, z: d.z },
    { x: d.x * 0.5, y: d.y * 2, z: d.z * 0.4 },
    { x: 10, y: 10, z: 10 },
  ]
}

function inside(p: Primitive, size: Vec3): boolean {
  const { min, max } = primitiveBounds(p)
  return (
    min[0] >= -size.x / 2 - EPS &&
    max[0] <= size.x / 2 + EPS &&
    min[1] >= -EPS &&
    max[1] <= size.y + EPS &&
    min[2] >= -size.z / 2 - EPS &&
    max[2] <= size.z / 2 + EPS
  )
}

const label = (def: AssetDef, size: Vec3): string => `${def.id} @ ${size.x}×${size.y}×${size.z}`

describe('asset catalog', () => {
  it('has around 25+ assets with unique ids in every category', () => {
    expect(ASSET_CATALOG.length).toBeGreaterThanOrEqual(25)
    expect(new Set(ASSET_CATALOG.map((a) => a.id)).size).toBe(ASSET_CATALOG.length)
    for (const c of ASSET_CATEGORIES) expect(ASSET_CATALOG.some((a) => a.category === c.id), c.id).toBe(true)
  })

  it('includes the core kitchen, room, light and decor pieces', () => {
    const ids = ASSET_CATALOG.map((a) => a.id)
    for (const id of ['fridge', 'range', 'cooktop', 'dishwasher', 'sink', 'range-hood', 'microwave', 'island', 'bar-stool']) expect(ids).toContain(id)
    for (const id of ['sofa', 'bed', 'dining-table', 'chair', 'rug', 'door', 'window', 'bookshelf', 'plant', 'tv']) expect(ids).toContain(id)
    for (const id of ['pendant', 'ceiling-light', 'downlight', 'floor-lamp', 'wall-sconce', 'led-strip']) expect(ids).toContain(id)
    for (const id of ['vase', 'books', 'picture-frame', 'bowl']) expect(ids).toContain(id)
  })

  it('gives every asset a positive default size, a hex colour and a name', () => {
    for (const def of ASSET_CATALOG) {
      expect(def.name.length, def.id).toBeGreaterThan(0)
      expect(def.defaultColor, def.id).toMatch(HEX)
      for (const v of [def.defaultSize.x, def.defaultSize.y, def.defaultSize.z]) expect(v, def.id).toBeGreaterThan(0)
      if (def.mount === 'wall') expect(def.defaultLift, def.id).toBeGreaterThanOrEqual(0)
    }
  })

  it.each(ASSET_CATALOG.map((d) => [d.id, d] as const))('%s: primitives have positive dims and fit inside the size box', (_, def) => {
    for (const size of sizesFor(def)) {
      const prims = def.build(size)
      expect(prims.length, label(def, size)).toBeGreaterThan(0)
      for (const [i, p] of prims.entries()) {
        expect(hasPositiveDims(p), `${label(def, size)} #${i} ${p.kind} dims`).toBe(true)
        expect(inside(p, size), `${label(def, size)} #${i} ${p.kind} ${JSON.stringify(primitiveBounds(p))}`).toBe(true)
        if (p.color) expect(p.color).toMatch(HEX)
      }
    }
  })

  it('reaches the edges of its size box (the shape stretches with the size)', () => {
    for (const def of ASSET_CATALOG) {
      const size = def.defaultSize
      const all = def.build(size).map(primitiveBounds)
      const maxY = Math.max(...all.map((b) => b.max[1]))
      const minY = Math.min(...all.map((b) => b.min[1]))
      const maxX = Math.max(...all.map((b) => b.max[0]))
      expect(maxY, def.id).toBeCloseTo(size.y, 3)
      expect(minY, def.id).toBeLessThan(size.y * 0.35)
      expect(maxX, def.id).toBeGreaterThan(size.x * 0.4)
    }
  })

  it('places every light inside its asset and gives it sane parameters', () => {
    const lights = ASSET_CATALOG.filter((a) => a.light)
    expect(lights.map((a) => a.id).sort()).toEqual(['ceiling-light', 'downlight', 'floor-lamp', 'led-strip', 'pendant', 'wall-sconce'])
    for (const def of lights) {
      expect(def.category, def.id).toBe('lights')
      expect(def.castsShadow, def.id).toBe(false) // the light must not be trapped in its own housing
      for (const size of sizesFor(def)) {
        const l = def.light!(size)
        const [x, y, z] = l.position
        expect(Math.abs(x) <= size.x / 2 + EPS && y >= -EPS && y <= size.y + EPS && Math.abs(z) <= size.z / 2 + EPS, label(def, size)).toBe(true)
        expect(l.intensity).toBeGreaterThan(0)
        expect(l.distance).toBeGreaterThanOrEqual(0)
        expect(l.color).toMatch(HEX)
        if (l.kind === 'spot') expect(l.angle).toBeGreaterThan(0)
        if (l.kind === 'rect') {
          expect(l.width).toBeGreaterThan(0)
          expect(l.depth).toBeGreaterThan(0)
          expect(l.width! <= size.x + EPS && l.depth! <= size.z + EPS).toBe(true)
        }
      }
      expect(def.build(def.defaultSize).some((p) => p.role === 'emitter'), def.id).toBe(true)
    }
  })

  it('is deterministic', () => {
    for (const def of ASSET_CATALOG) expect(def.build(def.defaultSize)).toEqual(def.build(def.defaultSize))
  })
})

describe('getAssetDef / searchAssets', () => {
  it('finds assets by id', () => {
    expect(getAssetDef('fridge')?.name).toBe('Fridge')
    expect(getAssetDef('nope')).toBeUndefined()
  })

  it('filters by category and by words in the name or keywords', () => {
    expect(searchAssets('', 'lights').every((a) => a.category === 'lights')).toBe(true)
    expect(searchAssets('', 'all')).toHaveLength(ASSET_CATALOG.length)
    expect(searchAssets('fridge', 'all').map((a) => a.id)).toEqual(['fridge'])
    expect(searchAssets('REFRIGERATOR', 'all').map((a) => a.id)).toEqual(['fridge'])
    expect(searchAssets('lamp', 'all').map((a) => a.id)).toContain('floor-lamp')
    expect(searchAssets('lamp', 'kitchen')).toEqual([])
    expect(searchAssets('  ', 'decor').length).toBeGreaterThan(0)
  })
})

describe('resolveLook', () => {
  it('uses the asset colour for body, the fixed colour when set, else the role look', () => {
    expect(resolveLook({ role: 'body' }, '#123456').color).toBe('#123456')
    expect(resolveLook({ role: 'metal' }, '#123456')).toEqual(ROLE_LOOK.metal)
    expect(resolveLook({ role: 'wood', color: '#aa0000' }, '#123456').color).toBe('#aa0000')
  })
})
