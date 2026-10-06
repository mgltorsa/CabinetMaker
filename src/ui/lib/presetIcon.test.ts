import { describe, expect, it } from 'vitest'
import { PRESETS } from '@/engine/presets'
import { presetIcon } from './presetIcon'

describe('presetIcon', () => {
  it.each(PRESETS.map((p) => p.type))('draws %s fronts inside its outline', (type) => {
    const icon = presetIcon(type)
    for (const f of icon.fronts) {
      expect(f.x).toBeGreaterThanOrEqual(-0.5)
      expect(f.y).toBeGreaterThanOrEqual(-0.5)
      expect(f.x + f.w).toBeLessThanOrEqual(icon.width + 0.5)
      expect(f.y + f.h).toBeLessThanOrEqual(icon.height + 0.5)
    }
  })

  it('draws the wardrobe rod as a line inside the outline, under its upper shelf', () => {
    const icon = presetIcon('wardrobe')
    expect(icon.rods).toHaveLength(1)
    const [rod] = icon.rods
    expect(rod!.x1).toBeGreaterThan(0)
    expect(rod!.x2).toBeLessThan(icon.width)
    expect(rod!.x2 - rod!.x1).toBeGreaterThan(icon.width * 0.8)
    expect(rod!.y).toBeGreaterThan(0)
    expect(rod!.y).toBeLessThan(icon.height * 0.3)
  })

  it('draws no rod for presets without one', () => {
    expect(presetIcon('tall').rods).toEqual([])
  })

  it('gives the wall cabinet its two doors', () => {
    expect(presetIcon('wall').fronts).toHaveLength(2)
  })
})
