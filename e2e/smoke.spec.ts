import { expect, test } from '@playwright/test'
import { exportedProject, importProject, openCard, openSection, projectMenu } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
})

test('loads the designer with the default cabinet', async ({ page }) => {
  await expect(page).toHaveTitle(/CabinetMaker/)
  await expect(page.getByRole('button', { name: 'Cabinet: Base cabinet' })).toBeVisible()
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('600')
  await expect(page.getByRole('button', { name: /^01·1 Dimensions 600 × 870 × 580 mm$/ })).toHaveAttribute('aria-expanded', 'true')
})

test('changing the width updates the summary and the cut list', async ({ page }) => {
  await openSection(page, 'Drawings & BOM')
  const table = page.getByRole('table').filter({ has: page.getByText(/^Cut list/) })
  await expect(table).toBeVisible()
  const before = await table.locator('tbody').innerText()

  await openSection(page, 'Cabinet')
  const width = page.getByLabel('Width', { exact: true })
  await width.fill('700')
  await width.press('Enter')
  await expect(width).toHaveValue('700')
  await expect(page.getByRole('button', { name: /^01·1 Dimensions 700 × 870 × 580 mm$/ })).toBeVisible()

  await openSection(page, 'Drawings & BOM')
  await expect(table.locator('tbody')).not.toHaveText(before)
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

test('view tabs switch by click and keyboard, and follow the sidebar section', async ({ page }) => {
  const front = page.getByRole('tab', { name: 'Front' })
  await front.click()
  await expect(front).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('img', { name: 'Base cabinet front elevation' })).toBeVisible()
  await front.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Side' })).toBeFocused()
  await page.getByRole('tab', { name: 'Side' }).press('End')
  await expect(page.getByRole('tab', { name: 'Joinery' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('navigation', { name: 'Panels' })).toBeVisible()

  await openSection(page, 'Drawings & BOM')
  await page.getByRole('tab', { name: 'Estimate' }).click()
  await expect(page.getByRole('heading', { name: 'Totals' })).toBeVisible()

  await openSection(page, 'CAM / CNC')
  await expect(page.getByRole('complementary', { name: 'CNC safety warning' })).toContainText('Preview only')
})

test('visibility pills toggle 3D layers', async ({ page }) => {
  const doorsOpen = page.getByRole('button', { name: 'Doors open' })
  await expect(doorsOpen).toHaveAttribute('aria-pressed', 'false')
  await doorsOpen.click()
  await expect(doorsOpen).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Dimensions', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('simple steppers edit the cabinet; advanced settings sit one level deeper', async ({ page }) => {
  await openCard(page, 'Drawers')
  await page.getByRole('button', { name: 'More: Drawers' }).click()
  await expect(page.getByRole('button', { name: /^01·7 Drawers 2 drawers/ })).toBeVisible()
  await expect(page.getByLabel('Rear clearance')).toHaveCount(0)
  await page.getByRole('button', { name: /^01·7 Drawers/ }).locator('..').getByRole('button', { name: 'Advanced' }).click()
  await expect(page.getByLabel('Rear clearance')).toBeVisible()
})

test('Export JSON downloads the project', async ({ page }) => {
  const { project, filename } = await exportedProject(page)
  expect(filename).toBe('untitled-cabinet.json')
  expect(project.schemaVersion).toBe(1)
  expect(project.cabinets).toHaveLength(1)
})

test('units toggle shows imperial fractions and parses them back', async ({ page }) => {
  const units = page.getByRole('radiogroup', { name: 'Units' })
  await units.getByRole('radio', { name: 'Inches' }).click()
  const width = page.getByLabel('Width', { exact: true })
  await expect(width).toHaveValue('23 5/8"')
  await width.fill('24')
  await width.press('Enter')
  await expect(width).toHaveValue('24"')
  await units.getByRole('radio', { name: 'Millimetres' }).click()
  await expect(width).toHaveValue('609.6')
})

test('new project asks what you are building and starts from the chosen preset', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await projectMenu(page, 'New project')
  await expect(page.getByRole('heading', { name: 'What are you building?' })).toBeVisible()
  await page.getByRole('button', { name: /Bookshelf/ }).click()
  await expect(page.getByRole('button', { name: 'Cabinet: Bookshelf' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^01·1 Dimensions 900 × 1800 × 300 mm$/ })).toBeVisible()
})

test('add cabinet opens the picker; the switcher selects cabinets', async ({ page }) => {
  await page.getByRole('button', { name: 'Cabinet: Base cabinet' }).click()
  await page.getByRole('menuitem', { name: /Add cabinet/ }).click()
  await page.getByRole('button', { name: /Wall cabinet/ }).click()
  await expect(page.getByRole('button', { name: 'Cabinet: Wall cabinet' })).toBeVisible()
  await page.getByRole('button', { name: 'Cabinet: Wall cabinet' }).click()
  await page.getByRole('menuitemradio', { name: /Base cabinet/ }).click()
  await expect(page.getByRole('button', { name: 'Cabinet: Base cabinet' })).toBeVisible()
})

test('importing an invalid file shows an error and keeps the project', async ({ page }) => {
  await importProject(page, { schemaVersion: 1, name: 'Broken' }, 'broken.json')
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
