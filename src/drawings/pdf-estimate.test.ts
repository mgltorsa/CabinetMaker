import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'
import type { BomLine, Estimate } from '@/core/types'
import { estimateDetailGroups, estimateTotalRows, MAX_PDF_EXTRA_ROWS } from './pdf-estimate'
import { PAGE_SIZES } from './pdf-layout'
import { drawEstimatePage } from './pdf-pages'
import { fixtureResult } from './testing/fixtures'

const extra = (i: number, total: number): BomLine => ({
  category: 'extra',
  refId: `x${i}`,
  description: `Extra ${i}`,
  qty: 1,
  unit: 'job',
  unitCost: total,
  total,
})

function commercialEstimate(extras: BomLine[]): Estimate {
  const base = fixtureResult().estimate
  const extrasCost = extras.reduce((acc, l) => acc + l.total, 0)
  return {
    ...base,
    extras,
    extrasCost,
    materialMarkupAmount: 8.5,
    hardwareMarkupAmount: 0,
    markupAmount: 8.5,
    minimumChargeAdjustment: 12.34,
    taxRate: 0.1,
    tax: 30,
    total: 330,
    price: 300,
  }
}

describe('estimateTotalRows', () => {
  it('lists cost groups, markup, margin, minimum charge, price, tax and total', () => {
    const rows = estimateTotalRows(commercialEstimate([extra(1, 150)]))
    expect(rows.map((r) => [r.label, r.amount])).toEqual([
      ['Materials', 'USD 85.00'],
      ['Hardware', 'USD 26.00'],
      ['Labor', 'USD 70.42'],
      ['Extra charges', 'USD 150.00'],
      ['Markup', 'USD 8.50'],
      ['Subtotal', 'USD 181.42'],
      ['Margin', 'USD 45.36'],
      ['Minimum charge adjustment', 'USD 12.34'],
      ['Price (excl. tax)', 'USD 300.00'],
      ['Tax (10 %)', 'USD 30.00'],
      ['Total', 'USD 330.00'],
    ])
    expect(rows.filter((r) => r.isBold).map((r) => r.label)).toEqual(['Subtotal', 'Price (excl. tax)', 'Total'])
  })

  it('omits empty extras, markup and minimum charge rows', () => {
    const labels = estimateTotalRows(fixtureResult().estimate).map((r) => r.label)
    expect(labels).toEqual(['Materials', 'Hardware', 'Labor', 'Subtotal', 'Margin', 'Price (excl. tax)', 'Tax (0 %)', 'Total'])
  })
})

describe('estimateDetailGroups', () => {
  it('lists labor buckets and each extra charge with its quantity', () => {
    const [labor, extras] = estimateDetailGroups(commercialEstimate([{ ...extra(1, 150), description: 'Installation', qty: 3, unit: 'h', unitCost: 50 }]))
    expect(labor!.heading).toBe('Labor')
    expect(labor!.rows.map((r) => r.label)).toEqual(['cutting (20 min)', 'assembly (45 min)'])
    expect(extras).toEqual({ heading: 'Extra charges', rows: [{ label: 'Installation (3 h x USD 50.00)', amount: 'USD 150.00' }] })
  })

  it('folds extra charges beyond the page capacity into one row with their sum', () => {
    const many = Array.from({ length: MAX_PDF_EXTRA_ROWS + 3 }, (_, i) => extra(i, 1.1))
    const rows = estimateDetailGroups(commercialEstimate(many))[1]!.rows
    expect(rows).toHaveLength(MAX_PDF_EXTRA_ROWS)
    expect(rows.at(-1)).toEqual({ label: '4 more extra charges', amount: 'USD 4.40' })
  })

  it('has no extra charges group when there are none', () => {
    expect(estimateDetailGroups(fixtureResult().estimate).map((g) => g.heading)).toEqual(['Labor'])
  })
})

describe('drawEstimatePage', () => {
  it('writes extras, tax and total on the estimate page', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage()
    const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) }
    const drawText = vi.spyOn(page, 'drawText')
    const result = { ...fixtureResult(), estimate: commercialEstimate([{ ...extra(1, 150), description: 'Installation' }]) }
    drawEstimatePage({ page, fonts }, PAGE_SIZES.letter, result)
    const texts = drawText.mock.calls.map(([text]) => text)
    expect(texts).toEqual(expect.arrayContaining(['Extra charges', 'Tax (10 %)', 'USD 30.00', 'Total', 'USD 330.00']))
    expect(texts.some((t) => t.startsWith('Installation'))).toBe(true)
  })
})
