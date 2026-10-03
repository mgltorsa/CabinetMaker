/**
 * Drawing audit over real engine output: every preset in every style. Nothing
 * may fall outside a drawing's bounds (it would be clipped on screen and in
 * the PDF), no NaN may reach the SVG, and the dimensions must state the true
 * cabinet sizes.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import type { ConstructionStyle, Drawing, Shape, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'
import { buildCabinet } from '@/engine'
import { createPreset, PRESETS } from '@/engine/presets'
import { frontElevation, panelDetail, renderSvg, sideElevation } from '.'
import { synthesizedTop } from './front-elevation'

const STYLES: ConstructionStyle[] = ['frameless-overlay', 'frameless-inset', 'face-frame-overlay', 'face-frame-inset']
const TOL = 0.5

function points(s: Shape): [number, number][] {
  switch (s.type) {
    case 'line':
      return [
        [s.x1, s.y1],
        [s.x2, s.y2],
      ]
    case 'rect':
      return [
        [s.x, s.y],
        [s.x + s.w, s.y + s.h],
      ]
    case 'circle':
      return [
        [s.cx - s.r, s.cy - s.r],
        [s.cx + s.r, s.cy + s.r],
      ]
    case 'polyline':
      return s.points.map((p) => [p.x, p.y])
    case 'text':
      return [[s.x, s.y]]
    case 'dim':
      return [
        [s.x1, s.y1],
        [s.x2, s.y2],
      ]
  }
}

function expectInside(d: Drawing): void {
  const b = d.bounds
  for (const s of d.shapes) {
    for (const [x, y] of points(s)) {
      expect(Number.isFinite(x) && Number.isFinite(y), `${d.id} ${s.type} finite`).toBe(true)
      expect(x, `${d.id} ${s.type} x`).toBeGreaterThanOrEqual(b.minX - TOL)
      expect(x, `${d.id} ${s.type} x`).toBeLessThanOrEqual(b.maxX + TOL)
      expect(y, `${d.id} ${s.type} y`).toBeGreaterThanOrEqual(b.minY - TOL)
      expect(y, `${d.id} ${s.type} y`).toBeLessThanOrEqual(b.maxY + TOL)
    }
  }
}

/** Dimensions drawn on the same line (same axis, base and offset) must not overlap: their labels would overprint. */
function expectNoOverlappingDims(d: Drawing): void {
  const dims = d.shapes.filter((s): s is Extract<Shape, { type: 'dim' }> => s.type === 'dim')
  const key = (s: Extract<Shape, { type: 'dim' }>): string | null => {
    const vertical = Math.abs(s.x1 - s.x2) < 1e-6
    const horizontal = Math.abs(s.y1 - s.y2) < 1e-6
    if (vertical) return `v:${s.x1.toFixed(2)}:${s.offset.toFixed(2)}`
    if (horizontal) return `h:${s.y1.toFixed(2)}:${s.offset.toFixed(2)}`
    return null
  }
  const span = (s: Extract<Shape, { type: 'dim' }>): [number, number] =>
    Math.abs(s.x1 - s.x2) < 1e-6 ? [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)] : [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]
  for (let i = 0; i < dims.length; i++) {
    for (let j = i + 1; j < dims.length; j++) {
      const a = dims[i]!
      const b = dims[j]!
      const ka = key(a)
      if (ka === null || ka !== key(b)) continue
      const [a0, a1] = span(a)
      const [b0, b1] = span(b)
      const overlap = Math.min(a1, b1) - Math.max(a0, b0)
      expect(overlap, `${d.id}: dims ${a.label ?? ''} and ${b.label ?? ''} overprint`).toBeLessThan(0.5)
    }
  }
}

function expectCleanSvg(d: Drawing, units: UnitSystem): void {
  const svg = renderSvg(d, { units })
  expect(svg, d.id).not.toMatch(/NaN|undefined|Infinity/)
  expect(svg.startsWith('<svg'), d.id).toBe(true)
}

const dimLabels = (d: Drawing, units: UnitSystem): string[] =>
  d.shapes.filter((s): s is Extract<Shape, { type: 'dim' }> => s.type === 'dim').map((s) => s.label ?? formatLength(Math.hypot(s.x2 - s.x1, s.y2 - s.y1), units))

describe.each(PRESETS.flatMap((p) => STYLES.map((style) => [p.type, style] as const)))('drawings for %s / %s', (type, style) => {
  const cabinet = createPreset(type)
  cabinet.id = 'cab'
  cabinet.construction.style = style
  const build = buildCabinet(cabinet, { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE })

  it.each(['metric', 'imperial'] as const)('front and side elevations stay in bounds and state W, H, D (%s)', (units) => {
    const front = frontElevation(cabinet, build, units)
    const side = sideElevation(cabinet, build, units)
    for (const d of [front, side]) {
      expectInside(d)
      expectNoOverlappingDims(d)
      expectCleanSvg(d, units)
    }
    expect(dimLabels(front, units)).toEqual(expect.arrayContaining([formatLength(cabinet.width, units), formatLength(cabinet.height, units)]))
    expect(dimLabels(side, units)).toEqual(expect.arrayContaining([formatLength(cabinet.depth, units), formatLength(cabinet.height, units)]))
  })

  it('adds an overall dimension exactly when something projects past the box, and the mounting height when hung', () => {
    const front = dimLabels(frontElevation(cabinet, build, 'metric'), 'metric')
    const side = dimLabels(sideElevation(cabinet, build, 'metric'), 'metric')
    // A countertop supplied separately is not cut but is drawn (and counts for overall size).
    const supplied = synthesizedTop(cabinet, build.parts)
    const parts = supplied ? [...build.parts, supplied] : build.parts
    const projectsInFront = parts.some((p) => p.bounds.max.z > cabinet.depth + 0.05)
    const above = parts.some((p) => p.bounds.max.y > cabinet.floorHeight + cabinet.height + 0.05)
    expect(side.some((l) => l.endsWith('overall')), 'side overall').toBe(projectsInFront || above)
    const wider = parts.some((p) => p.bounds.min.x < -0.05 || p.bounds.max.x > cabinet.width + 0.05)
    expect(front.some((l) => l.endsWith('overall')), 'front overall').toBe(above || wider)
    for (const d of [frontElevation(cabinet, build, 'metric'), sideElevation(cabinet, build, 'metric')]) {
      const note = d.shapes.some((s) => s.type === 'text' && s.text === `Bottom ${formatLength(cabinet.floorHeight, 'metric')} above floor`)
      expect(note, `${d.id} mounting height note`).toBe(cabinet.floorHeight > 0)
      // Hung cabinets are drawn without the floor, so the cabinet fills the frame.
      if (cabinet.floorHeight > 0) expect(d.bounds.minY, `${d.id} not stretched to the floor`).toBeGreaterThan(0)
    }
  })

  it('every panel detail stays in bounds and renders cleanly', () => {
    for (const part of build.parts) {
      const d = panelDetail(part, 'metric')
      expectInside(d)
      expectCleanSvg(d, 'metric')
    }
  })
})
