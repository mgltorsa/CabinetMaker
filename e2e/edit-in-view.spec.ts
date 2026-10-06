import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
})

test('3D: the width label edits the cabinet width', async ({ page }) => {
  const label = page.getByRole('button', { name: 'Width 600 mm, edit' })
  await label.click()
  const input = page.getByRole('textbox', { name: 'Width (mm)' })
  await expect(input).toBeFocused()
  await input.fill('700')
  await input.press('Enter')

  await expect(page.getByRole('button', { name: 'Width 700 mm, edit' })).toBeFocused()
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('700')
  await expect(page.getByRole('button', { name: /^01·1 Dimensions 700 × 870 × 580 mm$/ })).toBeVisible()
})

test('3D: an invalid width shows an error and Escape keeps the old value', async ({ page }) => {
  await page.getByRole('button', { name: 'Width 600 mm, edit' }).click()
  const input = page.getByRole('textbox', { name: 'Width (mm)' })
  await input.fill('20')
  await input.press('Enter')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert').filter({ hasText: 'Must be at least 50' })).toBeVisible()
  await input.press('Escape')
  await expect(page.getByRole('button', { name: 'Width 600 mm, edit' })).toBeFocused()
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('600')
})

test('Front: editing the drawer front height updates the front chain', async ({ page }) => {
  await page.getByRole('tab', { name: 'Front' }).click()
  const drawing = page.getByRole('img', { name: 'Base cabinet front elevation' })
  await expect(drawing).toBeVisible()

  // Keyboard: Enter on the focused label opens the editor.
  const drawerFront = page.getByRole('button', { name: 'Drawer 1.1 front height 150 mm, edit' })
  await drawerFront.focus()
  await drawerFront.press('Enter')
  const input = page.getByRole('textbox', { name: 'Drawer 1.1 front height (mm)' })
  await expect(input).toBeFocused()
  await input.fill('200')
  await input.press('Enter')

  await expect(page.getByRole('button', { name: 'Drawer 1.1 front height 200 mm, edit' })).toBeVisible()
  await expect(drawing.locator('text').filter({ hasText: /^200$/ })).toHaveCount(1)
  await expect(drawing.locator('text').filter({ hasText: /^150$/ })).toHaveCount(0)
})

test('Front: the toe kick dimension edits the toe kick height', async ({ page }) => {
  await page.getByRole('tab', { name: 'Front' }).click()
  await page.getByRole('button', { name: /^Toe kick height \d+ mm, edit$/ }).click()
  const input = page.getByRole('textbox', { name: 'Toe kick height (mm)' })
  await input.fill('120')
  await input.blur()
  await expect(page.getByRole('button', { name: 'Toe kick height 120 mm, edit' })).toBeVisible()
})

test('Side: depth typed in inches', async ({ page }) => {
  await page.getByRole('radiogroup', { name: 'Units' }).getByRole('radio', { name: 'Inches' }).click()
  await page.getByRole('tab', { name: 'Side' }).click()
  const drawing = page.getByRole('img', { name: 'Base cabinet side elevation' })
  await expect(drawing).toBeVisible()

  await page.getByRole('button', { name: /^Depth .+ in, edit$/ }).click()
  const input = page.getByRole('textbox', { name: 'Depth (in)' })
  await input.fill('23 1/2"')
  await input.press('Enter')

  await expect(page.getByRole('button', { name: 'Depth 23 1/2 in, edit' })).toBeVisible()
  await expect(drawing.locator('text').filter({ hasText: /^23 1\/2"$/ })).toHaveCount(1)
  await expect(page.getByLabel('Depth', { exact: true })).toHaveValue('23 1/2"')
})
