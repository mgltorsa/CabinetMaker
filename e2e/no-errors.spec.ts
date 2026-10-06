import { expect, test } from '@playwright/test'
import { openSection } from './helpers'

/** Every view of every preset renders without a single console or page error. */
test('no runtime errors across presets, views and units', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('dialog', (d) => void d.accept())
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()

  const presets = ['Bookshelf', 'Dresser', 'Nightstand', 'Custom box', 'Base cabinet', 'Drawer bank', 'Tall / pantry', 'Vanity', 'Wall cabinet']
  for (const preset of presets) {
    await page.getByRole('button', { name: /^Cabinet: / }).click()
    await page.getByRole('menuitem', { name: /Add cabinet/ }).click()
    await page.getByRole('button', { name: new RegExp(`^${preset.replace('/', '\\/')}`) }).click()
    await openSection(page, 'Cabinet')
    await page.getByRole('tab', { name: '3D', exact: true }).click()
    for (const pill of ['Doors open', 'Drawers open']) await page.getByRole('button', { name: pill, exact: true }).click()
    await page.waitForTimeout(400)
    for (const view of ['Front', 'Side', 'Joinery']) {
      await page.getByRole('tab', { name: view, exact: true }).click()
      await page.waitForTimeout(100)
    }
  }
  await page.getByRole('radiogroup', { name: 'Units' }).getByRole('radio', { name: 'Inches' }).click()
  await openSection(page, 'Drawings & BOM')
  for (const view of ['Cut list', 'Cut plan', 'Estimate']) {
    await page.getByRole('tab', { name: view, exact: true }).click()
    await page.waitForTimeout(150)
  }
  await openSection(page, 'CAM / CNC')
  await expect(page.getByRole('complementary', { name: 'CNC safety warning' })).toBeVisible()
  await openSection(page, 'Build Options')
  await page.getByRole('tab', { name: '3D', exact: true }).click()
  await page.waitForTimeout(500)

  expect(errors).toEqual([])
})
