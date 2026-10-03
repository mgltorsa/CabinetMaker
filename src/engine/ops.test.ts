import { describe, expect, it } from 'vitest'
import { box, makePart } from './geometry'
import { attachOps, dadoOp, holeOp, mortiseOp } from './ops'

const side = makePart({
  cabinetId: 'c',
  role: 'side-left',
  name: 'Left side',
  group: 'carcass',
  materialId: 'm',
  grain: 'length',
  bounds: box(0, 18, 0, 720, 0, 560),
  length: '+y',
  faceA: '+x',
})

const bottom = makePart({
  cabinetId: 'c',
  role: 'bottom',
  name: 'Bottom',
  group: 'carcass',
  materialId: 'm',
  grain: 'length',
  bounds: box(18, 582, 0, 18, 0, 560),
  length: '+x',
  faceA: '+y',
})

describe('holeOp', () => {
  it('places a face hole in panel space on face A', () => {
    const { partId, op } = holeOp(side, { x: 18, y: 100, z: 523 }, '+x', { diameter: 5, depth: 12, purpose: 'shelf-pin' })
    expect(partId).toBe('c:side-left')
    expect(op).toMatchObject({ kind: 'hole', face: 'A', x: 100, y: 523, diameter: 5, depth: 12 })
  })

  it('uses along-edge / through-thickness coordinates on edges', () => {
    const { op } = holeOp(bottom, { x: 18, y: 9, z: 50 }, '-x', { diameter: 8, depth: 20, purpose: 'dowel' })
    // bottom frame: x=+x, y = (+y)×(+x) = -z (measured from the front), z=+y.
    expect(op).toMatchObject({ kind: 'hole', face: 'edge-x0', x: 510, y: 9 })
  })
})

describe('dadoOp', () => {
  it('converts both ends of the groove', () => {
    const { op } = dadoOp(side, { x: 18, y: 9, z: 0 }, { x: 18, y: 9, z: 560 }, '+x', { width: 18, depth: 6, purpose: 'dado' })
    expect(op).toMatchObject({ kind: 'dado', face: 'A', x1: 9, y1: 0, x2: 9, y2: 560, width: 18, depth: 6 })
  })
})

describe('mortiseOp', () => {
  it('maps the long axis to the panel axis', () => {
    const face = mortiseOp(side, { x: 18, y: 9, z: 100 }, '+x', 'z', { length: 19, width: 5, depth: 12, purpose: 'domino' })
    expect(face.op).toMatchObject({ kind: 'mortise', face: 'A', axis: 'y', x: 9, y: 100 })
    const edge = mortiseOp(bottom, { x: 18, y: 9, z: 100 }, '-x', 'z', { length: 19, width: 5, depth: 18, purpose: 'domino' })
    expect(edge.op).toMatchObject({ face: 'edge-x0', axis: 'x', x: 460, y: 9 })
  })
})

describe('attachOps', () => {
  it('assigns deterministic unique op ids per part and purpose', () => {
    const a = holeOp(side, { x: 18, y: 100, z: 37 }, '+x', { diameter: 5, depth: 12, purpose: 'shelf-pin' })
    const b = holeOp(side, { x: 18, y: 132, z: 37 }, '+x', { diameter: 5, depth: 12, purpose: 'shelf-pin' })
    const [out] = attachOps([side], [a, b])
    expect(out?.ops.map((o) => o.id)).toEqual(['c:side-left#shelf-pin-1', 'c:side-left#shelf-pin-2'])
    expect(side.ops).toEqual([])
  })

  it('throws when an op targets an unknown part', () => {
    const a = holeOp(side, { x: 18, y: 100, z: 37 }, '+x', { diameter: 5, depth: 12, purpose: 'shelf-pin' })
    expect(() => attachOps([bottom], [a])).toThrow(/unknown part/)
  })
})
