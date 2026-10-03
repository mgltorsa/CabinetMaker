import { describe, expect, it } from 'vitest'
import type { Placement, Sheet } from '@/core/types'
import { estimateCutCount } from '.'

function sheet(placements: Placement[]): Sheet {
  return { id: 'm#1', materialId: 'm', index: 1, length: 1000, width: 1000, thickness: 18, placements, yield: 0 }
}

function at(partId: string, x: number, y: number, sizeX: number, sizeY: number): Placement {
  return { partId, x, y, rotated: false, sizeX, sizeY }
}

describe('estimateCutCount', () => {
  it('is zero for an empty sheet', () => {
    expect(estimateCutCount(sheet([]))).toBe(0)
  })

  it('needs four cuts for one part', () => {
    expect(estimateCutCount(sheet([at('a', 10, 10, 200, 100)]))).toBe(4)
  })

  it('shares straight cuts along aligned edges across an empty gap', () => {
    // Same column: left and right edges are one cut each, plus four horizontal edges.
    const column = [at('a', 10, 10, 200, 100), at('b', 10, 116, 200, 100)]
    expect(estimateCutCount(sheet(column))).toBe(6)
  })

  it('shares one cut between edges of parts on the same line', () => {
    // Same row and height: bottom and top edges are one cut each, plus four vertical edges.
    const row = [at('a', 10, 10, 200, 100), at('b', 216, 10, 150, 100)]
    expect(estimateCutCount(sheet(row))).toBe(6)
  })

  it('does not merge edges when the bridging cut would cross another part', () => {
    const blocked = [at('a', 100, 0, 100, 100), at('b', 50, 150, 100, 100), at('c', 100, 300, 100, 100)]
    // Vertical: a/c left edges at x=100 cannot merge (b spans x 50..150). Right edges at x=200 merge.
    // a-left, c-left, a/c-right, b-left, b-right = 5. Horizontal: 6 distinct lines.
    expect(estimateCutCount(sheet(blocked))).toBe(11)
  })
})
