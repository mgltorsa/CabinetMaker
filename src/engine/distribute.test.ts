import { describe, expect, it } from 'vitest'
import { distribute } from './distribute'

describe('distribute', () => {
  it('shares the remaining space equally among null requests', () => {
    expect(distribute([150, null, null], 750, 40)).toEqual({ sizes: [150, 300, 300], status: 'ok' })
  })

  it('accepts fixed sizes that fill the space exactly', () => {
    expect(distribute([100, 200], 300, 40)).toEqual({ sizes: [100, 200], status: 'ok' })
  })

  it('scales fixed sizes when they exceed the space, keeping null slots at the minimum', () => {
    const r = distribute([400, 400, null], 500, 40)
    expect(r.status).toBe('scaled')
    expect(r.sizes[2]).toBe(40)
    expect(r.sizes[0]! + r.sizes[1]!).toBeCloseTo(460)
    expect(r.sizes[0]).toBeCloseTo(r.sizes[1]!)
  })

  it('scales fixed sizes that do not fill the space when there is no null slot', () => {
    const r = distribute([100, 100], 300, 40)
    expect(r.status).toBe('scaled')
    expect(r.sizes[0]! + r.sizes[1]!).toBeCloseTo(300)
  })

  it('treats requests below the minimum as the minimum', () => {
    const r = distribute([0, null], 300, 40)
    expect(r.status).toBe('scaled')
    expect(r.sizes).toEqual([40, 260])
  })

  it('reports impossible when even minimum slots do not fit', () => {
    expect(distribute([null, null], 50, 40).status).toBe('impossible')
  })

  it('returns no sizes for no requests', () => {
    expect(distribute([], 100, 40)).toEqual({ sizes: [], status: 'ok' })
  })
})
