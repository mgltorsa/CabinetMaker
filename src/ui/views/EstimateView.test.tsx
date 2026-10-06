import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { runPipeline } from '@/pipeline'
import { ExtraCharges } from '../components/sidebar/ExtraCharges'
import { EstimateView, totalRows } from './EstimateView'

function commercial(): Project {
  const base = fixtureProject()
  return {
    ...base,
    estimate: {
      ...base.estimate,
      hardwareMarkup: 0.25,
      taxRate: 0.1,
      extras: [{ id: 'x1', label: 'Installation', qty: 3, unit: 'h', unitCost: 50 }],
    },
  }
}

describe('EstimateView', () => {
  it('lists totals down to the pre-tax price and tax, hiding empty optional rows', () => {
    const plain = runPipeline(fixtureProject()).estimate
    expect(totalRows(plain, 0.2).map(([label]) => label)).toEqual(['Materials', 'Hardware', 'Labor', 'Subtotal', 'Margin (20 %)', 'Price (excl. tax)', 'Tax (0 %)'])
    const e = runPipeline(commercial()).estimate
    expect(totalRows(e, 0.2)).toEqual([
      ['Materials', e.materialCost],
      ['Hardware', e.hardwareCost],
      ['Labor', e.laborCost],
      ['Extra charges', 150],
      ['Markup', e.hardwareMarkupAmount],
      ['Subtotal', e.subtotal],
      ['Margin (20 %)', e.marginAmount],
      ['Price (excl. tax)', e.price],
      ['Tax (10 %)', e.tax],
    ])
  })

  it('shows the extra charges table and the tax-inclusive total', () => {
    const project = commercial()
    const result = runPipeline(project)
    const html = renderToStaticMarkup(<EstimateView project={project} result={result} />)
    expect(html).toContain('Extra charges')
    expect(html).toContain('Installation')
    expect(html).toContain('3 h')
    expect(html).toContain('Total')
    expect(html).toContain(`$${result.estimate.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
  })
})

describe('ExtraCharges', () => {
  it('renders one editable group per charge and an add button', () => {
    const extras = commercial().estimate.extras ?? []
    const html = renderToStaticMarkup(<ExtraCharges extras={extras} />)
    expect(html).toContain('<legend class="sr-only">Extra charge: Installation</legend>')
    expect(html).toContain('aria-label="Remove Installation"')
    expect(html).toContain('Add charge')
  })

  it('explains extra charges when there are none', () => {
    expect(renderToStaticMarkup(<ExtraCharges extras={[]} />)).toContain('Added to the cost before margin')
  })
})
