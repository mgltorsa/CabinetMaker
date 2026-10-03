import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { runPipeline } from '@/pipeline'
import { buildPlanPdf, planPageCount } from './pdf'
import { PAGE_SIZES, PANEL_GRID, tableRowsPerPage } from './pdf-layout'
import { buildPagePlan } from './pdf-plan'
import { fitWidth, isWinAnsi, toWinAnsi } from './pdf-text'
import { fixtureProjectFor, fixtureResult, manyPartsResult } from './testing/fixtures'

const DATE = new Date('2026-10-03T12:00:00Z')

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

describe('buildPlanPdf', () => {
  it('produces a PDF whose page count equals planPageCount', async () => {
    const project = fixtureProjectFor()
    const result = fixtureResult()
    const bytes = await buildPlanPdf(project, result, { date: DATE })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(await pageCountOf(bytes)).toBe(planPageCount(project, result))
  })

  it('orders pages cover, elevations, panels, sheets, cut list, BOM, estimate', () => {
    const result = fixtureResult()
    const plan = buildPagePlan(fixtureProjectFor(), result)
    const sections = plan.map((p) => p.section)
    const panelPages = Math.ceil(result.build.parts.length / (PANEL_GRID.cols * PANEL_GRID.rows))
    expect(sections).toEqual([
      'Cover',
      'Elevations',
      ...Array<string>(panelPages).fill('Panel details'),
      ...Array<string>(result.nest.sheets.length).fill('Sheet layouts'),
      'Cut list',
      'Bill of materials',
      'Estimate',
    ])
  })

  it('paginates panel details and the cut list for many parts', async () => {
    const project = fixtureProjectFor()
    const result = manyPartsResult(120)
    const parts = result.build.parts.length
    const rowsPerPage = tableRowsPerPage(PAGE_SIZES.letter)
    const plan = buildPagePlan(project, result)
    expect(plan.filter((p) => p.section === 'Panel details')).toHaveLength(Math.ceil(parts / (PANEL_GRID.cols * PANEL_GRID.rows)))
    expect(plan.filter((p) => p.section === 'Cut list')).toHaveLength(Math.ceil(parts / rowsPerPage))
    const bytes = await buildPlanPdf(project, result, { date: DATE })
    expect(await pageCountOf(bytes)).toBe(planPageCount(project, result))
  })

  it('supports A4 landscape', async () => {
    const project = fixtureProjectFor()
    const bytes = await buildPlanPdf(project, fixtureResult(), { pageSize: 'a4', date: DATE })
    const doc = await PDFDocument.load(bytes)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo((297 * 72) / 25.4, 1)
    expect(height).toBeCloseTo((210 * 72) / 25.4, 1)
  })

  it('never throws on names outside WinAnsi', async () => {
    const project = { ...fixtureProjectFor(), name: 'Küche 厨房 🪚 → ≈ ½' }
    const cabinets = project.cabinets.map((c) => ({ ...c, name: '柜子 <x> & "y"' }))
    const bytes = await buildPlanPdf({ ...project, cabinets }, fixtureResult(), { date: DATE })
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('renders an imperial project with an empty result', async () => {
    const project = { ...fixtureProjectFor(), units: 'imperial' as const }
    const empty = fixtureResult([])
    const bytes = await buildPlanPdf(project, empty, { date: DATE })
    expect(await pageCountOf(bytes)).toBe(planPageCount(project, empty))
  })

  it('survives parts with non-finite geometry', async () => {
    const [first, ...rest] = fixtureResult().build.parts
    if (!first) throw new Error('fixture empty')
    const broken = { ...first, length: NaN, bounds: { ...first.bounds, max: { ...first.bounds.max, x: NaN } } }
    const result = fixtureResult([broken, ...rest])
    const project = fixtureProjectFor()
    const bytes = await buildPlanPdf(project, result, { date: DATE })
    expect(await pageCountOf(bytes)).toBe(planPageCount(project, result))
  })

  it('keeps the page count invariant for the real pipeline', async () => {
    const project = fixtureProject()
    const result = runPipeline(project)
    const bytes = await buildPlanPdf(project, result, { date: DATE })
    expect(await pageCountOf(bytes)).toBe(planPageCount(project, result))
  })
})

describe('toWinAnsi', () => {
  it('keeps Latin-1 and CP1252 punctuation, replaces the rest', () => {
    expect(toWinAnsi('Ø5 × 32 — “ok” €')).toBe('Ø5 × 32 — “ok” €')
    expect(toWinAnsi('a→b ≈ c\nd 厨🪚')).toBe('a->b ~ c d ??')
  })

  it('produces only characters Helvetica can encode', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const all = Array.from({ length: 0x2200 }, (_, i) => String.fromCodePoint(i)).join('')
    const safe = toWinAnsi(all)
    expect(Array.from(safe).every((c) => isWinAnsi(c.codePointAt(0) ?? 0))).toBe(true)
    expect(() => font.encodeText(safe)).not.toThrow()
  })

  it('fitWidth truncates with an ellipsis', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const out = fitWidth(font, 'A very long cabinet name indeed', 10, 60)
    expect(out.endsWith('...')).toBe(true)
    expect(font.widthOfTextAtSize(out, 10)).toBeLessThanOrEqual(60)
    expect(fitWidth(font, 'short', 10, 200)).toBe('short')
  })
})
