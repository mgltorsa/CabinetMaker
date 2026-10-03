import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
})

test('loads the designer with the default cabinet', async ({ page }) => {
  await expect(page).toHaveTitle(/CabinetMaker/)
  await expect(page.getByRole('heading', { name: 'Cabinets' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Base cabinet/, pressed: true })).toBeVisible()
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('600')
})

test('changing the width updates the parts table', async ({ page }) => {
  await page.getByRole('tab', { name: 'Parts' }).click()
  const table = page.getByRole('table').filter({ has: page.getByText(/^Cut list/) })
  await expect(table).toBeVisible()
  const before = await table.locator('tbody').innerText()

  const width = page.getByLabel('Width', { exact: true })
  await width.fill('700')
  await width.press('Enter')

  await expect(width).toHaveValue('700')
  await expect(table.locator('tbody')).not.toHaveText(before)
  await expect(page.getByRole('button', { name: /Base cabinet/, pressed: true })).toContainText('700 mm')
})

test('rejects an invalid length without committing it', async ({ page }) => {
  const width = page.getByLabel('Width', { exact: true })
  await width.fill('wide')
  await width.press('Enter')
  await expect(width).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a number of millimetres' })).toBeVisible()
  await width.press('Escape')
  await expect(width).toHaveValue('600')
})

test('tabs switch by click and keyboard', async ({ page }) => {
  const cut = page.getByRole('tab', { name: 'Cut plan' })
  await cut.click()
  await expect(cut).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: 'Cut plan' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()

  await cut.press('ArrowRight')
  const cam = page.getByRole('tab', { name: 'CAM' })
  await expect(cam).toHaveAttribute('aria-selected', 'true')
  await expect(cam).toBeFocused()
  await expect(page.getByRole('complementary', { name: 'CNC safety warning' })).toContainText('Preview only')

  await cam.press('End')
  await expect(page.getByRole('tab', { name: 'Estimate' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Totals' })).toBeVisible()
})

test('Export JSON downloads the project', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('untitled-cabinet.json')
  const path = await download.path()
  const project = JSON.parse(await readFile(path, 'utf8')) as { schemaVersion: number; cabinets: unknown[] }
  expect(project.schemaVersion).toBe(1)
  expect(project.cabinets).toHaveLength(1)
})

test('units toggle shows imperial fractions and parses them back', async ({ page }) => {
  await page.getByRole('group', { name: 'Units' }).getByRole('button', { name: 'in' }).click()
  const width = page.getByLabel('Width', { exact: true })
  await expect(width).toHaveValue('23 5/8"')
  await width.fill('24')
  await width.press('Enter')
  await expect(width).toHaveValue('24"')
  await page.getByRole('group', { name: 'Units' }).getByRole('button', { name: 'mm' }).click()
  await expect(width).toHaveValue('609.6')
})

test('importing an invalid file shows an error and keeps the project', async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, name: 'Broken' })),
  })
  await expect(page.getByRole('alert').filter({ hasText: 'Import failed' })).toBeVisible()
  await expect(page.getByLabel('Project name')).toHaveValue('Untitled cabinet')
})

test('autosaves edits across reloads', async ({ page }) => {
  const width = page.getByLabel('Width', { exact: true })
  await width.fill('650')
  await width.press('Enter')
  // Autosave is debounced; wait until the write lands.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cabinetmaker:project') ?? '')).toContain('"width":650')
  await page.reload()
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('650')
})
