import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import type { Drawing, UnitSystem } from '@/core/types'
import { buildCabinet } from '@/engine'
import { createPreset } from '@/engine/presets'
import { editableAnchors, frontElevation, renderSvg, sideElevation } from '.'
import { escapeXml } from './svg'

interface SvgText {
  x: number
  y: number
  rotate: number
  size: number
  text: string
}

/** Every `<text>` element of a rendered SVG with its position, rotation and content. */
function svgTexts(svg: string): SvgText[] {
  const re = /<text x="([-\d.]+)" y="([-\d.]+)" font-size="([-\d.]+)"[^>]*?(?: transform="rotate\(([-\d.]+) [^"]+\)")?>([^<]*)<\/text>/g
  return [...svg.matchAll(re)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), rotate: Number(m[4] ?? 0), text: m[5]! }))
}

function viewBox(svg: string): [number, number, number, number] {
  const m = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg)!
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
}

const tiny: Drawing = {
  id: 'd',
  title: 'Tiny',
  bounds: { minX: -20, minY: -20, maxX: 120, maxY: 70 },
  shapes: [
    { type: 'dim', x1: 0, y1: 0, x2: 100, y2: 0, offset: -10, id: 'width' },
    { type: 'dim', x1: 0, y1: 0, x2: 0, y2: 50, offset: 10, label: '50', id: 'height' },
    { type: 'dim', x1: 0, y1: 0, x2: 0, y2: 50, offset: 20, label: 'not editable' },
    { type: 'text', x: 0, y: -15, text: 'Bottom 1450 above floor', size: 3, anchor: 'start', layer: 'text', id: 'floor-height' },
  ],
}

function expectAnchorsMatchSvg(drawing: Drawing, units: UnitSystem): void {
  const svg = renderSvg(drawing, { units })
  const texts = svgTexts(svg)
  const [vx, vy, vw, vh] = viewBox(svg)
  const anchors = editableAnchors(drawing, { units })
  expect(anchors.length).toBeGreaterThan(0)
  for (const a of anchors) {
    const match = texts.find((t) => Math.abs(t.x - a.x) < 0.01 && Math.abs(t.y - a.y) < 0.01 && t.text === escapeXml(a.text))
    expect(match, `${drawing.id} ${a.id} label in SVG`).toBeDefined()
    expect(match!.rotate).toBeCloseTo(a.rotation, 6)
    expect(match!.size).toBeCloseTo(a.fontSize, 2)
    // The box centre is the label's visual middle, in viewBox fractions.
    const cx = vx + a.box.cx * vw
    const cy = vy + a.box.cy * vh
    expect(Math.hypot(cx - a.x, cy - a.y), `${a.id} centre near the label`).toBeLessThan(a.fontSize + (a.box.w * vw) / 2 + 1e-6)
    expect(a.box.cx).toBeGreaterThan(0)
    expect(a.box.cx).toBeLessThan(1)
    expect(a.box.cy).toBeGreaterThan(0)
    expect(a.box.cy).toBeLessThan(1)
  }
}

describe('editableAnchors', () => {
  it('returns one anchor per tagged dimension or note, in drawing order', () => {
    expect(editableAnchors(tiny, { units: 'metric' }).map((a) => a.id)).toEqual(['width', 'height', 'floor-height'])
  })

  it('places each anchor exactly on the label renderSvg writes (metric and imperial)', () => {
    expectAnchorsMatchSvg(tiny, 'metric')
    expectAnchorsMatchSvg(tiny, 'imperial')
  })

  it('reports vertical labels rotated like the SVG text and centres them beside the dimension line', () => {
    const [width, height] = editableAnchors(tiny, { units: 'metric' })
    expect(width!.rotation).toBe(0)
    expect(height!.rotation).toBe(-90)
    // Text "up" points away from the dimension line (to the left of a vertical dim): centre x < baseline x.
    const svg = renderSvg(tiny, { units: 'metric' })
    const [vx, , vw] = viewBox(svg)
    expect(vx + height!.box.cx * vw).toBeLessThan(height!.x)
  })

  it('centres a start-anchored note on its text', () => {
    const note = editableAnchors(tiny, { units: 'metric' }).find((a) => a.id === 'floor-height')!
    const svg = renderSvg(tiny, { units: 'metric' })
    const [vx, , vw] = viewBox(svg)
    expect(vx + note.box.cx * vw).toBeGreaterThan(note.x)
  })

  it('matches the rendered labels of real elevations', () => {
    for (const type of ['base', 'wall', 'vanity'] as const) {
      const cabinet = createPreset(type)
      const build = buildCabinet(cabinet, { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE })
      for (const units of ['metric', 'imperial'] as const) {
        expectAnchorsMatchSvg(frontElevation(cabinet, build, units), units)
        expectAnchorsMatchSvg(sideElevation(cabinet, build, units), units)
      }
    }
  })

  it('skips degenerate dimensions that the renderer does not draw', () => {
    const d: Drawing = { ...tiny, shapes: [{ type: 'dim', x1: 0, y1: 0, x2: 0, y2: 0, offset: 5, id: 'width' }] }
    expect(editableAnchors(d, { units: 'metric' })).toEqual([])
  })
})
