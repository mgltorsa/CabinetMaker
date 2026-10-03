import { describe, expect, it } from 'vitest'
import { circleSegments, cleanPass, depthLevels, roundMm } from './geometry'

describe('depthLevels', () => {
  it('splits a depth into equal passes no deeper than stepDown', () => {
    expect(depthLevels(18.3, 6)).toEqual([4.575, 9.15, 13.725, 18.3])
    expect(depthLevels(18, 6)).toEqual([6, 12, 18])
    expect(depthLevels(12, 6)).toEqual([6, 12])
    expect(depthLevels(4, 6)).toEqual([4])
  })

  it('returns no levels for a non-positive depth', () => {
    expect(depthLevels(0, 6)).toEqual([])
    expect(depthLevels(-1, 6)).toEqual([])
  })

  it('rejects a non-positive stepDown', () => {
    expect(() => depthLevels(10, 0)).toThrow(/stepDown/)
  })
})

describe('circleSegments', () => {
  it('keeps the chord error at or below the tolerance', () => {
    for (const r of [0.5, 2, 10, 15, 100]) {
      const n = circleSegments(r, 0.05)
      const sagitta = r * (1 - Math.cos(Math.PI / n))
      expect(sagitta).toBeLessThanOrEqual(0.05)
    }
  })

  it('uses a minimum segment count for tiny radii', () => {
    expect(circleSegments(0.01, 0.05)).toBe(8)
  })
})

describe('roundMm / cleanPass', () => {
  it('rounds to 3 decimals without negative zero', () => {
    expect(roundMm(1.23456)).toBe(1.235)
    expect(Object.is(roundMm(-0.0001), 0)).toBe(true)
  })

  it('rounds points and removes consecutive duplicates', () => {
    const pass = cleanPass([
      { x: 0, y: 0, z: 0 },
      { x: 0.0001, y: 0, z: 0 },
      { x: 1, y: 2.00049, z: -1 },
    ])
    expect(pass).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 2, z: -1 },
    ])
  })
})
