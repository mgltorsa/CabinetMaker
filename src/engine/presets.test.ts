import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import type { CabinetType } from '@/core/types'
import { buildCabinet } from '.'
import { PRESETS, createPreset } from './presets'
import { validateBuild } from './validate'

const ALL_TYPES: CabinetType[] = ['base', 'wall', 'tall', 'drawer-bank', 'bookshelf', 'nightstand', 'dresser', 'vanity', 'custom']
const ctx = { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE }

describe('presets', () => {
  it('lists every cabinet type once', () => {
    expect(PRESETS.map((p) => p.type).sort()).toEqual([...ALL_TYPES].sort())
  })

  it.each(ALL_TYPES)('%s builds a valid cabinet without errors', (type) => {
    const cab = createPreset(type)
    expect(cab.type).toBe(type)
    const b = buildCabinet(cab, ctx)
    expect(b.parts.length).toBeGreaterThan(5)
    expect(b.warnings.filter((w) => w.level !== 'info')).toEqual([])
    expect(validateBuild(b)).toEqual([])
  })

  it('creates fresh, independent cabinets', () => {
    const a = createPreset('base')
    const b = createPreset('base')
    expect(a.id).not.toBe(b.id)
    expect(a.sections).not.toBe(b.sections)
  })

  it('uses wall-cabinet placement for wall presets', () => {
    const wall = createPreset('wall')
    expect(wall.floorHeight).toBeGreaterThan(1000)
    expect(wall.construction.toeKick.type).toBe('none')
  })

  it('makes the drawer bank three drawers', () => {
    const b = buildCabinet(createPreset('drawer-bank'), ctx)
    expect(b.parts.filter((p) => p.role.startsWith('drawer-front-'))).toHaveLength(3)
  })
})
