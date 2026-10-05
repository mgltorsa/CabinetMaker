import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import type { Cabinet, CabinetBuild, ConstructionStyle, Mm } from '@/core/types'
import { bayHeightsForFront } from '.'
import { createPreset } from './presets'
import { bay, build, section, testCabinet } from './testkit'

const ctx = { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE }
const STYLES: ConstructionStyle[] = ['frameless-overlay', 'frameless-inset', 'face-frame-overlay', 'face-frame-inset']

/** Height of the (first) front of section `s`, bay `b` (0-based). */
function frontHeight(b: CabinetBuild, s: number, bayIndex: number): Mm | undefined {
  const re = new RegExp(`^(?:door|drawer-front)-${s + 1}-${bayIndex + 1}(?:-\\d+)?$`)
  const p = b.parts.find((x) => x.group === 'front' && re.test(x.role))
  return p ? p.bounds.max.y - p.bounds.min.y : undefined
}

function withHeights(cabinet: Cabinet, s: number, heights: readonly (Mm | null)[]): Cabinet {
  return {
    ...cabinet,
    sections: cabinet.sections.map((sec, i) => (i === s ? { ...sec, bays: sec.bays.map((b, j) => ({ ...b, height: heights[j] ?? null })) } : sec)),
  }
}

/** Set front (s, b) to `target` and rebuild; returns the resulting front height. */
function roundTrip(cabinet: Cabinet, s: number, b: number, target: Mm): Mm | undefined {
  const edit = bayHeightsForFront(cabinet, ctx, s, b, target)
  if (!edit.ok) throw new Error(edit.error)
  return frontHeight(build(withHeights(cabinet, s, edit.heights)), s, b)
}

describe.each(STYLES)('bayHeightsForFront (%s)', (style) => {
  it('makes the drawer front exactly the typed height when a shared bay absorbs the change', () => {
    const cab = testCabinet({ construction: { style }, sections: [section([bay('drawer', 150), bay('door')])] })
    const before = frontHeight(build(cab), 0, 0)!
    expect(roundTrip(cab, 0, 0, before + 37.5)).toBeCloseTo(before + 37.5, 2)
    expect(roundTrip(cab, 0, 0, before - 20)).toBeCloseTo(before - 20, 2)
  })

  it('edits a shared (auto) bay too, turning it into a fixed height', () => {
    const cab = testCabinet({ construction: { style }, sections: [section([bay('drawer', 150), bay('door'), bay('door')])] })
    const edit = bayHeightsForFront(cab, ctx, 0, 1, 300)
    expect(edit.ok).toBe(true)
    if (!edit.ok) return
    expect(edit.heights[1]).not.toBeNull()
    expect(edit.heights[2]).toBeNull()
    expect(frontHeight(build(withHeights(cab, 0, edit.heights)), 0, 1)).toBeCloseTo(300, 2)
  })

  it('takes the change from the neighbouring bay when every bay is fixed, keeping the others', () => {
    const cab = testCabinet({ construction: { style }, sections: [section([bay('drawer', 150), bay('drawer', 200), bay('drawer', 300)])] })
    const original = build(cab)
    const top = frontHeight(original, 0, 0)!
    const edit = bayHeightsForFront(cab, ctx, 0, 1, frontHeight(original, 0, 1)! + 25)
    expect(edit.ok).toBe(true)
    if (!edit.ok) return
    const after = build(withHeights(cab, 0, edit.heights))
    expect(frontHeight(after, 0, 1)).toBeCloseTo(frontHeight(original, 0, 1)! + 25, 2)
    expect(frontHeight(after, 0, 0)).toBeCloseTo(top, 2)
    expect(frontHeight(after, 0, 2)).toBeCloseTo(frontHeight(original, 0, 2)! - 25, 2)
  })

  it('round-trips every editable front of every preset', () => {
    for (const type of ['base', 'tall', 'drawer-bank', 'nightstand', 'dresser', 'vanity'] as const) {
      const preset = createPreset(type)
      const cab = { ...preset, construction: { ...preset.construction, style } }
      const b = build(cab)
      cab.sections.forEach((sec, s) => {
        if (sec.bays.length < 2) return
        sec.bays.forEach((_, j) => {
          const current = frontHeight(b, s, j)
          if (current === undefined) return
          expect(roundTrip(cab, s, j, current + 10), `${type} ${s}.${j}`).toBeCloseTo(current + 10, 2)
        })
      })
    }
  })

  it('rejects a height that leaves no room for the other bays', () => {
    const cab = testCabinet({ construction: { style }, sections: [section([bay('drawer', 150), bay('door')])] })
    const edit = bayHeightsForFront(cab, ctx, 0, 0, 2000)
    expect(edit).toEqual({ ok: false, error: expect.stringMatching(/does not fit/) })
  })
})

describe('bayHeightsForFront: fronts it cannot set', () => {
  it('refuses a front that fills its section (its height follows the cabinet height)', () => {
    const cab = testCabinet({ sections: [section([bay('door')])] })
    expect(bayHeightsForFront(cab, ctx, 0, 0, 500)).toEqual({ ok: false, error: expect.stringMatching(/cabinet height/) })
  })

  it('refuses open bays and unknown indices', () => {
    const cab = testCabinet({ sections: [section([bay('drawer', 150), bay('open')])] })
    expect(bayHeightsForFront(cab, ctx, 0, 1, 300).ok).toBe(false)
    expect(bayHeightsForFront(cab, ctx, 3, 0, 300).ok).toBe(false)
    expect(bayHeightsForFront(cab, ctx, 0, 0, Number.NaN).ok).toBe(false)
  })
})
