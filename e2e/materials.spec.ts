import { expect, test } from '@playwright/test'
import { exportedProject, openCard, openSection } from './helpers'

type ExportedMaterials = {
  materials: { id: string; name: string; thickness: number; color?: string }[]
  cabinets: { construction: { carcassMaterialId: string } }[]
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
})

test('a user material can be added, coloured, used, and only deleted once replaced', async ({ page }) => {
  // One long flow across three sidebar sections. The 2D front view keeps every
  // edit cheap; the 3D colour is covered by the scene unit tests.
  test.setTimeout(90_000)
  await openSection(page, 'Build Options')
  await page.getByRole('tab', { name: 'Front', exact: true }).click()
  await openCard(page, 'Material library')
  await expect(page.getByRole('button', { name: /^02·4 Material library 5 materials · 4 sheet, 1 linear$/ })).toBeVisible()

  // Add and edit a sheet material: the new row opens for editing.
  await page.getByRole('button', { name: 'Add sheet material' }).click()
  const added = page.getByRole('group', { name: 'New sheet material settings' })
  await added.getByLabel('Name', { exact: true }).fill('Walnut ply 19')
  await added.getByLabel('Name', { exact: true }).press('Enter')
  const row = page.getByRole('group', { name: 'Walnut ply 19 settings' })
  await row.getByLabel('Thickness', { exact: true }).fill('19')
  await row.getByLabel('Thickness', { exact: true }).press('Enter')
  await row.getByLabel('Colour', { exact: true }).fill('#123abc')
  await expect(row.getByLabel('Colour (hex)')).toHaveValue('#123abc')
  await expect(page.getByRole('button', { name: /^Walnut ply 19 19 mm · 2440 × 1220 mm · grained/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^02·4 Material library 6 materials · 5 sheet, 1 linear$/ })).toBeVisible()

  // Every material select picks it up: use it for the carcass.
  await openCard(page, 'Materials')
  await page.getByLabel('Carcass', { exact: true }).selectOption({ label: 'Walnut ply 19' })

  // The colour and the carcass assignment are persisted in the project.
  const { project } = (await exportedProject(page)) as unknown as { project: ExportedMaterials }
  const walnut = project.materials.find((m) => m.name === 'Walnut ply 19')
  expect(walnut).toMatchObject({ thickness: 19, color: '#123abc' })
  expect(walnut!.id).toMatch(/^new-sheet-material_[a-z0-9]+$/)
  expect(project.cabinets[0]!.construction.carcassMaterialId).toBe(walnut!.id)

  // Cut list and cut plan show it.
  await openSection(page, 'Drawings & BOM')
  const cutList = page.getByRole('table').filter({ has: page.getByText(/^Cut list/) })
  await expect(cutList.getByRole('cell', { name: 'Walnut ply 19' }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Cut plan', exact: true }).click()
  await expect(page.getByText(/^Sheet 1 \(.+#1\) — Walnut ply 19$/)).toBeVisible()

  // Deleting is blocked while the carcass uses it; replacing reassigns, then deletes.
  await openSection(page, 'Build Options')
  await openCard(page, 'Material library')
  await page.getByRole('button', { name: /^Walnut ply 19 / }).click()
  await page.getByRole('button', { name: 'Delete Walnut ply 19' }).click()
  const blocked = page.getByRole('alert').filter({ hasText: '“Walnut ply 19” is in use' })
  await expect(blocked).toContainText('Base cabinet: carcass')
  await page.getByLabel('Replace with').selectOption({ label: '18 mm plywood' })
  await page.getByRole('button', { name: 'Replace and delete' }).click()
  await expect(page.getByRole('button', { name: /^Walnut ply 19 / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^02·4 Material library 5 materials/ })).toBeVisible()
  await openCard(page, 'Materials')
  await expect(page.getByLabel('Carcass', { exact: true })).toHaveValue('ply-18')
})
