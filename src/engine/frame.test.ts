import { describe, expect, it } from 'vitest'
import { box } from './geometry'
import { cabinetToPanel, cross, faceForNormal, frameFrom, negate, panelToCabinet } from './frame'

describe('cross', () => {
  it('follows the right-hand rule for positive axes', () => {
    expect(cross('+x', '+y')).toBe('+z')
    expect(cross('+y', '+z')).toBe('+x')
    expect(cross('+z', '+x')).toBe('+y')
  })

  it('is anti-commutative and respects signs', () => {
    expect(cross('+y', '+x')).toBe('-z')
    expect(cross('-x', '+y')).toBe('-z')
    expect(cross('-z', '-x')).toBe('+y')
  })

  it('throws for parallel axes', () => {
    expect(() => cross('+x', '-x')).toThrow()
  })
})

describe('frameFrom', () => {
  it('derives a right-handed frame from length direction and face A normal', () => {
    expect(frameFrom('+y', '+x')).toEqual({ x: '+y', y: '+z', z: '+x' })
    expect(frameFrom('+y', '-x')).toEqual({ x: '+y', y: '-z', z: '-x' })
    expect(frameFrom('+y', '-z')).toEqual({ x: '+y', y: '+x', z: '-z' })
  })
})

describe('panel transforms', () => {
  // Right side of a 600 wide, 720 tall, 560 deep box, face A pointing inward (-X).
  const part = { bounds: box(582, 600, 0, 720, 0, 560), frame: frameFrom('+y', '-x') }

  it('maps the inside face to z = thickness and measures y from the front edge', () => {
    const p = cabinetToPanel(part, { x: 582, y: 100, z: 523 })
    expect(p).toEqual({ x: 100, y: 37, z: 18 })
  })

  it('round-trips between cabinet and panel space', () => {
    const c = { x: 590, y: 333, z: 44 }
    expect(panelToCabinet(part, cabinetToPanel(part, c))).toEqual(c)
  })
})

describe('faceForNormal', () => {
  const frame = frameFrom('+y', '+x')

  it('names broad faces from the face A normal', () => {
    expect(faceForNormal(frame, '+x')).toBe('A')
    expect(faceForNormal(frame, '-x')).toBe('B')
  })

  it('names edges from the in-plane axes', () => {
    expect(faceForNormal(frame, '-y')).toBe('edge-x0')
    expect(faceForNormal(frame, '+y')).toBe('edge-x1')
    expect(faceForNormal(frame, '-z')).toBe('edge-y0')
    expect(faceForNormal(frame, '+z')).toBe('edge-y1')
  })

  it('negates signed axes', () => {
    expect(negate('+x')).toBe('-x')
    expect(negate('-z')).toBe('+z')
  })
})
