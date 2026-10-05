import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { DEFAULT_PDF_SETTINGS } from '@/core/pdf-settings'
import { dataUrl, pngHeader, tinyJpeg, tinyPng } from '@/core/testing/images'
import type { PdfSettings, Project } from '@/core/types'
import { parseProjectJson, serializeProject } from '../persistence'
import { PDF_LIMITS } from './limits'
import { validateProject } from './projectSchema'

function withPdf(patch: Partial<PdfSettings>): Project {
  return { ...fixtureProject(), pdf: { ...DEFAULT_PDF_SETTINGS, ...patch } }
}

/** A PNG data URL of about `bytes` decoded bytes (valid header, zero padding). */
function pngOfSize(bytes: number): string {
  const head = tinyPng()
  const out = new Uint8Array(bytes)
  out.set(head)
  return dataUrl('image/png', out)
}

describe('validateProject: pdf settings', () => {
  it('accepts projects saved before PDF settings existed', () => {
    const old = JSON.parse(JSON.stringify(fixtureProject())) as Record<string, unknown>
    expect('pdf' in old).toBe(false)
    expect(validateProject(old)).toBeNull()
  })

  it('accepts full settings with PNG and JPEG images and round-trips them', () => {
    const project = withPdf({
      client: 'Ms Smith',
      company: 'Ateliér Ñ — “Rev” 2',
      dateMode: 'fixed',
      fixedDate: '2025-01-31',
      logo: dataUrl('image/png', tinyPng()),
      watermarkImage: dataUrl('image/jpeg', tinyJpeg()),
    })
    expect(validateProject(project)).toBeNull()
    const parsed = parseProjectJson(serializeProject(project))
    expect(parsed.ok && parsed.project.pdf).toEqual(project.pdf)
  })

  it.each<[string, Partial<PdfSettings> | ((p: PdfSettings) => unknown), string]>([
    ['an oversized logo', { logo: pngOfSize(PDF_LIMITS.imageBytes + 10) }, 'project.pdf.logo is 1.1 MB; images must be at most 1 MB'],
    ['a logo that is not an image', { logo: dataUrl('image/png', new TextEncoder().encode('<svg onload="alert(1)"/>')) }, 'project.pdf.logo is not a PNG or JPEG'],
    ['an SVG logo', { logo: 'data:image/svg+xml;base64,PHN2Zy8+' }, 'project.pdf.logo must be a data:image/png'],
    ['a remote logo URL', { logo: 'https://example.com/x.png' }, 'project.pdf.logo must be a data:image/png'],
    ['a pixel bomb watermark image', { watermarkImage: dataUrl('image/png', pngHeader(60_000, 60_000)) }, 'project.pdf.watermarkImage is 60000 x 60000 px'],
    ['an opacity of 90 %', (p) => ({ ...p, watermark: { ...p.watermark, opacity: 0.9 } }), 'project.pdf.watermark.opacity'],
    ['an unknown placement', (p) => ({ ...p, watermark: { ...p.watermark, placement: 'everywhere' } }), 'project.pdf.watermark.placement'],
    ['a tiny watermark', (p) => ({ ...p, watermark: { ...p.watermark, sizePercent: 1 } }), 'project.pdf.watermark.sizePercent'],
    ['an invalid fixed date', { dateMode: 'fixed', fixedDate: '2025-02-30' }, 'project.pdf.fixedDate'],
    ['an unknown page size', (p) => ({ ...p, pageSize: 'a3' }), 'project.pdf.pageSize'],
    ['a missing section toggle', (p) => ({ ...p, sections: { cover: true } }), 'project.pdf.sections.elevations'],
    ['a very long client name', { client: 'x'.repeat(PDF_LIMITS.fieldLength + 1) }, 'project.pdf.client must be at most'],
    ['very long notes', { notes: 'x'.repeat(PDF_LIMITS.notesLength + 1) }, 'project.pdf.notes must be at most'],
  ])('rejects %s and names the path', (_, patch, message) => {
    const pdf = typeof patch === 'function' ? patch({ ...DEFAULT_PDF_SETTINGS }) : { ...DEFAULT_PDF_SETTINGS, ...patch }
    const error = validateProject({ ...fixtureProject(), pdf })
    expect(error).toContain(message)
  })
})
