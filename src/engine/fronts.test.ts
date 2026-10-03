import { describe, expect, it } from 'vitest'
import type { HoleOp } from '@/core/types'
import { bay, build, part, roles, section, testCabinet, usage, warningCodes } from './testkit'
import { validateBuild } from './validate'

// Default construction: 18 mm carcass, 18 mm MDF fronts, panel toe kick 100 mm,
// reveals edge 1.5 / between 3, captured back (inset 12 + 6 mm), rear nailer.
// 600 × 870 × 580 ⇒ carcass box from y = 100 to 870 (770 mm).

describe('doors (frameless overlay)', () => {
  it('sizes a single door from the box minus edge reveals', () => {
    const b = build(testCabinet({ sections: [section([bay('door')])] }))
    const door = part(b, 'door-1-1')
    expect(door.length).toBe(770 - 3) // height, grain vertical
    expect(door.width).toBe(600 - 3)
    expect(door.bounds.min.z).toBe(580)
    expect(door.bounds.max.z).toBe(598)
  })

  it('splits a pair with the between reveal', () => {
    const b = build(testCabinet({ sections: [section([bay('door', null, { doorCount: 2 })])] }))
    expect(part(b, 'door-1-1-1').width).toBe((597 - 3) / 2)
    expect(part(b, 'door-1-1-2').width).toBe((597 - 3) / 2)
    expect(part(b, 'door-1-1-2').bounds.min.x).toBe(1.5 + 297 + 3)
  })

  it('stacks a 150 drawer front over the door with a 3 mm gap', () => {
    const b = build(testCabinet({ sections: [section([bay('drawer', 150), bay('door')])] }))
    expect(part(b, 'drawer-front-1-1').width).toBe(150)
    expect(part(b, 'drawer-front-1-1').bounds.max.y).toBe(870 - 1.5)
    expect(part(b, 'door-1-2').length).toBe(767 - 150 - 3)
  })

  it('bores 35 mm hinge cups on the inside face (face A) of the door', () => {
    const b = build(testCabinet({ sections: [section([bay('door', null, { hingeSide: 'left' })])] }))
    const cups = part(b, 'door-1-1').ops.filter((o): o is HoleOp => o.purpose === 'hinge-cup')
    expect(cups).toHaveLength(2)
    for (const c of cups) {
      expect(c).toMatchObject({ kind: 'hole', face: 'A', diameter: 35, depth: 13 })
      expect(c.y).toBe(4 + 17.5) // Blum TB 4 mm from the hinge edge
    }
    expect(cups.map((c) => c.x).sort((a, z) => a - z)).toEqual([100, 767 - 100])
  })

  it('puts right-hand hinge cups near the right edge', () => {
    const b = build(testCabinet({ sections: [section([bay('door', null, { hingeSide: 'right' })])] }))
    const door = part(b, 'door-1-1')
    const cup = door.ops.find((o): o is HoleOp => o.purpose === 'hinge-cup')
    expect(cup?.y).toBe(door.width - 21.5)
  })

  it('drills hinge mounting-plate holes on the hinge-side carcass panel', () => {
    const b = build(testCabinet({ sections: [section([bay('door')])] }))
    const plates = part(b, 'side-left').ops.filter((o): o is HoleOp => o.purpose === 'hinge-plate')
    expect(plates).toHaveLength(4)
    for (const h of plates) expect(h).toMatchObject({ face: 'A', y: 580 - 37 })
    expect(part(b, 'side-right').ops.some((o) => o.purpose === 'hinge-plate')).toBe(false)
  })

  it.each([
    [800, 2],
    [1200, 3],
    [2000, 4],
  ])('uses the hinge count for a %i mm cabinet', (height, count) => {
    const b = build(testCabinet({ height: height + 100 + 3, sections: [section([bay('door')])] }))
    const door = part(b, 'door-1-1')
    expect(door.length).toBe(height)
    expect(door.ops.filter((o) => o.purpose === 'hinge-cup')).toHaveLength(count)
    expect(usage(b, 'blum-cliptop-110')).toBe(count)
    expect(usage(b, 'blum-plate-0')).toBe(count)
  })

  it('drills pull holes through the door and counts one pull per door', () => {
    const b = build(testCabinet({ sections: [section([bay('door', null, { doorCount: 2 })])] }))
    const pulls = part(b, 'door-1-1-1').ops.filter((o) => o.purpose === 'pull')
    expect(pulls).toHaveLength(2)
    expect(pulls[0]).toMatchObject({ face: 'A', depth: 18, diameter: 5 })
    expect(usage(b, 'pull-bar-128')).toBe(2)
  })

  it('omits pulls when the cabinet has none', () => {
    const b = build(testCabinet({ hardware: { hingeId: 'blum-cliptop-110', slideId: 'blum-tandem-533', pullId: null, shelfPinId: 'pin-5' }, sections: [section([bay('door')])] }))
    expect(part(b, 'door-1-1').ops.some((o) => o.purpose === 'pull')).toBe(false)
    expect(usage(b, 'pull-bar-128')).toBe(0)
  })
})

describe('drawers', () => {
  const bank = testCabinet({ type: 'drawer-bank', sections: [section([bay('drawer'), bay('drawer'), bay('drawer')])] })
  const b = build(bank)

  it('emits 3 fronts and 3 five-part boxes for a 3-drawer bank (P1 done criterion)', () => {
    expect(b.parts.filter((p) => p.role.startsWith('drawer-front-'))).toHaveLength(3)
    expect(b.parts.filter((p) => p.group === 'drawer-box')).toHaveLength(15)
    for (const i of [1, 2, 3]) {
      for (const r of ['side-left', 'side-right', 'front', 'back', 'bottom']) expect(roles(b)).toContain(`drawer-1-${i}-${r}`)
    }
  })

  it('shares the front height equally: (767 − 2 × 3) / 3', () => {
    expect(part(b, 'drawer-front-1-2').width).toBeCloseTo(761 / 3, 2)
  })

  it('picks the longest slide that fits: 580 − (12 + 6 back) − 18 nailer − 10 clearance = 534 ⇒ 533', () => {
    expect(usage(b, 'blum-tandem-533')).toBe(3)
    expect(part(b, 'drawer-1-1-side-left').length).toBe(533)
  })

  it('sizes boxes from Blum undermount clearances', () => {
    const side = part(b, 'drawer-1-1-side-left')
    const right = part(b, 'drawer-1-1-side-right')
    expect(right.bounds.max.x - side.bounds.min.x).toBe(564 - 10)
    const bottom = part(b, 'drawer-1-1-bottom')
    expect(bottom.bounds.min.y - side.bounds.min.y).toBe(13)
  })

  it('grooves box sides, front and back for the bottom', () => {
    for (const r of ['side-left', 'side-right', 'front', 'back']) {
      expect(part(b, `drawer-1-1-${r}`).ops.filter((o) => o.purpose === 'bottom-groove')).toHaveLength(1)
    }
  })

  it('drills runner holes on both carcass sides', () => {
    expect(part(b, 'side-left').ops.filter((o) => o.purpose === 'slide').length).toBeGreaterThanOrEqual(6)
    expect(part(b, 'side-right').ops.filter((o) => o.purpose === 'slide').length).toBeGreaterThanOrEqual(6)
  })

  it('validates', () => {
    expect(validateBuild(b)).toEqual([])
  })

  it('warns and skips boxes when no slide fits', () => {
    const shallow = build(testCabinet({ depth: 200, sections: [section([bay('drawer')])] }))
    expect(warningCodes(shallow)).toContain('no-slide-fits')
    expect(shallow.parts.some((p) => p.group === 'drawer-box')).toBe(false)
    expect(roles(shallow)).toContain('drawer-front-1-1')
  })

  it('uses two pulls on drawers wider than 600 mm', () => {
    const wide = build(testCabinet({ width: 900, sections: [section([bay('drawer')])] }))
    expect(usage(wide, 'pull-bar-128')).toBe(2)
    expect(part(wide, 'drawer-front-1-1').ops.filter((o) => o.purpose === 'pull')).toHaveLength(4)
  })

  it('uses dowels for drawer-box corners when asked', () => {
    const dow = build(testCabinet({ construction: { drawer: { slideMount: 'undermount', joinery: 'dowel', rearClearance: 10 } }, sections: [section([bay('drawer')])] }))
    expect(part(dow, 'drawer-1-1-side-left').ops.filter((o) => o.purpose === 'dowel').length).toBeGreaterThan(0)
    expect(part(dow, 'drawer-1-1-front').ops.some((o) => o.purpose === 'dowel' && o.face.startsWith('edge'))).toBe(true)
    expect(validateBuild(dow)).toEqual([])
  })
})

describe('inset fronts', () => {
  it('insets doors into the opening with the edge reveal all round', () => {
    const b = build(testCabinet({ construction: { style: 'frameless-inset' }, sections: [section([bay('door')])] }))
    const door = part(b, 'door-1-1')
    expect(door.length).toBe(770 - 36 - 3)
    expect(door.width).toBe(564 - 3)
    expect(door.bounds.max.z).toBe(580)
    expect(validateBuild(b)).toEqual([])
  })

  it('adds a fixed partition between inset bays', () => {
    const b = build(testCabinet({ construction: { style: 'frameless-inset' }, sections: [section([bay('drawer', 150), bay('door')])] }))
    const p = part(b, 'partition-1-1')
    expect(p.bounds.max.y).toBe(870 - 18 - 150)
    expect(part(b, 'drawer-front-1-1').width).toBe(150 - 3)
    expect(validateBuild(b)).toEqual([])
  })
})
