import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import type { Cabinet, Part, Shape } from '@/core/types'
import { buildCabinet } from '@/engine'
import { createPreset } from '@/engine/presets'
import { frontElevation, sideElevation } from '.'

type Rect = Extract<Shape, { type: 'rect' }>
type Circle = Extract<Shape, { type: 'circle' }>

const isRect = (s: Shape): s is Rect => s.type === 'rect'
const isCircle = (s: Shape): s is Circle => s.type === 'circle'
const matches = (r: Rect, p: Part): boolean =>
  Math.abs(r.x - p.bounds.min.x) < 1e-6 && Math.abs(r.y - p.bounds.min.y) < 1e-6 && Math.abs(r.w - p.length) < 1e-6 && Math.abs(r.h - p.thickness) < 1e-6

function wardrobe(kind: 'door' | 'open'): { cabinet: Cabinet; rod: Part; drawing: ReturnType<typeof frontElevation>; side: ReturnType<typeof sideElevation> } {
  const cabinet = createPreset('wardrobe')
  cabinet.id = 'cab'
  cabinet.sections = cabinet.sections.map((s) => ({ ...s, bays: s.bays.map((b) => ({ ...b, kind })) }))
  const build = buildCabinet(cabinet, { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE })
  const rod = build.parts.find((p) => p.group === 'rod')!
  return { cabinet, rod, drawing: frontElevation(cabinet, build, 'metric'), side: sideElevation(cabinet, build, 'metric') }
}

describe('hanging rods in the elevations', () => {
  it('front: draws the rod hidden (dashed) behind doors, on top of the door fill', () => {
    const { rod, drawing } = wardrobe('door')
    const index = drawing.shapes.findIndex((s) => isRect(s) && matches(s, rod))
    expect(index).toBeGreaterThanOrEqual(0)
    expect(drawing.shapes[index]).toMatchObject({ layer: 'hidden' })
    const lastFront = drawing.shapes.map((s) => isRect(s) && s.fill !== undefined).lastIndexOf(true)
    expect(index).toBeGreaterThan(lastFront)
  })

  it('front: draws the rod solid in an open bay', () => {
    const { rod, drawing } = wardrobe('open')
    expect(drawing.shapes.filter(isRect).find((s) => matches(s, rod))).toMatchObject({ layer: 'outline' })
  })

  it('side section: draws the rod as a circle at its position, not as a box', () => {
    const { rod, side } = wardrobe('door')
    const cy = (rod.bounds.min.y + rod.bounds.max.y) / 2
    const cz = (rod.bounds.min.z + rod.bounds.max.z) / 2
    expect(side.shapes.filter(isCircle)).toContainEqual(expect.objectContaining({ cx: cz, cy, r: rod.thickness / 2, layer: 'outline' }))
    const rodBox = side.shapes.filter(isRect).some((r) => Math.abs(r.x - rod.bounds.min.z) < 1e-6 && Math.abs(r.y - rod.bounds.min.y) < 1e-6 && Math.abs(r.w - rod.width) < 1e-6)
    expect(rodBox).toBe(false)
  })
})
