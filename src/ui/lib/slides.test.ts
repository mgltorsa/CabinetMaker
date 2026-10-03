import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE } from '@/core/defaults'
import type { HardwareItem } from '@/core/types'
import { hasSideMountSlides, slideForMount, slidesForMount } from './slides'

const undermount = DEFAULT_HARDWARE.filter((h) => h.kind === 'slide' && h.props.mount === 0)
const side: HardwareItem = { id: 's-400', kind: 'slide', name: 'Side 400', manufacturer: 'G', sku: 'S400', unitCost: 1, props: { length: 400, mount: 1 } }
const unknownMount: HardwareItem = { ...side, id: 'any-300', props: { length: 300 } }
const catalog = [...undermount, side, unknownMount]

describe('slides by mount', () => {
  it('lists slides of the mount, counting slides without a mount prop as either', () => {
    expect(slidesForMount(catalog, 'side-mount').map((h) => h.id)).toEqual(['s-400', 'any-300'])
    expect(slidesForMount(catalog, 'undermount').map((h) => h.id)).not.toContain('s-400')
    expect(slidesForMount(catalog, 'undermount').map((h) => h.id)).toContain('any-300')
  })

  it('offers side mount only when the catalog has a side-mount slide', () => {
    expect(hasSideMountSlides(undermount)).toBe(false)
    expect(hasSideMountSlides([...undermount, unknownMount])).toBe(false)
    expect(hasSideMountSlides(catalog)).toBe(true)
  })

  it('picks the slide of the mount closest in length to the current one', () => {
    expect(slideForMount(catalog, 'side-mount', 'blum-tandem-457')).toBe('s-400')
    expect(slideForMount(catalog, 'undermount', 's-400')).toBe('blum-tandem-381')
    expect(slideForMount(catalog, 'undermount', 'blum-tandem-229')).toBe('blum-tandem-229')
    expect(slideForMount(undermount, 'side-mount', 'blum-tandem-229')).toBe('blum-tandem-229')
  })
})
