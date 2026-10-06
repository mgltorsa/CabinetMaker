/**
 * Every elevation tags the dimensions that state a cabinet input with a stable
 * id, so the UI can edit them in place. Checked over real engine output for
 * every preset in every construction style.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import type { ConstructionStyle, Drawing, Shape } from '@/core/types'
import { buildCabinet } from '@/engine'
import { createPreset, PRESETS } from '@/engine/presets'
import { frontDimId, frontElevation, frontRefOf, isDrawingDimId, parseFrontDimId, sideElevation } from '.'
import { fixtureCabinet, fixtureCabinetBuild } from './testing/fixtures'

const STYLES: ConstructionStyle[] = ['frameless-overlay', 'frameless-inset', 'face-frame-overlay', 'face-frame-inset']

type Dim = Extract<Shape, { type: 'dim' }>
const dims = (d: Drawing): Dim[] => d.shapes.filter((s): s is Dim => s.type === 'dim')
const ids = (d: Drawing): string[] => d.shapes.flatMap((s) => ((s.type === 'dim' || s.type === 'text') && s.id !== undefined ? [s.id] : []))
const byId = (d: Drawing, id: string): Dim | undefined => dims(d).find((s) => s.id === id)
const length = (s: Dim): number => Math.hypot(s.x2 - s.x1, s.y2 - s.y1)

describe('front dimension ids', () => {
  it('round-trips section and bay indices', () => {
    expect(frontDimId(1, 2)).toBe('front:1:2')
    expect(parseFrontDimId('front:1:2')).toEqual({ section: 1, bay: 2 })
    expect(parseFrontDimId('width')).toBeNull()
    expect(parseFrontDimId('front:x:2')).toBeNull()
  })

  it('recognises every dimension id and nothing else', () => {
    for (const id of ['width', 'height', 'depth', 'toe-kick', 'floor-height', 'front:0:3']) expect(isDrawingDimId(id), id).toBe(true)
    for (const id of ['Width', 'front:1', 'pull', '']) expect(isDrawingDimId(id), id).toBe(false)
  })

  it('reads section and bay from engine front roles only', () => {
    expect(frontRefOf({ group: 'front', role: 'drawer-front-2-3' })).toEqual({ section: 1, bay: 2 })
    expect(frontRefOf({ group: 'front', role: 'door-1-2-1' })).toEqual({ section: 0, bay: 1 })
    expect(frontRefOf({ group: 'front', role: 'door-1' })).toBeNull()
    expect(frontRefOf({ group: 'carcass', role: 'door-1-1' })).toBeNull()
  })
})

describe.each(PRESETS.flatMap((p) => STYLES.map((style) => [p.type, style] as const)))('dimension ids for %s / %s', (type, style) => {
  const cabinet = createPreset(type)
  cabinet.id = 'cab'
  cabinet.construction.style = style
  const build = buildCabinet(cabinet, { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE })
  const front = frontElevation(cabinet, build, 'metric')
  const side = sideElevation(cabinet, build, 'metric')

  it('tags the overall box dimensions with their cabinet values', () => {
    expect(length(byId(front, 'width')!)).toBeCloseTo(cabinet.width, 6)
    expect(length(byId(front, 'height')!)).toBeCloseTo(cabinet.height, 6)
    expect(length(byId(side, 'depth')!)).toBeCloseTo(cabinet.depth, 6)
    expect(length(byId(side, 'height')!)).toBeCloseTo(cabinet.height, 6)
  })

  it('never repeats an id within a drawing and leaves "overall" dims untagged', () => {
    for (const d of [front, side]) {
      expect(new Set(ids(d)).size, d.id).toBe(ids(d).length)
      for (const s of dims(d)) if (s.label?.endsWith('overall')) expect(s.id, d.id).toBeUndefined()
    }
  })

  it('tags the toe kick and the mounting-height note when present', () => {
    const kick = byId(front, 'toe-kick')
    const hasKick = cabinet.floorHeight === 0 && cabinet.construction.toeKick.type !== 'none' && cabinet.construction.toeKick.height > 0
    expect(kick !== undefined, 'toe-kick dim').toBe(hasKick)
    if (kick) expect(length(kick)).toBeCloseTo(cabinet.construction.toeKick.height, 6)
    for (const d of [front, side]) expect(ids(d).includes('floor-height'), d.id).toBe(cabinet.floorHeight > 0)
  })

  it('tags each front height in the chain with the section and bay of that front', () => {
    const tagged = dims(front).filter((s) => s.id?.startsWith('front:'))
    // The left chain repeats the toe kick; only the right chain's copy carries the id.
    const kick = byId(front, 'toe-kick')
    const isKickCopy = (s: Dim): boolean => kick !== undefined && Math.abs(length(s) - length(kick)) < 1e-6 && Math.min(s.y1, s.y2) === Math.min(kick.y1, kick.y2)
    const untagged = dims(front).filter((s) => s.id === undefined && !s.label?.endsWith('overall') && !isKickCopy(s))
    expect(untagged, 'untagged chain dims').toEqual([])
    for (const s of tagged) {
      const ref = parseFrontDimId(s.id!)!
      const bay = cabinet.sections[ref.section]?.bays[ref.bay]
      expect(bay, s.id).toBeDefined()
      const parts = build.parts.filter((p) => {
        const r = frontRefOf(p)
        return r?.section === ref.section && r.bay === ref.bay
      })
      expect(parts.length, s.id).toBeGreaterThan(0)
      expect(length(s)).toBeCloseTo(parts[0]!.bounds.max.y - parts[0]!.bounds.min.y, 6)
    }
    const hasFronts = build.parts.some((p) => p.group === 'front')
    expect(tagged.length > 0, 'front chain tagged').toBe(hasFronts)
  })
})

describe('hand-made parts without engine roles', () => {
  it('still dimension every front but leave them untagged', () => {
    const d = frontElevation(fixtureCabinet(), fixtureCabinetBuild(), 'metric')
    expect(dims(d).filter((s) => s.label === '150')).toHaveLength(1)
    expect(dims(d).find((s) => s.label === '150')?.id).toBeUndefined()
    expect(byId(d, 'toe-kick')?.label).toBe('100')
  })
})
