import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { duplicateHardwareItem } from '../../costOps'
import { HardwareCatalog } from './HardwareCatalog'
import { HardwareItemEditor } from './HardwareItemEditor'

const item = (id: string) => fixtureProject().hardware.find((h) => h.id === id)!

describe('HardwareCatalog', () => {
  it('lists every catalog item with its kind and unit cost', () => {
    const project = fixtureProject()
    const html = renderToStaticMarkup(<HardwareCatalog project={project} />)
    expect(html.match(/<li>/g)).toHaveLength(project.hardware.length)
    expect(html).toContain('Concealed hinge 110°, full overlay')
    expect(html).toContain('Hinge · $6.50')
    expect(html).toContain(`All kinds (${project.hardware.length})`)
  })
})

describe('HardwareItemEditor', () => {
  it('offers delete for an unused item', () => {
    const html = renderToStaticMarkup(<HardwareItemEditor item={item('dowel-8x30')} project={fixtureProject()} isOpen />)
    expect(html).toContain('Delete')
    expect(html).not.toContain('Replace with')
    expect(html).toContain('diameter 8 · length 30')
  })

  it('locks the kind and offers "Replace with…" instead of delete for an item a cabinet uses', () => {
    const { project } = duplicateHardwareItem(fixtureProject(), 'blum-cliptop-110')
    const html = renderToStaticMarkup(<HardwareItemEditor item={item('blum-cliptop-110')} project={project} isOpen />)
    expect(html).toContain('Used by Base cabinet (hinge)')
    expect(html).toContain('Replace with')
    expect(html).toContain('Concealed hinge 110°, full overlay copy (Blum CLIP top 71B3550)')
    expect(html).not.toMatch(/<\/svg>Delete<\/button>/)
    expect(html).toMatch(/<option value="pull" disabled="">/)
    expect(html).toContain('Opening angle')
  })

  it('asks for another item of the kind when none can take over', () => {
    const html = renderToStaticMarkup(<HardwareItemEditor item={item('blum-cliptop-110')} project={fixtureProject()} isOpen />)
    expect(html).toContain('Add or duplicate another hinge first.')
    expect(html).not.toContain('Replace with')
  })

  it('offers "No pull" as a replacement for a pull and edits slide length and mount', () => {
    const pull = renderToStaticMarkup(<HardwareItemEditor item={item('pull-bar-128')} project={fixtureProject()} isOpen />)
    expect(pull).toContain('No pull')
    expect(pull).toContain('Pull centres')
    const slide = renderToStaticMarkup(<HardwareItemEditor item={item('bb-side-400')} project={fixtureProject()} isOpen />)
    expect(slide).toContain('Slide length')
    expect(slide).toMatch(/<option value="side-mount" selected="">/)
  })
})
