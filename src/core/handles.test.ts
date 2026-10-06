import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE } from './defaults'
import { BAR_LENGTH_OVER_CENTERS, DEFAULT_HANDLE_COLOR, handleModel, holesPerPull, isHandleStyle, resolveHandle } from './handles'
import type { HardwareItem } from './types'

const pull = (extra: Partial<HardwareItem> = {}): HardwareItem => ({
  id: 'p',
  kind: 'pull',
  name: 'P',
  manufacturer: '',
  sku: '',
  unitCost: 1,
  props: { centers: 96 },
  ...extra,
})

describe('resolveHandle', () => {
  it('treats a pull without `handle` as the bar pull it always was', () => {
    const h = resolveHandle(pull())
    expect(h).toMatchObject({ style: 'bar', centers: 96, length: 96 + BAR_LENGTH_OVER_CENTERS, diameter: 12, projection: 28, color: DEFAULT_HANDLE_COLOR })
    expect(h.model).toBeUndefined()
  })

  it('falls back to 128 mm centres when the pull has none', () => {
    expect(resolveHandle(pull({ props: {} })).centers).toBe(128)
  })

  it('fills absent fields from the style defaults and keeps given ones', () => {
    const knob = resolveHandle(pull({ handle: { style: 'knob', diameter: 25 } }))
    expect(knob).toMatchObject({ style: 'knob', diameter: 25, length: 25 })
    expect(knob.projection).toBeGreaterThan(0)
    const cup = resolveHandle(pull({ handle: { style: 'cup', color: '#202020' } }))
    expect(cup.width).toBeGreaterThan(0)
    expect(cup.length).toBeGreaterThan(96)
    expect(cup.color).toBe('#202020')
  })

  it('exposes the imported model only when every model field is present', () => {
    const nativeSize = { x: 1, y: 2, z: 3 }
    const full = resolveHandle(pull({ handle: { style: 'custom', blobId: 'sha256-ab', format: 'glb', unit: 'cm', nativeSize } }))
    expect(full.model).toEqual({ blobId: 'sha256-ab', format: 'glb', unit: 'cm', nativeSize })
    expect(resolveHandle(pull({ handle: { style: 'custom', blobId: 'sha256-ab' } })).model).toBeUndefined()
  })

  it('sizes a custom handle from its model when no length is given (cm → mm)', () => {
    const h = resolveHandle(pull({ handle: { style: 'custom', blobId: 'x', format: 'obj', unit: 'cm', nativeSize: { x: 16, y: 2, z: 3 } } }))
    expect(h.length).toBe(160)
  })
})

describe('holesPerPull', () => {
  const holes = (handle: HardwareItem['handle'], centers = 96): number => holesPerPull(resolveHandle(pull({ handle, props: { centers } })))
  it('drills two holes for bars, cups and edge pulls, one for knobs, none for J-profiles', () => {
    expect(holes(undefined)).toBe(2)
    expect(holes({ style: 'cup' })).toBe(2)
    expect(holes({ style: 'edge' })).toBe(2)
    expect(holes({ style: 'knob' })).toBe(1)
    expect(holes({ style: 'j-profile' })).toBe(0)
  })

  it('drills one hole for a custom handle with centres under 16 mm (0 = single screw)', () => {
    expect(holes({ style: 'custom' }, 0)).toBe(1)
    expect(holes({ style: 'custom' }, 15)).toBe(1)
    expect(holes({ style: 'custom' }, 64)).toBe(2)
  })
})

describe('handle helpers', () => {
  it('recognises handle styles', () => {
    expect(isHandleStyle('knob')).toBe(true)
    expect(isHandleStyle('lever')).toBe(false)
  })

  it('handleModel reads the model of a custom pull', () => {
    expect(handleModel(pull())).toBeNull()
    expect(handleModel(pull({ handle: { style: 'custom', blobId: 'b', format: 'stl', unit: 'mm', nativeSize: { x: 1, y: 1, z: 1 } } }))?.blobId).toBe('b')
  })

  it('every default pull resolves to a valid style with positive sizes', () => {
    for (const item of DEFAULT_HARDWARE.filter((h) => h.kind === 'pull')) {
      const h = resolveHandle(item)
      expect(isHandleStyle(h.style)).toBe(true)
      expect(h.diameter).toBeGreaterThan(0)
      expect(h.projection).toBeGreaterThanOrEqual(0)
    }
  })
})
