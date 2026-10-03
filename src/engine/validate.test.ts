import { describe, expect, it } from 'vitest'
import type { CabinetBuild, Part } from '@/core/types'
import { build, testCabinet } from './testkit'
import { validateBuild } from './validate'

const base = build(testCabinet({ construction: { joinery: 'dado' } }))

function withPart(b: CabinetBuild, role: string, change: (p: Part) => Part): CabinetBuild {
  return { ...b, parts: b.parts.map((p) => (p.role === role ? change(p) : p)) }
}

function codes(b: CabinetBuild): string[] {
  return validateBuild(b).map((w) => w.code)
}

describe('validateBuild', () => {
  it('accepts a clean build', () => {
    expect(validateBuild(base)).toEqual([])
  })

  it('flags non-positive dimensions', () => {
    expect(codes(withPart(base, 'back', (p) => ({ ...p, width: 0 })))).toContain('non-positive-dimension')
  })

  it('flags duplicate part ids', () => {
    const dup = { ...base, parts: [...base.parts, base.parts[0]!] }
    expect(codes(dup)).toContain('duplicate-part-id')
  })

  it('flags duplicate op ids', () => {
    const changed = withPart(base, 'side-left', (p) => ({ ...p, ops: [...p.ops, p.ops[0]!] }))
    expect(codes(changed)).toContain('duplicate-op-id')
  })

  it('flags ops outside the panel', () => {
    const changed = withPart(base, 'side-left', (p) => ({
      ...p,
      ops: [...p.ops, { id: 'x', kind: 'hole', face: 'A', purpose: 'shelf-pin', x: -5, y: 10, diameter: 5, depth: 12 }],
    }))
    expect(codes(changed)).toContain('op-outside-panel')
  })

  it('flags holes deeper than the panel', () => {
    const changed = withPart(base, 'side-left', (p) => ({
      ...p,
      ops: [...p.ops, { id: 'x', kind: 'hole', face: 'A', purpose: 'shelf-pin', x: 100, y: 100, diameter: 5, depth: 30 }],
    }))
    expect(codes(changed)).toContain('op-too-deep')
  })

  it('flags length/width that disagree with bounds and axes', () => {
    expect(codes(withPart(base, 'bottom', (p) => ({ ...p, length: p.length + 5 })))).toContain('dimension-mismatch')
  })

  it('flags interpenetrating parts', () => {
    const moved = withPart(base, 'back', (p) => ({ ...p, bounds: { min: { ...p.bounds.min, z: 100 }, max: { ...p.bounds.max, z: 106 } } }))
    expect(codes(moved)).toContain('parts-overlap')
  })

  it('accepts overlaps that a dado explains, and flags them once the dado is gone', () => {
    const noDados = withPart(base, 'side-left', (p) => ({ ...p, ops: p.ops.filter((o) => o.purpose !== 'dado') }))
    expect(codes(noDados)).toContain('parts-overlap')
  })
})
