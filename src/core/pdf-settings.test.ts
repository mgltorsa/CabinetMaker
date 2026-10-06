import { describe, expect, it } from 'vitest'
import { fixtureProject } from './fixtures'
import { DEFAULT_PDF_SETTINGS, PDF_LIMITS, pdfDisplayTitle, resolvePdfSettings, titleBlockDate, withPdfSettings, withWatermark } from './pdf-settings'

describe('resolvePdfSettings', () => {
  it('uses the defaults for projects saved before PDF settings existed', () => {
    const project = fixtureProject()
    expect(project.pdf).toBeUndefined()
    expect(resolvePdfSettings(project)).toEqual(DEFAULT_PDF_SETTINGS)
  })

  it('defaults to every section, Letter, today and a light text watermark that is off', () => {
    const s = DEFAULT_PDF_SETTINGS
    expect(Object.values(s.sections).every(Boolean)).toBe(true)
    expect(s.pageSize).toBe('letter')
    expect(s.dateMode).toBe('today')
    expect(s.watermark.enabled).toBe(false)
    expect(s.watermark.layer).toBe('behind')
    expect(s.watermark.opacity).toBeGreaterThanOrEqual(PDF_LIMITS.opacity.min)
    expect(s.watermark.opacity).toBeLessThanOrEqual(0.2)
  })
})

describe('withPdfSettings / withWatermark', () => {
  it('patches without mutating the project or the defaults', () => {
    const project = fixtureProject()
    const next = withPdfSettings(project, { client: 'Ms Smith', sections: { ...DEFAULT_PDF_SETTINGS.sections, bom: false } })
    expect(project.pdf).toBeUndefined()
    expect(next.pdf?.client).toBe('Ms Smith')
    expect(next.pdf?.sections.bom).toBe(false)
    expect(DEFAULT_PDF_SETTINGS.sections.bom).toBe(true)
    const marked = withWatermark(next, { enabled: true, text: 'DRAFT' })
    expect(marked.pdf?.watermark).toMatchObject({ enabled: true, text: 'DRAFT' })
    expect(marked.pdf?.client).toBe('Ms Smith')
    expect(next.pdf?.watermark.enabled).toBe(false)
  })
})

describe('pdfDisplayTitle', () => {
  it('falls back to the project name when the title is blank', () => {
    const project = fixtureProject()
    expect(pdfDisplayTitle(project, resolvePdfSettings(project))).toBe('Fixture')
    expect(pdfDisplayTitle(project, { ...DEFAULT_PDF_SETTINGS, title: '  Kitchen  ' })).toBe('Kitchen')
  })
})

describe('titleBlockDate', () => {
  const now = new Date('2026-10-03T12:00:00Z')

  it('prints today unless a valid fixed date is chosen', () => {
    expect(titleBlockDate(DEFAULT_PDF_SETTINGS, now)).toBe('2026-10-03')
    expect(titleBlockDate({ ...DEFAULT_PDF_SETTINGS, dateMode: 'fixed', fixedDate: '2025-01-31' }, now)).toBe('2025-01-31')
    expect(titleBlockDate({ ...DEFAULT_PDF_SETTINGS, dateMode: 'fixed', fixedDate: '' }, now)).toBe('2026-10-03')
    expect(titleBlockDate({ ...DEFAULT_PDF_SETTINGS, dateMode: 'today', fixedDate: '2025-01-31' }, now)).toBe('2026-10-03')
  })
})
