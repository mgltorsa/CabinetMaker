import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Cabinet } from '@/core/types'
import { createPreset } from '@/engine/presets'
import { LayoutEditor } from './components/sidebar/LayoutEditor'
import { materialOptions, rodMaterialOptions } from './lib/options'
import { rodCount, shelvesAndRodsSummary } from './lib/summaries'

function wardrobe(): Cabinet {
  return { ...createPreset('wardrobe'), id: 'cab_w' }
}

function withoutRods(cab: Cabinet): Cabinet {
  return { ...cab, sections: cab.sections.map((s) => ({ ...s, bays: s.bays.map((b) => ({ ...b, rod: undefined })) })) }
}

describe('rod summaries', () => {
  it('counts rods in door/open bays only', () => {
    const cab = wardrobe()
    expect(rodCount(cab)).toBe(1)
    const drawer = { ...cab, sections: cab.sections.map((s) => ({ ...s, bays: s.bays.map((b) => ({ ...b, kind: 'drawer' as const })) })) }
    expect(rodCount(drawer)).toBe(0)
  })

  it('adds the rod count to the shelves card summary', () => {
    expect(shelvesAndRodsSummary(wardrobe())).toBe('1 shelf · 1 rod')
    expect(shelvesAndRodsSummary(withoutRods(wardrobe()))).toBe('1 shelf')
    const rodOnly = { ...wardrobe(), sections: wardrobe().sections.map((s) => ({ ...s, bays: s.bays.map((b) => ({ ...b, shelfCount: 0 })) })) }
    expect(shelvesAndRodsSummary(rodOnly)).toBe('1 rod')
    expect(shelvesAndRodsSummary(withoutRods(rodOnly))).toBe('None')
  })
})

describe('rod material options', () => {
  it('offers round stock for rods and keeps it out of the face-frame stock list', () => {
    const project = fixtureProject()
    expect(rodMaterialOptions(project).map((o) => o.value)).toEqual(['rod-25-chrome'])
    expect(materialOptions(project, 'linear').map((o) => o.value)).toEqual(['maple-19x63'])
  })
})

describe('LayoutEditor: hanging rod', () => {
  it('shows the rod switch on, with the drop from top, for a rod bay', () => {
    const html = renderToStaticMarkup(<LayoutEditor cabinet={wardrobe()} units="metric" />)
    expect(html).toContain('Bay 1 hanging rod')
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/)
    expect(html).toContain('Bay 1 rod drop from top')
    expect(html).toContain('value="350"')
    expect(html).toContain('data-rod="true"')
  })

  it('hides the drop input when the bay has no rod', () => {
    const html = renderToStaticMarkup(<LayoutEditor cabinet={withoutRods(wardrobe())} units="metric" />)
    expect(html).toContain('Bay 1 hanging rod')
    expect(html).not.toContain('Bay 1 rod drop from top')
    expect(html).not.toContain('data-rod="true"')
  })

  it('offers no rod on a drawer bay', () => {
    const cab = fixtureProject().cabinets[0]!
    expect(renderToStaticMarkup(<LayoutEditor cabinet={cab} units="metric" />)).not.toContain('hanging rod')
  })
})
