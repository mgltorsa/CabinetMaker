import { describe, expect, it } from 'vitest'
import type { Drawing } from '@/core/types'
import { escapeXml, frontElevation, panelDetail, renderSvg, sheetLayout, sideElevation } from '.'
import { num } from './svg'
import { fixtureCabinet, fixtureCabinetBuild, fixtureParts, fixturePartsById, fixtureSheet } from './testing/fixtures'

const tiny: Drawing = {
  id: 'd',
  title: 'Tiny',
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
  shapes: [
    { type: 'rect', x: 0, y: 0, w: 100, h: 50, layer: 'outline' },
    { type: 'line', x1: 0, y1: 0, x2: 100, y2: 50, layer: 'hidden' },
    { type: 'circle', cx: 50, cy: 25, r: 5, layer: 'op' },
    { type: 'polyline', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], closed: true, layer: 'op' },
    { type: 'text', x: 10, y: 40, text: 'Hi', size: 5, anchor: 'start', layer: 'text' },
    { type: 'dim', x1: 0, y1: 0, x2: 100, y2: 0, offset: -10 },
    { type: 'dim', x1: 0, y1: 0, x2: 0, y2: 50, offset: 10, label: 'H' },
  ],
}

describe('renderSvg', () => {
  it('renders a deterministic standalone SVG (snapshot)', () => {
    const svg = renderSvg(tiny, { units: 'imperial', widthPx: 400 })
    expect(svg).toMatchSnapshot()
    expect(renderSvg(tiny, { units: 'imperial', widthPx: 400 })).toBe(svg)
  })

  it('flips Y and uses a viewBox with margin', () => {
    const svg = renderSvg(tiny, { units: 'metric' })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -54 108 58" width="800"')).toBe(true)
    expect(svg).toContain('<circle cx="50" cy="-25" r="5"')
  })

  it('applies non-scaling strokes and dashes per layer', () => {
    const svg = renderSvg(tiny, { units: 'metric' })
    expect(svg).toMatch(/<line [^>]*stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/)
    expect(svg).not.toMatch(/<(line|rect|circle|polygon)(?![^>]*vector-effect)[^>]*stroke=/)
  })

  it('formats unlabeled dims with formatLength and keeps text upright', () => {
    const svg = renderSvg(tiny, { units: 'imperial' })
    expect(svg).toContain('>3 15/16&quot;</text>')
    expect(svg).toMatch(/transform="rotate\(-90 [^"]+\)">H</)
  })

  it('escapes user text and drops invalid XML characters', () => {
    const evil: Drawing = {
      ...tiny,
      title: '</title><script>alert(1)</script>',
      shapes: [
        { type: 'text', x: 0, y: 0, text: `<img src=x onerror="alert('x')"> & \u0001`, size: 5, anchor: 'start', layer: 'text' },
        { type: 'rect', x: 0, y: 0, w: 1, h: 1, layer: 'outline', fill: 'red" onload="alert(1)' },
      ],
    }
    const svg = renderSvg(evil, { units: 'metric' })
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('<img')
    expect(svg).not.toContain('onload="')
    expect(svg).toContain('&lt;img src=x onerror=&quot;alert(&apos;x&apos;)&quot;&gt; &amp; </text>')
    expect(svg).toContain('fill="none"')
  })

  it('escapes cabinet and part names coming from user input', () => {
    const svg = renderSvg(frontElevation(fixtureCabinet(), fixtureCabinetBuild(), 'metric'), { units: 'metric' })
    expect(svg).toContain('<title>Base &lt;cab&gt; &amp; &quot;co&quot; - front elevation</title>')
  })

  it('handles degenerate bounds and non-finite numbers', () => {
    const bad: Drawing = { id: 'x', title: 'x', bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, shapes: [{ type: 'line', x1: NaN, y1: 0, x2: Infinity, y2: 0, layer: 'outline' }] }
    const svg = renderSvg(bad, { units: 'metric', widthPx: 0 })
    expect(svg).not.toMatch(/NaN|Infinity/)
    expect(num(-0.001)).toBe('0')
  })

  it('snapshots each drawing kind for the fixture cabinet', () => {
    const parts = fixtureParts()
    const cab = fixtureCabinet()
    const build = fixtureCabinetBuild()
    const drawings = [
      frontElevation(cab, build, 'imperial'),
      sideElevation(cab, build, 'metric'),
      panelDetail(parts[0]!, 'metric', { materialName: '18 mm plywood' }),
      sheetLayout(fixtureSheet(), fixturePartsById(), 'metric', { edgeTrim: 10 }),
    ]
    drawings.forEach((d) => expect(renderSvg(d, { units: 'metric', widthPx: 600 })).toMatchSnapshot(d.id))
  })
})

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;')
  })
  it('keeps valid astral characters and drops lone surrogates', () => {
    expect(escapeXml('a🪚b')).toBe('a🪚b')
    expect(escapeXml('a\uD800b')).toBe('ab')
  })
})
