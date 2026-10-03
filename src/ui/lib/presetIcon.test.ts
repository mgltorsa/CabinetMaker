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

  it('gives the wall cabinet its two doors', () => {
    expect(presetIcon('wall').fronts).toHaveLength(2)
  })
})
