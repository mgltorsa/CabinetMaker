import { describe, expect, it } from 'vitest'
import { rectDistance, segmentRectDistance } from './neighbours'

const box = { minX: 0, minY: 0, maxX: 10, maxY: 5 }

describe('rectDistance', () => {
  it('is 0 for touching or overlapping rectangles', () => {
    expect(rectDistance(box, { minX: 10, minY: 0, maxX: 20, maxY: 5 })).toBe(0)
    expect(rectDistance(box, { minX: 5, minY: 2, maxX: 20, maxY: 3 })).toBe(0)
  })

  it('measures side and corner gaps', () => {
    expect(rectDistance(box, { minX: 13, minY: 1, maxX: 20, maxY: 2 })).toBe(3)
    expect(rectDistance(box, { minX: 13, minY: 9, maxX: 20, maxY: 12 })).toBe(5)
  })
})

describe('segmentRectDistance', () => {
  it('is 0 for a segment crossing or inside the rectangle', () => {
    expect(segmentRectDistance({ x: -5, y: 2 }, { x: 15, y: 2 }, box)).toBe(0)
    expect(segmentRectDistance({ x: 2, y: 2 }, { x: 3, y: 3 }, box)).toBe(0)
    expect(segmentRectDistance({ x: -1, y: 3 }, { x: 3, y: 7 }, box)).toBe(0)
  })

  it('measures from the nearest endpoint or corner', () => {
    expect(segmentRectDistance({ x: 12, y: 0 }, { x: 12, y: 5 }, box)).toBe(2)
    expect(segmentRectDistance({ x: 13, y: 9 }, { x: 13, y: 9 }, box)).toBe(5)
    // diagonal segment passing the (10, 5) corner at distance √2
    expect(segmentRectDistance({ x: 10, y: 9 }, { x: 14, y: 5 }, box)).toBeCloseTo(2 * Math.SQRT2, 9)
    expect(segmentRectDistance({ x: 12, y: 7 }, { x: 14, y: 5 }, box)).toBeCloseTo(Math.hypot(2, 2), 9)
  })

  it('handles segments that miss diagonally past a corner', () => {
    // line x + y = 17 runs past corner (10, 5) at distance 2/√2 = √2
    expect(segmentRectDistance({ x: 7, y: 10 }, { x: 17, y: 0 }, box)).toBeCloseTo(Math.SQRT2, 9)
  })
})
