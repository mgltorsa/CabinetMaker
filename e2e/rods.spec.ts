import { expect, test } from '@playwright/test'
import { openCard, openSection } from './helpers'

test('wardrobe preset: the hanging rod is in the cut list and toggles off in Layout', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()

  await page.getByRole('button', { name: /^Cabinet: / }).click()
  await page.getByRole('menuitem', { name: /Add cabinet/ }).click()
  const furniture = page.getByRole('heading', { name: 'Furniture' }).locator('..')
  await furniture.getByRole('button', { name: /^Wardrobe \/ closet tower/ }).click()
  await expect(page.getByRole('button', { name: 'Cabinet: Wardrobe' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^01·6 Shelves 1 shelf · 1 rod$/ })).toBeVisible()

  await openSection(page, 'Drawings & BOM')
  const cutList = page.getByRole('table').filter({ has: page.getByText(/^Cut list/) })
  await expect(cutList.getByRole('button', { name: 'Rod 1.1', exact: true })).toBeVisible()
  const rodRow = cutList.getByRole('row').filter({ has: page.getByRole('button', { name: 'Rod 1.1', exact: true }) })
  await expect(rodRow).toContainText('Wardrobe rod Ø25 chrome')
  await expect(rodRow).toContainText('958')

  await openSection(page, 'Cabinet')
  await openCard(page, 'Layout')
  const rodSwitch = page.getByRole('switch', { name: 'Bay 1 hanging rod' })
  await expect(rodSwitch).toBeChecked()
  await expect(page.getByLabel('Bay 1 rod drop from top')).toHaveValue('350')
  await rodSwitch.click()
  await expect(rodSwitch).not.toBeChecked()
  await expect(page.getByLabel('Bay 1 rod drop from top')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^01·6 Shelves 1 shelf$/ })).toBeVisible()

  await openSection(page, 'Drawings & BOM')
  await expect(cutList.getByRole('button', { name: 'Rod 1.1', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
