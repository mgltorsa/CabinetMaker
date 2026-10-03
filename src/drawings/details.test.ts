import { describe, expect, it } from 'vitest'
import type { Op, Part, Shape, Sheet } from '@/core/types'
import { panelDetail, sheetLayout } from '.'
import { fixtureParts, fixturePart, fixturePartsById, fixtureSheet } from './testing/fixtures'

type Of<T extends Shape['type']> = Extract<Shape, { type: T }>
const ofType = <T extends Shape['type']>(shapes: Shape[], type: T): Of<T>[] => shapes.filter((s): s is Of<T> => s.type === type)
const texts = (shapes: Shape[]): string[] => ofType(shapes, 'text').map((t) => t.text)

function sidePart(): Part {
  const side = fixtureParts()[0]
  if (!side) throw new Error('fixture side missing')
  return side
}

describe('panelDetail', () => {
  const part = sidePart()
  const d = panelDetail(part, 'metric', { materialName: '18 mm plywood' })

  it('draws the L x W outline at the panel-space origin', () => {
    expect(ofType(d.shapes, 'rect')[0]).toEqual({ type: 'rect', x: 0, y: 0, w: 770, h: 562, layer: 'outline' })
  })

  it('draws face A holes as op-layer circles and the groove as a rect of its width', () => {
    const holes = ofType(d.shapes, 'circle').filter((c) => c.layer === 'op')
    expect(holes).toHaveLength(10)
    expect(holes[0]).toMatchObject({ cx: 250, cy: 37, r: 2.5 })
    expect(ofType(d.shapes, 'rect')).toContainEqual({ type: 'rect', x: 0, y: 12, w: 770, h: 6, layer: 'op' })
  })

  it('draws face B and edge ops hidden, with notes', () => {
    const hiddenSlot = ofType(d.shapes, 'polyline').find((p) => p.layer === 'hidden')
    expect(hiddenSlot?.closed).toBe(true)
    expect(ofType(d.shapes, 'rect')).toContainEqual({ type: 'rect', x: 0, y: 46, w: 30, h: 8, layer: 'hidden' })
    expect(texts(d.shapes).some((t) => t.includes('1 op(s) on face B'))).toBe(true)
    expect(texts(d.shapes).some((t) => t.includes('1 edge op(s)'))).toBe(true)
  })

  it('dimensions overall size and first hole from each edge for every row', () => {
    const labels = ofType(d.shapes, 'dim').map((x) => x.label)
    expect(labels).toEqual(expect.arrayContaining(['770', '562', '250', '392', '37', '12']))
    expect(labels.filter((l) => l === '250')).toHaveLength(2)
    expect(texts(d.shapes)).toContain('5 x Ø5 @ 32')
  })

  it('titles the detail with name, material, thickness and grain', () => {
    expect(texts(d.shapes)).toEqual(expect.arrayContaining(['Left side', '18 mm plywood · T 18 mm · 770 x 562', 'Grain along length']))
  })

  it('handles width grain, no grain and vertical / diagonal dados', () => {
    const ops: Op[] = [
      { id: 'v', kind: 'dado', face: 'A', purpose: 'dado', x1: 100, y1: 0, x2: 100, y2: 300, width: 18, depth: 6 },
      { id: 'v2', kind: 'dado', face: 'A', purpose: 'dado', x1: 500, y1: 0, x2: 500, y2: 300, width: 18, depth: 6 },
      { id: 'd', kind: 'dado', face: 'A', purpose: 'dado', x1: 0, y1: 0, x2: 50, y2: 50, width: 4, depth: 3 },
      { id: 'top', kind: 'dado', face: 'B', purpose: 'dado', x1: 0, y1: 250, x2: 600, y2: 250, width: 6, depth: 6 },
      { id: 'e1', kind: 'mortise', face: 'edge-x1', purpose: 'domino', x: 100, y: 9, length: 30, width: 5, depth: 15, axis: 'x' },
      { id: 'e2', kind: 'hole', face: 'edge-y0', purpose: 'dowel', x: 80, y: 9, diameter: 8, depth: 20 },
      { id: 'e3', kind: 'dado', face: 'edge-y1', purpose: 'dado', x1: 10, y1: 9, x2: 90, y2: 9, width: 4, depth: 5 },
      { id: 'm', kind: 'mortise', face: 'A', purpose: 'domino', x: 300, y: 150, length: 30, width: 5, depth: 12, axis: 'y' },
    ]
    const p = fixturePart({ role: 'divider', name: 'Divider', group: 'divider', box: [0, 600, 0, 300, 0, 18], length: 'x', thickness: 'z', grain: 'width', ops })
    const det = panelDetail(p, 'imperial')
    expect(texts(det.shapes)).toContain('Grain along width')
    expect(ofType(det.shapes, 'rect')).toContainEqual({ type: 'rect', x: 91, y: 0, w: 18, h: 300, layer: 'op' })
    expect(ofType(det.shapes, 'rect')).toContainEqual({ type: 'rect', x: 585, y: 85, w: 15, h: 30, layer: 'hidden' })
    expect(ofType(det.shapes, 'polyline').filter((x) => x.layer === 'op')).toHaveLength(2)
    expect(ofType(det.shapes, 'dim').map((x) => x.label)).toContain('3 9/16"')
    const flat = panelDetail({ ...p, grain: 'none', ops: [] }, 'metric')
    expect(texts(flat.shapes)).toContain('No grain')
  })
})

describe('sheetLayout', () => {
  const sheet = fixtureSheet()
  const parts = fixturePartsById()
  const d = sheetLayout(sheet, parts, 'metric', { edgeTrim: 10, materialName: '18 mm plywood' })

  it('draws the sheet, the trim line and every placement with a label', () => {
    const rects = ofType(d.shapes, 'rect')
    expect(rects[0]).toEqual({ type: 'rect', x: 0, y: 0, w: 2440, h: 1220, layer: 'outline' })
    expect(rects).toContainEqual({ type: 'rect', x: 10, y: 10, w: 2420, h: 1200, layer: 'hidden' })
    expect(rects.filter((r) => r.fill !== undefined)).toHaveLength(sheet.placements.length)
    expect(texts(d.shapes)).toEqual(expect.arrayContaining(['Left side', '#1 side-left']))
  })

  it('reports yield and part count in the title', () => {
    expect(texts(d.shapes)).toContain('Sheet 1 · 18 mm plywood · 18 mm · 6 parts · yield 62.3 %')
  })

  it('points grain arrows along sheet Y for rotated grained parts', () => {
    const rotated = sheet.placements.find((p) => p.rotated)
    expect(rotated).toBeDefined()
    const vertical = ofType(d.shapes, 'line').filter((l) => l.layer === 'hatch' && l.x1 === l.x2 && l.y2 > l.y1)
    expect(vertical.some((l) => rotated && l.x1 > rotated.x && l.x1 < rotated.x + rotated.sizeX)).toBe(true)
  })

  it('labels placements of unknown parts by id and skips the trim when absent', () => {
    const odd: Sheet = { ...sheet, placements: [{ partId: 'cab_x:mystery', x: 0, y: 0, rotated: false, sizeX: 300, sizeY: 200 }], yield: NaN }
    const out = sheetLayout(odd, new Map(), 'imperial')
    expect(texts(out.shapes)).toEqual(expect.arrayContaining(['cab_x:mystery', '#1 mystery']))
    expect(ofType(out.shapes, 'rect').filter((r) => r.layer === 'hidden')).toHaveLength(0)
    expect(texts(out.shapes).some((t) => t.includes('yield 0.0 %'))).toBe(true)
  })
})
