import { describe, expect, it } from 'vitest'
import { computeBounds } from './bounds'
import { dimensionGeometry } from './dimension'
import { hingeSide, isDoor, panelToCabinet, union } from './part-geometry'
import { scaleNote } from './pdf-drawing'
import { arrow, dim, obround } from './shapes'
import { hexToRgb, safeFill, styleForExtent } from './style'
import { fixtureCabinet, fixturePart } from './testing/fixtures'

const style = styleForExtent(600)

describe('dimensionGeometry', () => {
  it('offsets along the left normal and keeps vertical labels upright', () => {
    const g = dimensionGeometry(dim(0, 0, 0, 100, 20), style, 'metric')
    expect(g?.line.x1).toBeCloseTo(-20)
    expect(g?.label).toMatchObject({ angleDeg: 90, text: '100' })
    const down = dimensionGeometry(dim(0, 100, 0, 0, -20), style, 'metric')
    expect(down?.label.angleDeg).toBe(90)
    const left = dimensionGeometry(dim(100, 0, 0, 0, 10), style, 'metric')
    expect(left?.label.angleDeg).toBe(0)
  })

  it('moves the label and arrows outside on short dims', () => {
    const g = dimensionGeometry(dim(0, 0, 5, 0, -10, '5'), style, 'metric')
    expect(g?.label.x).toBeGreaterThan(5)
    expect(g?.line.x1).toBeLessThan(0)
  })

  it('returns null for zero-length or non-finite dims and skips extensions at zero offset', () => {
    expect(dimensionGeometry(dim(1, 1, 1, 1, 5), style, 'metric')).toBeNull()
    expect(dimensionGeometry(dim(0, 0, 10, 0, NaN), style, 'metric')).toBeNull()
    expect(dimensionGeometry(dim(0, 0, 100, 0, 0), style, 'metric')?.extensions).toHaveLength(0)
  })
})

describe('shapes and bounds', () => {
  it('builds arrows, obrounds and handles degenerate input', () => {
    expect(arrow({ x: 0, y: 0 }, { x: 0, y: 0 }, 1)).toEqual([])
    expect(arrow({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)).toHaveLength(3)
    const slot = obround(0, 0, 30, 6, 'y', 'op')
    const ys = slot.points.map((p) => p.y)
    expect(Math.max(...ys)).toBeCloseTo(15)
  })

  it('returns a unit box when nothing is drawable', () => {
    expect(computeBounds([], style, 'metric')).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
    expect(computeBounds([{ type: 'text', x: 0, y: 0, text: 'abc', size: 10, anchor: 'end', layer: 'text' }], style, 'metric').minX).toBeLessThan(0)
  })

  it('accepts only hex fills', () => {
    expect(safeFill('#abc')).toBe('#abc')
    expect(safeFill('url(javascript:x)')).toBeNull()
    expect(hexToRgb('#ff0000')).toEqual({ r: 1, g: 0, b: 0 })
    expect(hexToRgb('#0f0').g).toBe(1)
  })

  it('unions only finite ranges', () => {
    expect(union([])).toBeNull()
    expect(union([{ x0: NaN, x1: 1, y0: 0, y1: 1 }])).toBeNull()
  })

  it('prints a scale note', () => {
    expect(scaleNote(72 / 25.4 / 10)).toBe('approx. 1:10 - do not scale')
    expect(scaleNote(0)).toBe('Not to scale')
  })
})

describe('part geometry', () => {
  const cabinet = fixtureCabinet()
  const door = (role: string, x0: number, x1: number): ReturnType<typeof fixturePart> =>
    fixturePart({ role, name: 'Front', group: 'front', box: [x0, x1, 0, 700, 560, 578], length: 'y', thickness: 'z' })

  it('maps panel coordinates to cabinet space through the part axes', () => {
    const p = door('door-1', 100, 400)
    expect(panelToCabinet(p, 50, 20)).toEqual({ x: 120, y: 50, z: 578 })
  })

  it('decides hinge side from keywords, position and bays', () => {
    expect(hingeSide(door('panel-left', 0, 600), cabinet)).toBe('left')
    expect(hingeSide(door('panel', 300, 600), cabinet)).toBe('right')
    const single = {
      ...cabinet,
      sections: [{ id: 's', width: null, bays: [{ id: 'b', kind: 'door' as const, height: null, shelfCount: 0, doorCount: 1 as const, hingeSide: 'right' as const }] }],
    }
    expect(hingeSide(door('panel', 0, 600), single)).toBe('right')
    expect(hingeSide(door('panel', 0, 600), { ...cabinet, sections: [] })).toBe('left')
  })

  it('treats fronts named door or with hinge cups as doors', () => {
    expect(isDoor(door('door-1', 0, 300))).toBe(true)
    expect(isDoor(door('drawer-front', 0, 300))).toBe(false)
  })
})
