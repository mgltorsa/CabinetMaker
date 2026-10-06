import { describe, expect, it } from 'vitest'
import { compareScores, MaxRectsBin, type FitHeuristic } from './maxrects'

const HEURISTICS: readonly FitHeuristic[] = ['best-short-side', 'best-area', 'bottom-left']

describe('MaxRectsBin', () => {
  it('starts with one free rect covering the whole bin', () => {
    const bin = new MaxRectsBin(100, 50)
    expect(bin.freeRects).toEqual([{ x: 0, y: 0, w: 100, h: 50 }])
  })

  it.each(HEURISTICS)('places the first rect at the origin (%s)', (heuristic) => {
    const bin = new MaxRectsBin(100, 50)
    const found = bin.findPosition([{ w: 30, h: 20 }], heuristic)
    expect(found?.rect).toEqual({ x: 0, y: 0, w: 30, h: 20 })
    expect(found?.sizeIndex).toBe(0)
  })

  it('returns null when no size fits', () => {
    const bin = new MaxRectsBin(100, 50)
    expect(bin.findPosition([{ w: 101, h: 10 }, { w: 10, h: 51 }], 'best-short-side')).toBeNull()
  })

  it('accepts an exact fit', () => {
    const bin = new MaxRectsBin(100, 50)
    expect(bin.findPosition([{ w: 100, h: 50 }], 'best-area')?.rect).toEqual({ x: 0, y: 0, w: 100, h: 50 })
  })

  it('picks the size (orientation) that fits', () => {
    const bin = new MaxRectsBin(100, 50)
    const found = bin.findPosition([{ w: 60, h: 90 }, { w: 90, h: 60 }, { w: 90, h: 40 }], 'best-short-side')
    expect(found?.sizeIndex).toBe(2)
  })

  it('splits free space after placing and keeps maximal rects only', () => {
    const bin = new MaxRectsBin(100, 50)
    bin.place({ x: 0, y: 0, w: 30, h: 20 })
    expect(bin.freeRects).toEqual(
      expect.arrayContaining([
        { x: 30, y: 0, w: 70, h: 50 },
        { x: 0, y: 20, w: 100, h: 30 },
      ]),
    )
    expect(bin.freeRects).toHaveLength(2)
  })

  it('fills a bin exactly with four quarters and leaves no free space', () => {
    const bin = new MaxRectsBin(100, 100)
    for (let i = 0; i < 4; i++) {
      const found = bin.findPosition([{ w: 50, h: 50 }], 'bottom-left')
      expect(found).not.toBeNull()
      if (found) bin.place(found.rect)
    }
    expect(bin.freeRects).toEqual([])
    expect(bin.findPosition([{ w: 1, h: 1 }], 'bottom-left')).toBeNull()
  })

  it('best-short-side prefers the tighter slot', () => {
    const bin = new MaxRectsBin(100, 100)
    bin.place({ x: 0, y: 0, w: 60, h: 100 })
    bin.place({ x: 60, y: 0, w: 40, h: 50 })
    // Free: (60,50) 40×50. A 39-wide rect fits with 1 mm leftover on the short side.
    const found = bin.findPosition([{ w: 39, h: 10 }], 'best-short-side')
    expect(found?.rect.x).toBe(60)
    expect(found?.rect.y).toBe(50)
  })

  it('bottom-left prefers the lowest top edge', () => {
    const bin = new MaxRectsBin(100, 100)
    bin.place({ x: 0, y: 0, w: 50, h: 80 })
    const found = bin.findPosition([{ w: 40, h: 10 }], 'bottom-left')
    expect(found?.rect).toEqual({ x: 50, y: 0, w: 40, h: 10 })
  })
})

describe('compareScores', () => {
  it('orders by primary then secondary', () => {
    expect(compareScores({ primary: 1, secondary: 9 }, { primary: 2, secondary: 0 })).toBeLessThan(0)
    expect(compareScores({ primary: 2, secondary: 1 }, { primary: 2, secondary: 3 })).toBeLessThan(0)
    expect(compareScores({ primary: 2, secondary: 3 }, { primary: 2, secondary: 3 })).toBe(0)
  })
})
