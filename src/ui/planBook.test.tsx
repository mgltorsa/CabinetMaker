import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { DEFAULT_PDF_SETTINGS } from '@/core/pdf-settings'
import { dataUrl, tinyPng } from '@/core/testing/images'
import { PdfImageField } from './components/sidebar/PdfImageField'
import { createDesignerStore } from './store'

describe('plan book store actions', () => {
  it('updates PDF settings and the watermark immutably', () => {
    const store = createDesignerStore(fixtureProject())
    const before = store.getState().project
    store.getState().updatePdfSettings({ company: 'Oak & Co', sections: { ...DEFAULT_PDF_SETTINGS.sections, elevations: false } })
    store.getState().updateWatermark({ enabled: true, text: 'DRAFT' })
    const pdf = store.getState().project.pdf
    expect(pdf?.company).toBe('Oak & Co')
    expect(pdf?.sections.elevations).toBe(false)
    expect(pdf?.watermark).toMatchObject({ enabled: true, text: 'DRAFT' })
    expect(before.pdf).toBeUndefined()
  })
})

describe('PdfImageField', () => {
  it('previews the image as an <img> data URL with a remove button', () => {
    const logo = dataUrl('image/png', tinyPng())
    const html = renderToStaticMarkup(<PdfImageField label="Logo" value={logo} onChange={() => undefined} />)
    expect(html).toContain(`<img src="${logo}" alt="Logo preview"`)
    expect(html).toContain('accept="image/png,image/jpeg"')
    expect(html).toContain('aria-label="Remove logo"')
  })

  it('shows a placeholder and no remove button without an image', () => {
    const html = renderToStaticMarkup(<PdfImageField label="Watermark image" value={null} emptyText="Logo" onChange={() => undefined} />)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('Remove')
    expect(html).toContain('Upload')
  })
})
