import { describe, expect, it } from 'vitest'
import type { CabinetBuild, Shape } from '@/core/types'
import { frontElevation, sideElevation } from '.'
import { fixtureCabinet, fixtureCabinetBuild, fixturePart } from './testing/fixtures'

const dims = (shapes: Shape[]): Extract<Shape, { type: 'dim' }>[] => shapes.filter((s): s is Extract<Shape, { type: 'dim' }> => s.type === 'dim')
const rects = (shapes: Shape[]): Extract<Shape, { type: 'rect' }>[] => shapes.filter((s): s is Extract<Shape, { type: 'rect' }> => s.type === 'rect')

describe('frontElevation', () => {
  const cabinet = fixtureCabinet()
  const drawing = frontElevation(cabinet, fixtureCabinetBuild(), 'metric')

  it('draws every front as a filled rect at its cabinet XY position', () => {
    const fronts = rects(drawing.shapes).filter((r) => r.fill !== undefined)
    expect(fronts).toHaveLength(3)
    expect(fronts).toContainEqual(expect.objectContaining({ x: 1.5, y: 718.5, w: 597, h: 150 }))
  })

  it('draws door swing lines on the hidden layer with the apex at the hinge side', () => {
    const hidden = drawing.shapes.filter((s) => s.type === 'line' && s.layer === 'hidden')
    // door 1 hinged left (cups near min x): lines meet at x = 1.5
    expect(hidden).toContainEqual(expect.objectContaining({ x1: 298.5, y1: 101.5, x2: 1.5, y2: 408.5 }))
    // door 2 hinged right (position fallback): lines meet at x = 598.5
    expect(hidden).toContainEqual(expect.objectContaining({ x1: 301.5, y1: 715.5, x2: 598.5 }))
  })

  it('draws a pull between the drawer front pull holes', () => {
    const pull = drawing.shapes.find((s) => s.type === 'line' && s.layer === 'outline' && s.y1 === 793.5 && s.y2 === 793.5)
    expect(pull).toMatchObject({ x1: 236, x2: 364 })
  })

  it('dimensions overall width/height, each front height and the toe kick', () => {
    const labels = dims(drawing.shapes).map((d) => d.label)
    expect(labels).toEqual(expect.arrayContaining(['600', '870', '150', '614', '100']))
  })

  it('formats labels in imperial fractions', () => {
    const imperial = frontElevation(cabinet, fixtureCabinetBuild(), 'imperial')
    expect(dims(imperial.shapes).map((d) => d.label)).toContain('23 5/8"')
  })

  it('bounds contain all geometry including dimension text', () => {
    expect(drawing.bounds.minX).toBeLessThan(0)
    expect(drawing.bounds.maxX).toBeGreaterThan(600)
    expect(drawing.bounds.minY).toBeLessThan(0)
    expect(drawing.bounds.maxY).toBeGreaterThanOrEqual(870)
  })

  it('synthesizes a countertop when the engine emits no top part', () => {
    const withTop = { ...cabinet, top: { ...cabinet.top, kind: 'countertop' as const, overhangSides: 10 } }
    const d = frontElevation(withTop, fixtureCabinetBuild(), 'metric')
    expect(rects(d.shapes)).toContainEqual(expect.objectContaining({ x: -10, y: 870, w: 620, h: 30 }))
  })

  it('falls back to the cabinet box when there are no parts', () => {
    const empty: CabinetBuild = { cabinetId: cabinet.id, parts: [], hardware: [], warnings: [] }
    const d = frontElevation(cabinet, empty, 'metric')
    expect(rects(d.shapes)).toContainEqual(expect.objectContaining({ x: 0, y: 0, w: 600, h: 870 }))
  })

  it('uses heuristic pulls only when the cabinet has pull hardware', () => {
    const door = fixturePart({ role: 'door-right', name: 'Door', group: 'front', box: [0, 600, 0, 700, 560, 578], length: 'y', thickness: 'z' })
    const build: CabinetBuild = { cabinetId: cabinet.id, parts: [door], hardware: [], warnings: [] }
    const withPull = frontElevation(cabinet, build, 'metric')
    const noPull = frontElevation({ ...cabinet, hardware: { ...cabinet.hardware, pullId: null } }, build, 'metric')
    const outlineLines = (s: Shape[]): number => s.filter((x) => x.type === 'line' && x.layer === 'outline').length
    expect(outlineLines(withPull.shapes)).toBe(outlineLines(noPull.shapes) + 1)
    // hinge right from the role keyword → swing lines meet at x = 600
    expect(withPull.shapes).toContainEqual(expect.objectContaining({ type: 'line', layer: 'hidden', x2: 600 }))
  })
})

describe('sideElevation', () => {
  const drawing = sideElevation(fixtureCabinet(), fixtureCabinetBuild(), 'metric')

  it('maps cabinet Z to drawing X with the front at the right', () => {
    const doorThickness = rects(drawing.shapes).find((r) => r.x === 562 && r.w === 18 && r.y === 101.5)
    expect(doorThickness).toBeDefined()
  })

  it('fills parts cut by the mid-width section and outlines the side panel', () => {
    const shelf = rects(drawing.shapes).find((r) => r.y === 400 && r.h === 18)
    expect(shelf?.fill).toBeDefined()
    expect(rects(drawing.shapes)).toContainEqual({ type: 'rect', x: 0, y: 100, w: 562, h: 770, layer: 'outline' })
  })

  it('dimensions depth and height', () => {
    const labels = dims(drawing.shapes).map((d) => d.label)
    expect(labels).toEqual(['580', '870'])
  })
})
