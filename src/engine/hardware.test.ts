import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import type { HardwareItem } from '@/core/types'
import { buildCabinet } from '.'
import { SIDE_MOUNT_CLEARANCES, SLIDE_MOUNT_SIDE } from './constants'
import { aggregateHardware, chooseSlide, selectSlide, slidesFor } from './hardware'
import { bay, build, part, section, testCabinet, usage, warningCodes } from './testkit'
import { validateBuild } from './validate'

const sideMount = (length: number): HardwareItem => ({
  id: `side-${length}`,
  kind: 'slide',
  name: `Side-mount ${length}`,
  manufacturer: 'Acme',
  sku: `SM-${length}`,
  unitCost: 10,
  props: { length, mount: 1 },
})

const SIDE_MOUNT = { drawer: { slideMount: 'side-mount' as const, joinery: 'dado' as const, rearClearance: 10 } }
const UNDERMOUNT_ONLY = DEFAULT_HARDWARE.filter((h) => h.kind !== 'slide' || h.props.mount !== SLIDE_MOUNT_SIDE)

describe('slide selection', () => {
  const catalog = [...UNDERMOUNT_ONLY, sideMount(350), sideMount(450), sideMount(500)]

  it('filters by mount and picks the longest that fits', () => {
    expect(selectSlide(slidesFor(catalog, 'side-mount', 'blum-tandem-533'), 470)?.id).toBe('side-450')
    expect(selectSlide(slidesFor(catalog, 'undermount', 'blum-tandem-533'), 470)?.id).toBe('blum-tandem-457')
  })

  it('returns nothing when no slide is short enough', () => {
    expect(selectSlide(slidesFor(catalog, 'undermount', 'blum-tandem-533'), 200)).toBeUndefined()
  })

  it('keeps to the chosen slide manufacturer', () => {
    const other: HardwareItem = { ...sideMount(520), id: 'acme-520', props: { length: 520, mount: 0 } }
    expect(slidesFor([...catalog, other], 'undermount', 'blum-tandem-533').map((s) => s.id)).not.toContain('acme-520')
  })

  it('builds side-mount drawer boxes with 1/2" side clearance', () => {
    const cab = testCabinet({ construction: SIDE_MOUNT, sections: [section([bay('drawer')])] })
    const b = buildCabinet(cab, { materials: DEFAULT_MATERIALS, hardware: catalog })
    const l = part(b, 'drawer-1-1-side-left')
    const r = part(b, 'drawer-1-1-side-right')
    expect(r.bounds.max.x - l.bounds.min.x).toBeCloseTo(564 - 25.4, 3)
    expect(l.length).toBe(500)
    expect(usage(b, 'side-500')).toBe(1)
    expect(validateBuild(b)).toEqual([])
  })

  it('explains a missing slide family', () => {
    const cab = testCabinet({ construction: SIDE_MOUNT, sections: [section([bay('drawer')])] })
    const b = buildCabinet(cab, { materials: DEFAULT_MATERIALS, hardware: UNDERMOUNT_ONLY })
    expect(warningCodes(b)).toContain('no-slide-fits')
    expect(b.warnings.find((w) => w.code === 'no-slide-fits')?.message).toMatch(/no side-mount slides/)
  })
})

describe('default catalog side-mount slides', () => {
  const sideSlides = DEFAULT_HARDWARE.filter((h) => h.kind === 'slide' && h.props.mount === SLIDE_MOUNT_SIDE)

  it('offers ball-bearing side-mount slides (props.mount = 1)', () => {
    expect(sideSlides.length).toBeGreaterThanOrEqual(3)
    for (const s of sideSlides) expect(typeof s.props.length).toBe('number')
  })

  it('builds drawer boxes when side-mount is chosen with the default catalog', () => {
    const b = build(testCabinet({ construction: SIDE_MOUNT, sections: [section([bay('drawer')])] }))
    expect(warningCodes(b)).not.toContain('no-slide-fits')
    const l = part(b, 'drawer-1-1-side-left')
    const r = part(b, 'drawer-1-1-side-right')
    expect(r.bounds.max.x - l.bounds.min.x).toBeCloseTo(564 - 2 * 12.7, 3)
    expect(SIDE_MOUNT_CLEARANCES.width).toEqual({ basis: 'outside', deduction: 25.4 })
    const used = b.hardware.filter((h) => sideSlides.some((s) => s.id === h.hardwareId))
    expect(used).toHaveLength(1)
    const slide = sideSlides.find((s) => s.id === used[0]?.hardwareId)
    expect(l.length).toBe(slide?.props.length)
    expect(validateBuild(b)).toEqual([])
  })

  it('notes that the chosen undermount slide was replaced by a side-mount one', () => {
    const b = build(testCabinet({ construction: SIDE_MOUNT, sections: [section([bay('drawer')])] }))
    expect(b.warnings.find((w) => w.code === 'slide-mount-mismatch')).toMatchObject({ level: 'info' })
  })
})

describe('chosen slide', () => {
  const hardware = (slideId: string): ReturnType<typeof testCabinet>['hardware'] => ({ hingeId: 'blum-cliptop-110', slideId, pullId: 'pull-bar-128', shelfPinId: 'pin-5' })

  it('honours a shorter chosen slide that fits', () => {
    const b = build(testCabinet({ hardware: hardware('blum-tandem-305'), sections: [section([bay('drawer')])] }))
    expect(part(b, 'drawer-1-1-side-left').length).toBe(305)
    expect(usage(b, 'blum-tandem-305')).toBe(1)
    expect(usage(b, 'blum-tandem-533')).toBe(0)
    expect(warningCodes(b)).not.toContain('slide-too-long')
  })

  it('keeps the default 533 slide for the default cabinet', () => {
    const b = build(testCabinet({ sections: [section([bay('drawer')])] }))
    expect(usage(b, 'blum-tandem-533')).toBe(1)
    expect(warningCodes(b)).toEqual([])
  })

  it('warns and falls back to the longest fitting slide of the family when the chosen one is too long', () => {
    const b = build(testCabinet({ depth: 450, sections: [section([bay('drawer')])] }))
    // 450 − 18 back − 18 nailer − 10 clearance = 404 ⇒ 381
    expect(part(b, 'drawer-1-1-side-left').length).toBe(381)
    expect(usage(b, 'blum-tandem-381')).toBe(1)
    const w = b.warnings.find((x) => x.code === 'slide-too-long')
    expect(w).toMatchObject({ level: 'warn' })
    expect(w?.message).toMatch(/533/)
  })

  it('warns about an unknown slide id and still picks a fitting slide', () => {
    const b = build(testCabinet({ hardware: hardware('nope'), sections: [section([bay('drawer')])] }))
    expect(warningCodes(b)).toContain('unknown-hardware')
    expect(usage(b, 'blum-tandem-533')).toBe(1)
  })

  it('chooseSlide reports how the slide was chosen', () => {
    expect(chooseSlide(DEFAULT_HARDWARE, 'undermount', 'blum-tandem-305', 534)).toMatchObject({ slide: { id: 'blum-tandem-305' }, reason: 'chosen' })
    expect(chooseSlide(DEFAULT_HARDWARE, 'undermount', 'blum-tandem-533', 400)).toMatchObject({ slide: { id: 'blum-tandem-381' }, reason: 'too-long' })
    expect(chooseSlide(DEFAULT_HARDWARE, 'undermount', 'blum-tandem-533', 100)).toMatchObject({ slide: undefined })
    expect(chooseSlide(DEFAULT_HARDWARE, 'side-mount', 'blum-tandem-533', 534)).toMatchObject({ reason: 'mount-mismatch' })
    expect(chooseSlide(DEFAULT_HARDWARE, 'undermount', 'nope', 534)).toMatchObject({ slide: { id: 'blum-tandem-533' }, reason: 'unknown' })
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
