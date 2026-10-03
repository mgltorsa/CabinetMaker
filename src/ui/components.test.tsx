import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Drawing, HardwareItem, Project, Sheet, Toolpath } from '@/core/types'
import { CamWarnings, ExportProblems } from './cam/CamNotices'
import { CamSection, toolChoice } from './cam/MachineSettings'
import { ToolpathPreview } from './cam/ToolpathPreview'
import { DrawingView } from './components/DrawingView'
import { WarningsList } from './components/TopBar'
import { slideMountOptions, slideOptions } from './lib/options'

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
    expect(html).toMatch(/<figcaption.*profile.*drill/)
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

describe('WarningsList', () => {
  it('lists errors first with the cabinet name', () => {
    const html = renderToStaticMarkup(
      <WarningsList
        project={fixtureProject()}
        pipelineError={null}
        warnings={[
          { level: 'info', code: 'a', message: 'Just so you know' },
          { level: 'error', code: 'b', message: 'Drawer too deep', cabinetId: 'cab_1' },
        ]}
      />,
    )
    expect(html.indexOf('Drawer too deep')).toBeLessThan(html.indexOf('Just so you know'))
    expect(html).toContain('Base cabinet')
  })

  it('shows a pipeline failure', () => {
    const html = renderToStaticMarkup(<WarningsList project={fixtureProject()} pipelineError="Unknown material" warnings={[]} />)
    expect(html).toContain('could not be built: Unknown material')
  })
})

describe('CamSection', () => {
  const render = (edit: (p: ReturnType<typeof fixtureProject>) => void = () => undefined): string => {
    const project = fixtureProject()
    edit(project)
    return renderToStaticMarkup(<CamSection machine={project.machine} tools={project.tools} units="metric" />)
  }

  it('offers only cutting tools for profile and dado, any tool for drilling', () => {
    const { tools } = fixtureProject()
    expect(toolChoice('Profile', 't1', tools, true).options.map((o) => o.value)).toEqual(['t1', 't2'])
    expect(toolChoice('Dado', 't2', tools, true).options.map((o) => o.value)).toEqual(['t1', 't2'])
    expect(toolChoice('Drill', 't3', tools, false).options.map((o) => o.value)).toEqual(['t1', 't2', 't3'])
  })

  it('flags a drill already chosen as the profile tool', () => {
    const { tools } = fixtureProject()
    const choice = toolChoice('Profile', 't3', tools, true)
    expect(choice.options[0]?.label).toMatch(/\(drill\)$/)
    expect(choice.error).toMatch(/Profile tool T3 5 mm brad-point drill is a drill/)
  })

  it('opens tooling and marks duplicate tool numbers inline', () => {
    const html = render((p) => (p.tools[2]!.number = 1))
    expect(html.match(/T1 is used by another tool/g)).toHaveLength(2)
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2)
  })

  it('no longer shows the unused edge inset', () => {
    expect(render()).not.toContain('Edge inset')
  })
})

describe('CAM notices', () => {
  it('lists blocked sheets with their messages', () => {
    const html = renderToStaticMarkup(
      <ExportProblems problems={[{ label: 'Sheet 1 (ply-18#1) — 18 mm plywood', messages: ['Sheet is larger than the table'] }]} onDismiss={() => undefined} />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('Sheet 1 (ply-18#1)')
    expect(html).toContain('Sheet is larger than the table')
  })

  it('sorts CAM warnings errors first and says they block downloads', () => {
    const html = renderToStaticMarkup(
      <CamWarnings
        warnings={[
          { level: 'info', code: 'a', message: 'Inch output soon' },
          { level: 'error', code: 'b', message: 'Tool missing' },
        ]}
      />,
    )
    expect(html.indexOf('Tool missing')).toBeLessThan(html.indexOf('Inch output soon'))
    expect(html).toContain('block G-code download')
    expect(renderToStaticMarkup(<CamWarnings warnings={[]} />)).toBe('')
  })
})

describe('drawer slide options', () => {
  const sideSlide: HardwareItem = {
    id: 'side-457',
    kind: 'slide',
    name: 'Side-mount slide 457 mm (pair)',
    manufacturer: 'Generic',
    sku: 'SIDE-457',
    unitCost: 15,
    props: { length: 457, mount: 1 },
  }

  /** Fixture with only undermount slides, plus `extra` hardware. */
  const projectWith = (extra: HardwareItem[]): Project => {
    const project = fixtureProject()
    project.hardware = [...project.hardware.filter((h) => h.kind !== 'slide' || h.props.mount === 0), ...extra]
    return project
  }

  it('disables side mount when the catalog has no side-mount slide', () => {
    const side = slideMountOptions(projectWith([]), 'undermount').find((o) => o.value === 'side-mount')
    expect(side?.isDisabled).toBe(true)
  })

  it('enables side mount and lists only slides of the chosen mount', () => {
    const project = projectWith([sideSlide])
    expect(slideMountOptions(project, 'undermount').find((o) => o.value === 'side-mount')?.isDisabled).toBe(false)
    const under = slideOptions(project, 'undermount', 'blum-tandem-533').map((o) => o.value)
    expect(under).toContain('blum-tandem-533')
    expect(under).not.toContain('side-457')
    const side = slideOptions(project, 'side-mount', 'side-457').map((o) => o.value)
    expect(side).toEqual(['side-457'])
  })
})
