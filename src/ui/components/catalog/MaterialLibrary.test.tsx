import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Material, Project } from '@/core/types'
import { addMaterial } from '../../projectOps'
import { DeleteMaterialPanel } from './DeleteMaterialPanel'
import { MaterialLibrary, MaterialList } from './MaterialLibrary'
import { MaterialRow } from './MaterialRow'

const material = (p: Project, id: string): Material => p.materials.find((m) => m.id === id)!

/** Text content of the markup, tags stripped (labels and values are separate nodes). */
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('MaterialLibrary', () => {
  it('renders the numbered card with a summary', () => {
    const html = renderToStaticMarkup(<MaterialLibrary project={fixtureProject()} />)
    expect(text(html)).toContain('02·4')
    expect(text(html)).toContain('Material library')
    expect(text(html)).toMatch(/\d+ materials · \d+ sheet, \d+ linear/)
  })

  it('lists materials grouped by kind with add buttons', () => {
    const html = text(renderToStaticMarkup(<MaterialList project={fixtureProject()} />))
    expect(html.indexOf('Sheet goods')).toBeLessThan(html.indexOf('18 mm plywood'))
    expect(html.indexOf('18 mm MDF')).toBeLessThan(html.indexOf('Linear stock'))
    expect(html.indexOf('Linear stock')).toBeLessThan(html.indexOf('Maple 19 × 63 mm'))
    expect(html).toContain('Add sheet material')
    expect(html).toContain('Add linear stock')
    expect(html).toContain('18 mm · 2440 × 1220 mm · grained')
  })
})

describe('MaterialRow', () => {
  it('shows labelled, unit-aware fields for a sheet material', () => {
    const p = fixtureProject()
    const html = renderToStaticMarkup(<MaterialRow project={p} material={material(p, 'ply-18')} defaultOpen onAdded={() => {}} />)
    for (const label of ['Name', 'Thickness', 'Sheet length', 'Sheet width', 'Grained', 'Cost per sheet', 'Colour', 'Colour (hex)']) {
      expect(html).toMatch(new RegExp(`<label[^>]*>${label.replace(/[()]/g, '\\$&')}</label>`))
    }
    expect(html).toContain('value="2440"')
    expect(html).toContain('>USD<')
    expect(html).toContain('type="color"')
    expect(html).toContain('value="#f3f0ea"')
    expect(html).toContain('aria-label="Duplicate 18 mm plywood"')
    expect(html).toContain('aria-label="Delete 18 mm plywood"')
  })

  it('shows linear stock fields', () => {
    const p = fixtureProject()
    const html = renderToStaticMarkup(<MaterialRow project={p} material={material(p, 'maple-19x63')} defaultOpen onAdded={() => {}} />)
    for (const label of ['Board width', 'Stock length', 'Cost per metre']) expect(html).toContain(`>${label}</label>`)
    expect(html).not.toContain('>Grained</label>')
  })

  it('warns inline about a sheet larger than the machine table', () => {
    const p = fixtureProject()
    const big: Material = { ...material(p, 'ply-18'), sheetLength: 3050 } as Material
    const html = renderToStaticMarkup(<MaterialRow project={p} material={big} defaultOpen onAdded={() => {}} />)
    expect(html).toContain('larger than the 2500 × 1250 mm machine table')
  })
})

describe('DeleteMaterialPanel', () => {
  it('blocks deleting a material in use, lists the uses and offers same-kind replacements', () => {
    const p = fixtureProject()
    const html = renderToStaticMarkup(<DeleteMaterialPanel project={p} material={material(p, 'ply-6')} onClose={() => {}} />)
    expect(text(html)).toContain('“6 mm plywood (backs)” is in use')
    expect(text(html)).toContain('Base cabinet: back, drawer bottoms')
    expect(html).toContain('>Replace with</label>')
    expect(html).toContain('<option value="ply-18"')
    expect(html).not.toContain('<option value="ply-6"')
    expect(html).not.toContain('<option value="maple-19x63"')
    expect(text(html)).toContain('Replace and delete')
  })

  it('asks to confirm deleting an unused material', () => {
    const { project, materialId } = addMaterial(fixtureProject(), 'sheet')
    const html = text(renderToStaticMarkup(<DeleteMaterialPanel project={project} material={material(project, materialId!)} onClose={() => {}} />))
    expect(html).toContain('No cabinet uses it')
    expect(html).toContain('Delete material')
  })

  it('explains why the last material of a kind stays', () => {
    const base = fixtureProject()
    // Only one linear material left: the face-frame maple (drop the default rod stock).
    const p = { ...base, cabinets: [], materials: base.materials.filter((m) => m.kind === 'sheet' || m.id === 'maple-19x63') }
    const html = text(renderToStaticMarkup(<DeleteMaterialPanel project={p} material={material(p, 'maple-19x63')} onClose={() => {}} />))
    expect(html).toContain('last linear stock')
  })
})
