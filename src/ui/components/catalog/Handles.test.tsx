import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { resolveHandle } from '@/core/handles'
import { fixtureProject } from '@/core/fixtures'
import type { HardwareItem, Project } from '@/core/types'
import { HandlePreview } from './HandlePreview'
import { HardwareCatalog } from './HardwareCatalog'
import { HardwareItemEditor } from './HardwareItemEditor'

const pull = (p: Project, id: string): HardwareItem => p.hardware.find((h) => h.id === id)!

describe('HardwareCatalog: Handles area', () => {
  it('lists every pull under Handles and every other item once, with create and import controls', () => {
    const project = fixtureProject()
    const html = renderToStaticMarkup(<HardwareCatalog project={project} />)
    const pulls = project.hardware.filter((h) => h.kind === 'pull')
    expect(html).toContain('aria-label="Handles"')
    expect(html).toContain(`${pulls.length} types`)
    expect(html).toContain('Add handle')
    expect(html).toContain('Import handle model…')
    expect(html).toContain('aria-label="Import handle model file"')
    for (const h of pulls) expect(html.split(`>${h.name}<`).length - 1).toBe(1)
    expect(html.match(/<li>/g)).toHaveLength(project.hardware.length)
  })

  it('shows each pull with its handle style in the summary', () => {
    const html = renderToStaticMarkup(<HardwareCatalog project={fixtureProject()} />)
    expect(html).toContain('Knob · $3.00')
    expect(html).toContain('J-profile · $6.00')
    expect(html).toContain('Bar pull · $4.00')
  })
})

describe('HardwareItemEditor: handle fields', () => {
  const render = (project: Project, id: string): string => renderToStaticMarkup(<HardwareItemEditor item={pull(project, id)} project={project} isOpen />)

  it('edits a knob: style, diameter, projection and colour, with a preview; no centres', () => {
    const html = render(fixtureProject(), 'pull-knob-30')
    expect(html).toContain('Handle style')
    expect(html).toContain('Knob diameter')
    expect(html).toContain('Projection')
    expect(html).toContain('Handle colour')
    expect(html).toContain('Preview: Knob')
    expect(html).not.toContain('Pull centres')
    expect(html).toMatch(/<option value="knob" selected="">/)
  })

  it('edits cup and edge pulls with their own size labels', () => {
    expect(render(fixtureProject(), 'pull-cup-96')).toContain('Cup height')
    const edge = render(fixtureProject(), 'pull-edge-150')
    expect(edge).toContain('Lip height')
    expect(edge).toContain('Sheet thickness')
    expect(edge).toContain('Pull centres')
  })

  it('offers a model loader on a custom handle', () => {
    const project = fixtureProject()
    project.hardware.push({ id: 'pull-x', kind: 'pull', name: 'Mine', manufacturer: '', sku: '', unitCost: 1, props: { centers: 0 }, handle: { style: 'custom' } })
    const empty = render(project, 'pull-x')
    expect(empty).toContain('Load model…')
    expect(empty).toContain('Screw centres (0 = one)')
    project.hardware[project.hardware.length - 1] = { ...pull(project, 'pull-x'), handle: { style: 'custom', blobId: 'sha256-a', format: 'glb', unit: 'cm', nativeSize: { x: 12, y: 2, z: 3 } } }
    const loaded = render(project, 'pull-x')
    expect(loaded).toContain('Replace model…')
    expect(loaded).toContain('GLB model · 120 × 20 × 30 mm')
    expect(loaded).toContain('Model units')
  })
})

describe('HandlePreview', () => {
  it('draws each style in the handle colour', () => {
    const project = fixtureProject()
    for (const id of ['pull-bar-128', 'pull-knob-30', 'pull-edge-150', 'pull-cup-96', 'pull-j-profile']) {
      const item = pull(project, id)
      const html = renderToStaticMarkup(<HandlePreview handle={{ ...resolveHandle(item), color: '#123456' }} />)
      expect(html).toContain('fill="#123456"')
      expect(html).toContain('role="img"')
    }
  })
})
