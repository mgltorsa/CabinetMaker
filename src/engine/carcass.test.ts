import { describe, expect, it } from 'vitest'
import { bay, build, part, roles, section, testCabinet } from './testkit'
import { validateBuild } from './validate'

/** 600 × 720 × 560 frameless box, 18 mm carcass, butt/dowel joints, no kick, full top. */
const plainBox = (over: Parameters<typeof testCabinet>[0] = {}) =>
  testCabinet({
    width: 600,
    height: 720,
    depth: 560,
    ...over,
    construction: { joinery: 'dowel', toeKick: { type: 'none', height: 0, setback: 0 }, top: 'full-top', rearNailer: false, ...over.construction },
  })

describe('frameless carcass (hand-computed)', () => {
  const b = build(plainBox())

  it('sizes the sides full height and depth', () => {
    const side = part(b, 'side-left')
    expect([side.length, side.width, side.thickness]).toEqual([720, 560, 18])
    expect(part(b, 'side-right').bounds.min.x).toBe(582)
  })

  it('fits bottom and top between the sides: 600 − 2 × 18 = 564', () => {
    expect(part(b, 'bottom').length).toBe(564)
    expect(part(b, 'bottom').width).toBe(560)
    expect(part(b, 'top').length).toBe(564)
  })

  it('captures the back in 6 mm grooves', () => {
    const back = part(b, 'back')
    expect(back.thickness).toBe(6)
    expect(back.length).toBe(720 - 2 * 18 + 2 * 6)
    expect(back.width).toBe(564 + 2 * 6)
    expect(back.bounds.min.z).toBe(12)
    for (const role of ['side-left', 'side-right', 'bottom', 'top']) {
      const grooves = part(b, role).ops.filter((o) => o.purpose === 'back-groove')
      expect(grooves).toHaveLength(1)
      expect(grooves[0]).toMatchObject({ kind: 'dado', face: 'A', width: 6, depth: 6 })
    }
  })

  it('produces a valid build', () => {
    expect(validateBuild(b)).toEqual([])
  })

  it('updates every dependent part when the width changes (P0 done criterion)', () => {
    const wide = build(plainBox({ width: 800 }))
    expect(part(wide, 'bottom').length).toBe(764)
    expect(part(wide, 'top').length).toBe(764)
    expect(part(wide, 'back').width).toBe(776)
    expect(part(wide, 'side-right').bounds.min.x).toBe(782)
    expect(part(wide, 'side-left')).toEqual(part(b, 'side-left'))
  })
})

describe('carcass options', () => {
  it('lengthens top and bottom into side dados with dado joinery', () => {
    const b = build(plainBox({ construction: { joinery: 'dado' } }))
    expect(part(b, 'bottom').length).toBe(564 + 2 * 6)
    const dados = part(b, 'side-left').ops.filter((o) => o.purpose === 'dado')
    expect(dados).toHaveLength(2)
    expect(dados[0]).toMatchObject({ kind: 'dado', face: 'A', x1: 9, y1: 0, x2: 9, y2: 560, width: 18, depth: 6 })
    expect(validateBuild(b)).toEqual([])
  })

  it('uses front and rear stretchers instead of a full top', () => {
    const b = build(plainBox({ construction: { top: 'stretchers', stretcherWidth: 100 } }))
    expect(roles(b)).not.toContain('top')
    expect(part(b, 'stretcher-front').width).toBe(100)
    expect(part(b, 'stretcher-front').bounds.max.z).toBe(560)
    expect(part(b, 'stretcher-rear').bounds.min.z).toBe(0)
    expect(part(b, 'stretcher-rear').ops.some((o) => o.purpose === 'back-groove')).toBe(true)
    expect(validateBuild(b)).toEqual([])
  })

  it('adds a top rear nailer in front of the back', () => {
    const b = build(plainBox({ construction: { rearNailer: true, nailerWidth: 100 } }))
    const nailer = part(b, 'nailer-top')
    expect(nailer.length).toBe(564)
    expect(nailer.width).toBe(100)
    expect(nailer.bounds.min.z).toBe(18)
    expect(nailer.bounds.max.y).toBe(702)
    expect(roles(b)).not.toContain('nailer-bottom')
  })

  it('adds a bottom nailer on wall and tall cabinets', () => {
    const b = build(plainBox({ type: 'wall', construction: { rearNailer: true } }))
    expect(part(b, 'nailer-bottom').bounds.min.y).toBe(18)
  })

  it('applies the back to the rear edges when not captured', () => {
    const b = build(plainBox({ construction: { back: { construction: 'applied', grooveDepth: 6, inset: 12 } } }))
    const back = part(b, 'back')
    expect([back.length, back.width]).toEqual([720, 600])
    expect(back.bounds.min.z).toBe(0)
    expect(part(b, 'side-left').width).toBe(554)
    expect(part(b, 'side-left').ops.filter((o) => o.purpose === 'back-groove')).toEqual([])
  })

  it('splits the interior with dividers between sections', () => {
    const b = build(plainBox({ sections: [section([bay('open')], 300), section([bay('open')])] }))
    const div = part(b, 'divider-1')
    expect(div.bounds.min.x).toBe(18 + 300)
    expect(div.thickness).toBe(18)
    expect(div.length).toBe(720 - 36)
    expect(validateBuild(b)).toEqual([])
  })

  it('places the cabinet at its floor height', () => {
    const b = build(plainBox({ type: 'wall', floorHeight: 1450 }))
    expect(part(b, 'side-left').bounds.min.y).toBe(1450)
    expect(part(b, 'side-left').bounds.max.y).toBe(1450 + 720)
  })

  it('gives every part a deterministic `${cabinetId}:${role}` id', () => {
    const b = build(plainBox())
    for (const p of b.parts) expect(p.id).toBe(`cab:${p.role}`)
    expect(build(plainBox())).toEqual(b)
  })
})
