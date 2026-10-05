import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, type PDFObject } from 'pdf-lib'
import { openCard, openSection } from './helpers'

const LOGO = fileURLToPath(new URL('./fixtures/logo.png', import.meta.url))

/** Decoded content streams of page `index`. */
function pageContent(doc: PDFDocument, index: number): string {
  const contents: PDFObject | undefined = doc.getPage(index).node.Contents()
  const refs: PDFObject[] = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return refs
    .map((r) => (r instanceof PDFRef ? doc.context.lookup(r) : r))
    .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
    .map((s) => Buffer.from(s.dict.get(PDFName.of('Filter')) === PDFName.of('FlateDecode') ? inflateSync(s.contents) : s.contents).toString('latin1'))
    .join('\n')
}

/** `<hex>` pdf-lib writes for ASCII text in a standard font. */
const hexOf = (text: string): string => `<${Buffer.from(text, 'latin1').toString('hex').toUpperCase()}>`

async function commit(field: Locator, value: string): Promise<void> {
  await field.fill(value)
  await field.press('Enter')
  await expect(field).toHaveValue(value)
}

function planBookCard(page: Page): Locator {
  return page.getByRole('button', { name: /^03·4 Plan book/ }).locator('..')
}

test('brands the plan book with company, client, logo and a text watermark', async ({ page }) => {
  // Edits, a PDF build and a reload: longer than the default budget.
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
  await openSection(page, 'Drawings & BOM')
  await openCard(page, 'Plan book')
  const card = planBookCard(page)

  await commit(card.getByLabel('Title', { exact: true }), 'Kitchen run')
  await commit(card.getByLabel('Client', { exact: true }), 'Ms Smith')
  await commit(card.getByLabel('Company', { exact: true }), 'Oak & Co')
  await card.getByLabel('Logo', { exact: true }).setInputFiles(LOGO)
  await expect(card.getByRole('img', { name: 'Logo preview' })).toBeVisible()

  await card.getByRole('button', { name: 'Advanced' }).click()
  for (const section of ['Elevations', 'Panel details', 'Sheet layouts', 'Cut list', 'Bill of materials']) {
    const toggle = card.getByRole('switch', { name: section, exact: true })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
  }
  await card.getByRole('switch', { name: 'Watermark', exact: true }).click()
  await commit(card.getByLabel('Watermark text', { exact: true }), 'DRAFT')
  await expect(page.getByRole('button', { name: /^03·4 Plan book PDF · Letter · 2 of 7 sections · watermark/ })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await card.getByRole('button', { name: 'Download PDF' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/-plans\.pdf$/)
  const doc = await PDFDocument.load(await readFile(await download.path()))

  expect(doc.getPageCount()).toBe(2)
  expect(doc.getTitle()).toBe('Kitchen run - plan set')
  expect(doc.getAuthor()).toBe('Oak & Co')
  expect(doc.getSubject()).toBe('Plan set for Ms Smith by Oak & Co')
  expect(doc.getKeywords()).toContain('Oak & Co')
  const cover = pageContent(doc, 0).toUpperCase()
  expect(cover).toContain(hexOf('Oak & Co'))
  expect(cover).toContain(hexOf('Kitchen run'))
  expect(cover).toContain(hexOf('DRAFT'))
  // The logo is drawn as an image XObject on every page.
  for (let i = 0; i < doc.getPageCount(); i++) expect(pageContent(doc, i)).toMatch(/\bDo\b/)

  // Settings, including the logo, survive a reload (localStorage autosave).
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cabinetmaker:project') ?? '')).toContain('data:image/png;base64,')
  await page.reload()
  await openSection(page, 'Drawings & BOM')
  await openCard(page, 'Plan book')
  await expect(planBookCard(page).getByRole('img', { name: 'Logo preview' })).toBeVisible()
  await expect(planBookCard(page).getByLabel('Company', { exact: true })).toHaveValue('Oak & Co')
})

test('rejects a file that is not a PNG or JPEG, whatever its name', async ({ page }) => {
  await page.goto('/')
  await openSection(page, 'Drawings & BOM')
  await openCard(page, 'Plan book')
  const card = planBookCard(page)
  await card.getByLabel('Logo', { exact: true }).setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
  })
  await expect(card.getByRole('alert')).toContainText('PNG or JPEG')
  await expect(card.getByRole('img', { name: 'Logo preview' })).toHaveCount(0)
})
