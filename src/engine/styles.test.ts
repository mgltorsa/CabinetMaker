import { describe, expect, it } from 'vitest'
import { bay, build, part, roles, section, testCabinet, warningCodes } from './testkit'
import { validateBuild } from './validate'

describe('face frame', () => {
  const ff = (style: 'face-frame-overlay' | 'face-frame-inset') =>
    build(testCabinet({ construction: { style }, sections: [section([bay('drawer', 150), bay('door')]), section([bay('door', null, { shelfCount: 1 })])] }))

  it('builds stiles, rails and mid-members from linear stock', () => {
    const b = ff('face-frame-overlay')
    const stile = part(b, 'ff-stile-left')
    expect(stile).toMatchObject({ group: 'face-frame', materialId: 'maple-19x63', thickness: 19, width: 38 })
    expect(stile.bounds.min.x).toBe(0)
    expect(part(b, 'ff-stile-right').bounds.max.x).toBe(600)
    expect(stile.bounds.min.z).toBe(580)
    for (const r of ['ff-rail-top', 'ff-rail-bottom', 'ff-mid-stile-1', 'ff-mid-rail-1-1']) expect(roles(b)).toContain(r)
  })

  it('sets the carcass in by the frame overhang', () => {
    const b = ff('face-frame-overlay')
    expect(part(b, 'side-left').bounds.min.x).toBe(3)
    expect(part(b, 'side-right').bounds.max.x).toBe(597)
  })

  it('overlays fronts 1/2" past the frame opening', () => {
    const b = build(testCabinet({ construction: { style: 'face-frame-overlay' }, sections: [section([bay('door')])] }))
    const door = part(b, 'door-1-1')
    expect(door.width).toBeCloseTo(600 - 2 * 38 + 2 * 12.7, 3)
    expect(door.length).toBeCloseTo(770 - 2 * 38 + 2 * 12.7, 3)
    expect(door.bounds.min.z).toBe(599)
  })

  it('insets fronts into the frame opening', () => {
    const b = build(testCabinet({ construction: { style: 'face-frame-inset' }, sections: [section([bay('door')])] }))
    const door = part(b, 'door-1-1')
    expect(door.width).toBe(600 - 2 * 38 - 3)
    expect(door.bounds.max.z).toBe(599)
  })

  it.each(['face-frame-overlay', 'face-frame-inset'] as const)('%s validates', (style) => {
    expect(validateBuild(ff(style))).toEqual([])
  })
})

describe('toe kick', () => {
  it('panel: a separate kick base with a recessed front board', () => {
    const b = build(testCabinet())
    const front = part(b, 'kick-front')
    expect(front.group).toBe('toe-kick')
    expect(front.bounds.max.z).toBe(580 - 75)
    expect(front.bounds.max.y).toBe(100)
    expect(part(b, 'side-left').bounds.min.y).toBe(100)
    expect(roles(b)).toContain('kick-sleeper-1')
    expect(validateBuild(b)).toEqual([])
  })

  it('full: sides run to the floor with a kick board between them', () => {
    const b = build(testCabinet({ construction: { toeKick: { type: 'full', height: 100, setback: 75 } } }))
    expect(part(b, 'side-left').bounds.min.y).toBe(0)
    expect(part(b, 'kick-board').length).toBe(564)
    expect(part(b, 'bottom').bounds.min.y).toBe(100)
    expect(validateBuild(b)).toEqual([])
  })

  it('none: the box sits on the floor', () => {
    const b = build(testCabinet({ construction: { toeKick: { type: 'none', height: 100, setback: 75 } } }))
    expect(b.parts.some((p) => p.group === 'toe-kick')).toBe(false)
    expect(part(b, 'bottom').bounds.min.y).toBe(0)
  })
})

describe('tops', () => {
  it('adds a finished top with overhangs, defaulting to the front material', () => {
    const b = build(testCabinet({ top: { kind: 'finished', materialId: null, thickness: 18, overhangFront: 20, overhangSides: 10 }, sections: [section([bay('door')])] }))
    const top = part(b, 'finished-top')
    expect(top).toMatchObject({ group: 'top', materialId: 'mdf-18', thickness: 18, length: 620 })
    expect(top.bounds.min.y).toBe(870)
    expect(top.bounds.max.z).toBe(598 + 20)
    expect(validateBuild(b)).toEqual([])
  })

  it('adds a countertop from its material', () => {
    const b = build(testCabinet({ top: { kind: 'countertop', materialId: 'ply-18', thickness: 18, overhangFront: 25, overhangSides: 0 } }))
    expect(part(b, 'countertop').width).toBe(580 + 25)
  })

  it('reports a countertop without material as supplied separately', () => {
    const b = build(testCabinet({ top: { kind: 'countertop', materialId: null, thickness: 30, overhangFront: 25, overhangSides: 0 } }))
    expect(roles(b)).not.toContain('countertop')
    expect(warningCodes(b)).toContain('countertop-external')
  })
})

describe('impossible inputs warn instead of throwing', () => {
  it('too narrow', () => {
    const b = build(testCabinet({ width: 30 }))
    expect(b.parts).toEqual([])
    expect(b.warnings[0]).toMatchObject({ level: 'error', code: 'too-narrow', cabinetId: 'cab' })
  })

  it('non-finite dimensions', () => {
    const b = build(testCabinet({ height: Number.NaN }))
    expect(warningCodes(b)).toContain('invalid-dimensions')
  })

  it('unknown material', () => {
    const b = build(testCabinet({ construction: { carcassMaterialId: 'nope' } }))
    expect(b.parts).toEqual([])
    expect(warningCodes(b)).toContain('unknown-material')
  })

  it('bay heights that exceed the opening are scaled with a warning', () => {
    const b = build(testCabinet({ sections: [section([bay('drawer', 500), bay('drawer', 500)])] }))
    expect(warningCodes(b)).toContain('bay-heights-adjusted')
    expect(validateBuild(b)).toEqual([])
  })

  it('section widths that exceed the interior are scaled with a warning', () => {
    const b = build(testCabinet({ sections: [section([bay('open')], 400), section([bay('open')], 400)] }))
    expect(warningCodes(b)).toContain('section-widths-adjusted')
    expect(validateBuild(b)).toEqual([])
  })
})
