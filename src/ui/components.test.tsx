import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Drawing, Sheet, Toolpath } from '@/core/types'
import { ToolpathPreview } from './cam/ToolpathPreview'
import { DrawingView } from './components/DrawingView'
import { WarningsPanel } from './components/WarningsPanel'

const sheet: Sheet = {
  id: 'ply-18#0',
  materialId: 'ply-18',
  index: 0,
  length: 2440,
  width: 1220,
  thickness: 18,
  placements: [{ partId: 'cab_1:bottom', x: 10, y: 10, rotated: false, sizeX: 564, sizeY: 580 }],
  yield: 0.11,
}

const toolpaths: Toolpath[] = [
  {
    id: 'tp1',
    sheetId: sheet.id,
    partId: 'cab_1:bottom',
    kind: 'profile',
    toolId: 't1',
    passes: [
      [
        { x: 10, y: 10, z: -6 },
        { x: 574, y: 10, z: -6 },
        { x: 574, y: 590, z: -6 },
      ],
    ],
  },
  { id: 'tp2', sheetId: sheet.id, partId: 'cab_1:bottom', kind: 'drill', toolId: 't3', passes: [[{ x: 50, y: 50, z: 0 }, { x: 50, y: 50, z: -12 }]] },
]

describe('ToolpathPreview', () => {
  it('draws cutting passes as polylines, plunges as circles, and a legend by kind', () => {
    const html = renderToStaticMarkup(
      <ToolpathPreview sheet={sheet} toolpaths={toolpaths} partsById={new Map()} tools={fixtureProject().tools} title="Sheet 1" />,
    )
    expect(html.match(/<polyline/g)).toHaveLength(1)
    expect(html.match(/<circle/g)).toHaveLength(1)
    expect(html).toContain('points="10,10 574,10 574,590"')
    expect(html).toContain('viewBox="0 0 2440 1220"')
    expect(html).toMatch(/legend.*profile.*drill/)
  })
})

describe('DrawingView', () => {
  const drawing = (shapes: Drawing['shapes']): Drawing => ({ id: 'd', title: 'Front', bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, shapes })

  it('shows an empty state for a drawing with no shapes', () => {
    const html = renderToStaticMarkup(<DrawingView make={() => drawing([])} units="metric" />)
    expect(html).toContain('No drawing content')
  })

  it('injects the rendered SVG for a drawing with shapes', () => {
    const html = renderToStaticMarkup(<DrawingView make={() => drawing([{ type: 'rect', x: 0, y: 0, w: 10, h: 10, layer: 'outline' }])} units="metric" />)
    expect(html).toContain('<svg')
    expect(html).toContain('role="img"')
  })

  it('reports a drawing that throws instead of crashing', () => {
    const html = renderToStaticMarkup(
      <DrawingView
        make={() => {
          throw new Error('bad bounds')
        }}
        units="metric"
      />,
    )
    expect(html).toContain('Drawing failed')
    expect(html).toContain('bad bounds')
  })
})

describe('WarningsPanel', () => {
  it('lists errors first with the cabinet name', () => {
    const html = renderToStaticMarkup(
      <WarningsPanel
        project={fixtureProject()}
        pipelineError={null}
        warnings={[
          { level: 'info', code: 'a', message: 'Just so you know' },
          { level: 'error', code: 'b', message: 'Drawer too deep', cabinetId: 'cab_1' },
        ]}
      />,
    )
    expect(html.indexOf('Drawer too deep')).toBeLessThan(html.indexOf('Just so you know'))
    expect(html).toContain('Base cabinet:')
    expect(html).toContain('>2<')
  })

  it('shows a pipeline failure', () => {
    const html = renderToStaticMarkup(<WarningsPanel project={fixtureProject()} pipelineError="Unknown material" warnings={[]} />)
    expect(html).toContain('could not be built: Unknown material')
  })
})
