import { PDFDocument, PDFName, StandardFonts, type PDFImage, type PDFPageDrawImageOptions, type PDFPageDrawTextOptions } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PDF_SETTINGS, DEFAULT_WATERMARK, PDF_SECTION_KEYS } from '@/core/pdf-settings'
import { dataUrl, tinyJpeg, tinyPng } from '@/core/testing/images'
import type { PdfSectionKey, PdfSettings, PdfWatermark, Project, WatermarkPlacement } from '@/core/types'
import { buildPlanPdf, planPageCount } from './pdf'
import { embedBrandImage, fitInBox } from './pdf-brand'
import { buildPagePlan } from './pdf-plan'
import { wrapText } from './pdf-text'
import { drawWatermark, type WatermarkTarget } from './pdf-watermark'
import { drawsText, pageContent } from './testing/pdf-content'
import { fixtureProjectFor, fixtureResult } from './testing/fixtures'

const DATE = new Date('2026-10-03T12:00:00Z')

function withPdf(patch: Partial<PdfSettings>): Project {
  return { ...fixtureProjectFor(), pdf: { ...DEFAULT_PDF_SETTINGS, ...patch } }
}

/** Every on/off combination of the seven sections (2^7). */
function allSectionCombos(): Record<PdfSectionKey, boolean>[] {
  return Array.from({ length: 1 << PDF_SECTION_KEYS.length }, (_, mask) =>
    Object.fromEntries(PDF_SECTION_KEYS.map((k, i) => [k, (mask & (1 << i)) !== 0])) as Record<PdfSectionKey, boolean>,
  )
}

describe('section toggles', () => {
  const result = fixtureResult()
  const full = buildPagePlan(fixtureProjectFor(), result)
  const countOf = (section: string): number => full.filter((p) => p.section === section).length
  const SECTION_NAMES: Record<PdfSectionKey, string> = {
    cover: 'Cover',
    elevations: 'Elevations',
    panels: 'Panel details',
    sheets: 'Sheet layouts',
    cutList: 'Cut list',
    bom: 'Bill of materials',
    estimate: 'Estimate',
  }

  it('renders exactly planPageCount pages for every section combination', async () => {
    for (const sections of allSectionCombos()) {
      const project = withPdf({ sections })
      const expected = PDF_SECTION_KEYS.filter((k) => sections[k]).reduce((n, k) => n + countOf(SECTION_NAMES[k]), 0)
      const planned = planPageCount(project, result)
      expect(planned, JSON.stringify(sections)).toBe(Math.max(expected, 1))
      const doc = await PDFDocument.load(await buildPlanPdf(project, result, { date: DATE }))
      expect(doc.getPageCount(), JSON.stringify(sections)).toBe(planned)
    }
  }, 60_000)

  it('drops switched-off sections and keeps the order of the rest', () => {
    const project = withPdf({ sections: { ...DEFAULT_PDF_SETTINGS.sections, elevations: false, bom: false } })
    const sections = [...new Set(buildPagePlan(project, result).map((p) => p.section))]
    expect(sections).toEqual(['Cover', 'Panel details', 'Sheet layouts', 'Cut list', 'Estimate'])
  })

  it('falls back to the cover when every section is off', () => {
    const none = Object.fromEntries(PDF_SECTION_KEYS.map((k) => [k, false])) as Record<PdfSectionKey, boolean>
    expect(buildPagePlan(withPdf({ sections: none }), result).map((p) => p.kind)).toEqual(['cover'])
  })

  it('uses the page size from the settings unless the caller overrides it', async () => {
    const project = withPdf({ pageSize: 'a4' })
    const a4 = await PDFDocument.load(await buildPlanPdf(project, result, { date: DATE }))
    expect(a4.getPage(0).getWidth()).toBeCloseTo((297 * 72) / 25.4, 1)
    const letter = await PDFDocument.load(await buildPlanPdf(project, result, { date: DATE, pageSize: 'letter' }))
    expect(letter.getPage(0).getWidth()).toBeCloseTo((279.4 * 72) / 25.4, 1)
  })
})

interface Call {
  kind: 'text' | 'image'
  x: number
  y: number
  width: number
  height: number
  rotateDeg: number
  opacity: number | undefined
}

function recorder(width: number, height: number, measure: (text: string, size: number) => { w: number; h: number }): WatermarkTarget & { calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    getSize: () => ({ width, height }),
    drawText: (text: string, o: PDFPageDrawTextOptions = {}) => {
      const m = measure(text, o.size ?? 12)
      calls.push({ kind: 'text', x: o.x ?? 0, y: o.y ?? 0, width: m.w, height: m.h, rotateDeg: o.rotate?.angle ?? 0, opacity: o.opacity })
    },
    drawImage: (_image: PDFImage, o: PDFPageDrawImageOptions = {}) => {
      calls.push({ kind: 'image', x: o.x ?? 0, y: o.y ?? 0, width: o.width ?? 0, height: o.height ?? 0, rotateDeg: o.rotate?.angle ?? 0, opacity: o.opacity })
    },
  }
}

/** Corners of a drawn item rotated about its origin (pdf-lib's convention). */
function corners(c: Call): { x: number; y: number }[] {
  const r = (c.rotateDeg * Math.PI) / 180
  return [
    [0, 0],
    [c.width, 0],
    [0, c.height],
    [c.width, c.height],
  ].map(([u = 0, v = 0]) => ({ x: c.x + u * Math.cos(r) - v * Math.sin(r), y: c.y + u * Math.sin(r) + v * Math.cos(r) }))
}

describe('drawWatermark', () => {
  const PAGE = { w: 792, h: 612 }

  async function textSource() {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.HelveticaBold)
    const measure = (text: string, size: number) => ({ w: font.widthOfTextAtSize(text, size), h: font.heightAtSize(size, { descender: false }) })
    return { font, measure, doc }
  }

  it.each<[WatermarkPlacement, number]>([
    ['centre', 0],
    ['centre', 45],
    ['corner', 45],
    ['corner', -30],
    ['tiled', 45],
    ['tiled', 0],
  ])('keeps a %s text watermark rotated %i deg inside the page', async (placement, rotationDeg) => {
    const { font, measure } = await textSource()
    const page = recorder(PAGE.w, PAGE.h, measure)
    const wm: PdfWatermark = { ...DEFAULT_WATERMARK, enabled: true, kind: 'text', text: 'DRAFT', placement, rotationDeg, sizePercent: placement === 'tiled' ? 20 : 60, opacity: 0.2 }
    drawWatermark(page, wm, { text: font, image: null })
    expect(page.calls.length).toBe(placement === 'tiled' ? page.calls.length : 1)
    if (placement === 'tiled') expect(page.calls.length).toBeGreaterThan(1)
    for (const call of page.calls) {
      expect(call.opacity).toBe(0.2)
      expect(call.rotateDeg).toBe(rotationDeg)
      for (const p of corners(call)) {
        expect(p.x).toBeGreaterThanOrEqual(-0.01)
        expect(p.x).toBeLessThanOrEqual(PAGE.w + 0.01)
        expect(p.y).toBeGreaterThanOrEqual(-0.01)
        expect(p.y).toBeLessThanOrEqual(PAGE.h + 0.01)
      }
    }
  })

  it('centres a centre watermark on the page and puts a corner one top-right', async () => {
    const { font, measure } = await textSource()
    const centre = recorder(PAGE.w, PAGE.h, measure)
    drawWatermark(centre, { ...DEFAULT_WATERMARK, enabled: true, rotationDeg: 0 }, { text: font, image: null })
    const c = centre.calls[0]!
    expect(c.x + c.width / 2).toBeCloseTo(PAGE.w / 2, 3)
    expect(c.y + c.height / 2).toBeCloseTo(PAGE.h / 2, 3)
    expect(c.width).toBeCloseTo(PAGE.w * 0.6, 3)
    const corner = recorder(PAGE.w, PAGE.h, measure)
    drawWatermark(corner, { ...DEFAULT_WATERMARK, enabled: true, rotationDeg: 0, placement: 'corner', sizePercent: 20 }, { text: font, image: null })
    const k = corner.calls[0]!
    expect(k.x).toBeGreaterThan(PAGE.w / 2)
    expect(k.y).toBeGreaterThan(PAGE.h / 2)
  })

  it('draws an image watermark with its aspect ratio and opacity', async () => {
    const { doc, measure } = await textSource()
    const image = await doc.embedPng(tinyPng(4, 2))
    const page = recorder(PAGE.w, PAGE.h, measure)
    drawWatermark(page, { ...DEFAULT_WATERMARK, enabled: true, kind: 'image', rotationDeg: 0, opacity: 0.3 }, { text: null, image })
    expect(page.calls).toHaveLength(1)
    const call = page.calls[0]!
    expect(call.kind).toBe('image')
    expect(call.width / call.height).toBeCloseTo(2, 5)
    expect(call.opacity).toBe(0.3)
  })

  it('clamps opacity to the allowed range and draws nothing when disabled or empty', async () => {
    const { font, measure } = await textSource()
    const page = recorder(PAGE.w, PAGE.h, measure)
    drawWatermark(page, { ...DEFAULT_WATERMARK, enabled: true, opacity: 3 }, { text: font, image: null })
    expect(page.calls[0]?.opacity).toBe(0.5)
    const none = recorder(PAGE.w, PAGE.h, measure)
    drawWatermark(none, { ...DEFAULT_WATERMARK, enabled: false }, { text: font, image: null })
    drawWatermark(none, { ...DEFAULT_WATERMARK, enabled: true, text: '   ' }, { text: font, image: null })
    drawWatermark(none, { ...DEFAULT_WATERMARK, enabled: true, kind: 'image' }, { text: font, image: null })
    expect(none.calls).toEqual([])
  })
})

describe('brand images', () => {
  it('embeds PNG and JPEG logos', async () => {
    const doc = await PDFDocument.create()
    const png = await embedBrandImage(doc, dataUrl('image/png', tinyPng(4, 2)))
    expect(png && [png.width, png.height]).toEqual([4, 2])
    const jpeg = await embedBrandImage(doc, dataUrl('image/jpeg', tinyJpeg(30, 10)))
    expect(jpeg && [jpeg.width, jpeg.height]).toEqual([30, 10])
  })

  it('ignores missing, mislabelled and non-image data', async () => {
    const doc = await PDFDocument.create()
    expect(await embedBrandImage(doc, null)).toBeNull()
    expect(await embedBrandImage(doc, dataUrl('image/png', new TextEncoder().encode('<svg onload=alert(1)>')))).toBeNull()
    expect(await embedBrandImage(doc, dataUrl('image/jpeg', tinyPng()))).toBeNull()
    // Valid header, corrupt body: pdf-lib throws; the plan book must still render.
    const corrupt = tinyPng(4, 4).slice(0, 40)
    expect(await embedBrandImage(doc, dataUrl('image/png', corrupt))).toBeNull()
  })

  it('fits images into a box keeping the aspect ratio', () => {
    expect(fitInBox(400, 100, 40, 20)).toEqual({ width: 40, height: 10 })
    expect(fitInBox(100, 400, 40, 20)).toEqual({ width: 5, height: 20 })
    expect(fitInBox(0, 0, 40, 20)).toEqual({ width: 0, height: 0 })
  })

  it.each([
    ['PNG', dataUrl('image/png', tinyPng(8, 4))],
    ['JPEG', dataUrl('image/jpeg', tinyJpeg(8, 4))],
  ])('puts a %s logo on every page', async (_, logo) => {
    const project = withPdf({ logo, company: 'Oak & Co' })
    const result = fixtureResult()
    const bytes = await buildPlanPdf(project, result, { date: DATE })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(planPageCount(project, result))
    for (const page of doc.getPages()) {
      const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'))
      expect(xobjects, 'page has an image resource').toBeDefined()
      expect(await pageContent(bytes, doc.getPages().indexOf(page))).toMatch(/\bDo\b/)
    }
  })

  it('still renders when the stored logo is corrupt', async () => {
    const project = withPdf({ logo: dataUrl('image/png', tinyPng(4, 4).slice(0, 40)) })
    const result = fixtureResult()
    const doc = await PDFDocument.load(await buildPlanPdf(project, result, { date: DATE }))
    expect(doc.getPageCount()).toBe(planPageCount(project, result))
  })
})

describe('title block, cover and metadata', () => {
  const fields: Partial<PdfSettings> = {
    title: 'Kitchen run',
    client: 'Ms Smith',
    company: 'Ateliér Ñ — “Rev” 2',
    designer: 'J. Doe',
    contact: '1 Bench St · 555 0100',
    revision: 'Rev B',
    dateMode: 'fixed',
    fixedDate: '2025-01-31',
    notes: 'Paint grade maple.\nInstall after flooring.',
  }

  it('prints the user fields on the cover and in every title block', async () => {
    const project = withPdf(fields)
    const bytes = await buildPlanPdf(project, fixtureResult(), { date: DATE })
    const cover = await pageContent(bytes, 0)
    for (const text of ['Kitchen run', 'Ateliér Ñ — “Rev” 2', 'Paint grade maple.', 'Install after flooring.']) {
      expect(await drawsText(cover, text), text).toBe(true)
    }
    const last = await pageContent(bytes, planPageCount(project, fixtureResult()) - 1)
    for (const text of ['Kitchen run', 'Ms Smith', 'J. Doe', 'Rev B', '2025-01-31']) {
      expect(await drawsText(last, text), text).toBe(true)
    }
  })

  it('never throws on user fields outside WinAnsi', async () => {
    const odd = '厨房 🪚 → ≈ ½\u0000‮'
    const project = withPdf({ title: odd, client: odd, company: odd, designer: odd, contact: odd, revision: odd, notes: `${odd}\n${odd}`, watermark: { ...DEFAULT_WATERMARK, enabled: true, text: odd } })
    const bytes = await buildPlanPdf(project, fixtureResult(), { date: DATE })
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('writes title, author, subject and keywords metadata from the fields', async () => {
    const doc = await PDFDocument.load(await buildPlanPdf(withPdf(fields), fixtureResult(), { date: DATE }))
    expect(doc.getTitle()).toBe('Kitchen run - plan set')
    expect(doc.getAuthor()).toBe('J. Doe')
    expect(doc.getSubject()).toBe('Plan set for Ms Smith by Ateliér Ñ — “Rev” 2')
    expect(doc.getKeywords()).toBe('Ateliér Ñ — “Rev” 2 Ms Smith Rev B cabinet plans')
  })

  it('keeps the old metadata for projects without PDF settings', async () => {
    const doc = await PDFDocument.load(await buildPlanPdf(fixtureProjectFor(), fixtureResult(), { date: DATE }))
    expect(doc.getTitle()).toBe(`${fixtureProjectFor().name} - plan set`)
  })

  it('draws a text watermark on every page, behind or over the drawings', async () => {
    const result = fixtureResult()
    for (const layer of ['behind', 'over'] as const) {
      const project = withPdf({ watermark: { ...DEFAULT_WATERMARK, enabled: true, text: 'DRAFT', layer } })
      const bytes = await buildPlanPdf(project, result, { date: DATE })
      const count = planPageCount(project, result)
      for (let i = 0; i < count; i++) {
        const content = await pageContent(bytes, i)
        expect(await drawsText(content, 'DRAFT')).toBe(true)
        const hex = content.toUpperCase().indexOf('<4452414654>')
        const firstText = content.search(/<[0-9A-F]+>\s*Tj/i)
        if (layer === 'behind') expect(hex).toBe(firstText)
        else expect(hex).toBeGreaterThan(firstText)
      }
    }
  })
})

describe('wrapText', () => {
  it('wraps words to the width, keeps paragraphs and caps the line count', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const lines = wrapText(font, 'one two three four five six seven\nnext paragraph', 10, 60, 10)
    expect(lines.length).toBeGreaterThan(2)
    expect(lines.every((l) => font.widthOfTextAtSize(l, 10) <= 60)).toBe(true)
    // A newline always starts a new line.
    expect(lines.some((l) => l.startsWith('next'))).toBe(true)
    expect(lines.some((l) => l.includes('seven next'))).toBe(false)
    const capped = wrapText(font, 'a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(5), 10, 30, 2)
    expect(capped).toHaveLength(2)
    expect(capped[1]?.endsWith('...')).toBe(true)
    expect(wrapText(font, '', 10, 60, 3)).toEqual([])
  })
})
