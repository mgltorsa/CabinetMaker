import { describe, expect, it } from 'vitest'
import type { HoleOp, MortiseOp } from '@/core/types'
import { bay, build, part, section, testCabinet, usage } from './testkit'
import { validateBuild } from './validate'

// Default 600 × 870 × 580 base: interior y from 100 + 18 = 118 to 870 − 18 = 852,
// interior rear limit 12 + 6 (back) + 18 (nailer) = 36.

describe('adjustable shelves and System 32 pin rows', () => {
  const b = build(testCabinet({ sections: [section([bay('door', null, { shelfCount: 1 })])] }))
  const pins = part(b, 'side-left').ops.filter((o): o is HoleOp => o.purpose === 'shelf-pin')

  it('drills two rows of 5 mm holes at 37 mm setback on the inside face', () => {
    expect(pins.length).toBeGreaterThan(10)
    const rows = [...new Set(pins.map((p) => p.y))].sort((a, z) => a - z)
    expect(rows).toEqual([36 + 37, 580 - 37])
    for (const p of pins) expect(p).toMatchObject({ face: 'A', diameter: 5, depth: 12 })
  })

  it('spaces holes on a 32 mm pitch', () => {
    const xs = [...new Set(pins.map((p) => p.x))].sort((a, z) => a - z)
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBe(32)
  })

  it('mirrors the rows on the right side', () => {
    expect(part(b, 'side-right').ops.filter((o) => o.purpose === 'shelf-pin')).toHaveLength(pins.length)
  })

  it('rests the shelf on a pin hole and clears the sides by 1 mm', () => {
    const shelf = part(b, 'shelf-1-1-1')
    expect([shelf.length, shelf.thickness]).toEqual([562, 18])
    const holeY = shelf.bounds.min.y - 2.5
    expect((holeY - 118) % 32).toBe(0)
    expect(usage(b, 'pin-5')).toBe(4)
  })

  it('drills only the shelf positions when System 32 rows are off', () => {
    const lean = build(testCabinet({ construction: { system32: false }, sections: [section([bay('door', null, { shelfCount: 2 })])] }))
    expect(part(lean, 'side-left').ops.filter((o) => o.purpose === 'shelf-pin')).toHaveLength(4)
    expect(validateBuild(lean)).toEqual([])
  })

  it('validates', () => {
    expect(validateBuild(b)).toEqual([])
  })
})

describe('carcass joinery', () => {
  it('dowels: face holes on the sides, matching edge bores on top/bottom', () => {
    const b = build(testCabinet({ construction: { joinery: 'dowel', top: 'full-top' } }))
    const face = part(b, 'side-left').ops.filter((o) => o.purpose === 'dowel')
    const edge = part(b, 'bottom').ops.filter((o) => o.purpose === 'dowel')
    expect(face.length).toBe(10) // 5 for the bottom + 5 for the top
    expect(face.every((o) => o.face === 'A')).toBe(true)
    expect(edge.length).toBe(10) // both ends
    expect(new Set(edge.map((o) => o.face))).toEqual(new Set(['edge-x0', 'edge-x1']))
    expect(usage(b, 'dowel-8x30')).toBe(20)
    expect(validateBuild(b)).toEqual([])
  })

  it('dominos: mortises on the side face and the mating edge', () => {
    const b = build(testCabinet({ construction: { joinery: 'domino' } }))
    const face = part(b, 'side-left').ops.filter((o): o is MortiseOp => o.purpose === 'domino')
    expect(face.length).toBeGreaterThan(0)
    expect(face[0]).toMatchObject({ kind: 'mortise', face: 'A', width: 5, length: 19, axis: 'y' })
    expect(part(b, 'bottom').ops.some((o) => o.purpose === 'domino' && o.face === 'edge-x0')).toBe(true)
    expect(usage(b, 'domino-5x30')).toBe(face.length * 2)
    expect(validateBuild(b)).toEqual([])
  })

  it('none: no joinery ops', () => {
    const b = build(testCabinet({ construction: { joinery: 'none' } }))
    expect(b.parts.flatMap((p) => p.ops).some((o) => ['dowel', 'domino', 'dado'].includes(o.purpose))).toBe(false)
  })

  it('joins dividers to bottom and top with dados', () => {
    const b = build(testCabinet({ construction: { joinery: 'dado', top: 'full-top' }, sections: [section([bay('open')]), section([bay('open')])] }))
    expect(part(b, 'bottom').ops.filter((o) => o.purpose === 'dado')).toHaveLength(1)
    expect(part(b, 'top').ops.filter((o) => o.purpose === 'dado')).toHaveLength(1)
    expect(validateBuild(b)).toEqual([])
  })
})
