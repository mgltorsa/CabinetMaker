import { describe, expect, it } from 'vitest'
import type { PlacedAsset } from '@/core/types'
import { lightPlan, MAX_RENDERED_LIGHTS, MAX_SHADOW_LIGHTS } from './lightPlan'

const light = (id: string, assetId: string, over: Partial<PlacedAsset> = {}): PlacedAsset => ({
  id,
  assetId,
  name: id,
  position: { x: 0, y: 1600, z: 0 },
  rotationYDeg: 0,
  size: { x: 360, y: 800, z: 360 },
  visible: true,
  light: { on: true, intensity: 2, color: '#ff0000' },
  ...over,
})

describe('lightPlan', () => {
  it('lights only visible, switched-on light assets with a positive intensity', () => {
    const plan = lightPlan([
      light('a', 'pendant'),
      light('off', 'pendant', { light: { on: false, intensity: 1, color: '#ffffff' } }),
      light('dim', 'pendant', { light: { on: true, intensity: 0, color: '#ffffff' } }),
      light('hidden', 'pendant', { visible: false }),
      light('fridge', 'fridge'),
      light('unknown', 'nope'),
    ])
    expect([...plan.keys()]).toEqual(['a'])
  })

  it('scales the catalog intensity and uses the asset light colour, sized to the asset', () => {
    const plan = lightPlan([light('a', 'pendant'), light('s', 'led-strip', { size: { x: 1000, y: 12, z: 24 } })])
    const a = plan.get('a')!
    expect(a.source.kind).toBe('point')
    expect(a.source.intensity).toBeCloseTo(2 * 2.2, 9)
    expect(a.source.color).toBe('#ff0000')
    expect(plan.get('s')!.source.width).toBeCloseTo(950, 9)
  })

  it(`renders at most ${MAX_RENDERED_LIGHTS} lights and lets only ${MAX_SHADOW_LIGHTS} point / spot lights cast shadows`, () => {
    const assets = [light('strip', 'led-strip'), ...Array.from({ length: 12 }, (_, i) => light(`p${i}`, i % 2 ? 'pendant' : 'downlight'))]
    const plan = lightPlan(assets)
    expect(plan.size).toBe(MAX_RENDERED_LIGHTS)
    expect(plan.get('strip')!.castShadow).toBe(false) // rect lights cannot cast shadows
    expect([...plan.values()].filter((l) => l.castShadow).map((l) => l.assetId)).toEqual(['p0', 'p1'])
  })
})
