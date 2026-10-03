import { describe, expect, it } from 'vitest'
import { panelToSheet, partFootprint } from './transform'
import { makePart, placeAt } from './testing/fixtures'

describe('panelToSheet', () => {
  const part = makePart({ length: 400, width: 300 })

  it('maps panel x to sheet X and panel y to sheet Y when not rotated', () => {
    const map = panelToSheet(placeAt(part, 100, 50), part)
    expect(map({ x: 0, y: 0, z: -3 })).toEqual({ x: 100, y: 50, z: -3 })
    expect(map({ x: 400, y: 300, z: 0 })).toEqual({ x: 500, y: 350, z: 0 })
    expect(map({ x: 10, y: 20, z: -1 })).toEqual({ x: 110, y: 70, z: -1 })
  })

  it('rotates 90° counter-clockwise when rotated (length along sheet +Y, face A stays up)', () => {
    const map = panelToSheet(placeAt(part, 100, 50, true), part)
    // panel origin -> lower-right corner of the placed footprint
    expect(map({ x: 0, y: 0, z: 0 })).toEqual({ x: 100 + 300, y: 50, z: 0 })
    // panel +x runs along sheet +Y
    expect(map({ x: 400, y: 0, z: 0 })).toEqual({ x: 400, y: 450, z: 0 })
    // panel +y runs along sheet -X
    expect(map({ x: 0, y: 300, z: 0 })).toEqual({ x: 100, y: 50, z: 0 })
    expect(map({ x: 10, y: 20, z: -2 })).toEqual({ x: 380, y: 60, z: -2 })
  })

  it('is a proper rotation (no mirror): panel corners keep their counter-clockwise order', () => {
    const map = panelToSheet(placeAt(part, 0, 0, true), part)
    const corners = [
      { x: 0, y: 0, z: 0 },
      { x: 400, y: 0, z: 0 },
      { x: 400, y: 300, z: 0 },
      { x: 0, y: 300, z: 0 },
    ].map(map)
    const area2 = corners.reduce((sum, p, i) => {
      const q = corners[(i + 1) % corners.length] ?? p
      return sum + (p.x * q.y - q.x * p.y)
    }, 0)
    expect(area2).toBeGreaterThan(0)
  })
})

describe('partFootprint', () => {
  it('spans the placement rectangle computed from the part size', () => {
    const part = makePart({ length: 400, width: 300 })
    expect(partFootprint(placeAt(part, 10, 20), part)).toEqual({ minX: 10, minY: 20, maxX: 410, maxY: 320 })
    expect(partFootprint(placeAt(part, 10, 20, true), part)).toEqual({ minX: 10, minY: 20, maxX: 310, maxY: 420 })
  })
})
