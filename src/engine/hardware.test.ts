import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import type { HardwareItem } from '@/core/types'
import { buildCabinet } from '.'
import { aggregateHardware, selectSlide, slidesFor } from './hardware'
import { bay, part, section, testCabinet, usage, warningCodes } from './testkit'
import { validateBuild } from './validate'

const sideMount = (length: number): HardwareItem => ({
  id: `side-${length}`,
  kind: 'slide',
  name: `Side-mount ${length}`,
  manufacturer: 'Generic',
  sku: `SM-${length}`,
  unitCost: 10,
  props: { length, mount: 1 },
})

describe('slide selection', () => {
  const catalog = [...DEFAULT_HARDWARE, sideMount(350), sideMount(450), sideMount(500)]

  it('filters by mount and picks the longest that fits', () => {
    expect(selectSlide(slidesFor(catalog, 'side-mount', 'blum-tandem-533'), 470)?.id).toBe('side-450')
    expect(selectSlide(slidesFor(catalog, 'undermount', 'blum-tandem-533'), 470)?.id).toBe('blum-tandem-457')
  })

  it('returns nothing when no slide is short enough', () => {
    expect(selectSlide(slidesFor(catalog, 'undermount', 'blum-tandem-533'), 200)).toBeUndefined()
  })

  it('keeps to the chosen slide manufacturer', () => {
    const other: HardwareItem = { ...sideMount(520), id: 'acme-520', manufacturer: 'Acme', props: { length: 520, mount: 0 } }
    expect(slidesFor([...catalog, other], 'undermount', 'blum-tandem-533').map((s) => s.id)).not.toContain('acme-520')
  })

  it('builds side-mount drawer boxes with 1/2" side clearance', () => {
    const cab = testCabinet({ construction: { drawer: { slideMount: 'side-mount', joinery: 'dado', rearClearance: 10 } }, sections: [section([bay('drawer')])] })
    const b = buildCabinet(cab, { materials: DEFAULT_MATERIALS, hardware: catalog })
    const l = part(b, 'drawer-1-1-side-left')
    const r = part(b, 'drawer-1-1-side-right')
    expect(r.bounds.max.x - l.bounds.min.x).toBeCloseTo(564 - 25.4, 3)
    expect(l.length).toBe(500)
    expect(usage(b, 'side-500')).toBe(1)
    expect(validateBuild(b)).toEqual([])
  })

  it('explains a missing slide family', () => {
    const cab = testCabinet({ construction: { drawer: { slideMount: 'side-mount', joinery: 'dado', rearClearance: 10 } }, sections: [section([bay('drawer')])] })
    const b = buildCabinet(cab, { materials: DEFAULT_MATERIALS })
    expect(warningCodes(b)).toContain('no-slide-fits')
    expect(b.warnings.find((w) => w.code === 'no-slide-fits')?.message).toMatch(/no side-mount slides/)
  })
})

describe('aggregateHardware', () => {
  it('sums quantities per hardware id and merges distinct notes', () => {
    const out = aggregateHardware('c', [
      { hardwareId: 'a', qty: 2, note: 'Hinges' },
      { hardwareId: 'b', qty: 1, note: 'Pulls' },
      { hardwareId: 'a', qty: 3, note: 'Hinges' },
      { hardwareId: 'a', qty: 1, note: 'Spare' },
      { hardwareId: 'z', qty: 0, note: 'none' },
    ])
    expect(out).toEqual([
      { hardwareId: 'a', cabinetId: 'c', qty: 6, note: 'Hinges; Spare' },
      { hardwareId: 'b', cabinetId: 'c', qty: 1, note: 'Pulls' },
    ])
  })
})
