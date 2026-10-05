import { expect, test, type Locator, type Page } from '@playwright/test'
import { exportedProject, openCard, openSection } from './helpers'

const CUBE_GLB = 'e2e/fixtures/cube.glb'

type JsonHandle = { style: string; color?: string; blobId?: string; unit?: string }
type JsonPull = { id: string; kind: string; name: string; unitCost: number; handle?: JsonHandle }

async function commit(field: Locator, value: string): Promise<void> {
  await field.fill(value)
  await field.press('Enter')
  await expect(field).toHaveValue(value)
}

/** Build Options → 02·5 Hardware catalog, scrolled to the Handles area. */
async function openHandles(page: Page): Promise<Locator> {
  await openSection(page, 'Build Options')
  await openCard(page, 'Hardware catalog')
  const area = page.getByRole('region', { name: 'Handles' })
  await expect(area).toBeVisible()
  return area
}

async function pulls(page: Page): Promise<JsonPull[]> {
  const { project } = await exportedProject(page)
  return (project.hardware as unknown as JsonPull[]).filter((h) => h.kind === 'pull')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
  // The front elevation is far cheaper to redraw on every edit than the WebGL view.
  await page.getByRole('tab', { name: 'Front', exact: true }).click()
})

test('creates, edits, duplicates and assigns a knob handle, priced in the estimate', async ({ page }) => {
  test.setTimeout(90_000)
  const handles = await openHandles(page)

  // Create: pick the style, add.
  await handles.getByLabel('New handle style').selectOption('knob')
  await handles.getByRole('button', { name: 'Add handle' }).click()
  const knob = page.getByRole('group', { name: 'New knob', exact: true })
  await expect(knob.getByLabel('Handle style')).toHaveValue('knob')
  await expect(knob.getByRole('img', { name: 'Preview: Knob' })).toBeVisible()

  // Edit: colour, diameter and cost.
  await commit(knob.getByLabel('Handle colour (hex)'), '#aa3311')
  await expect(knob.getByRole('img', { name: 'Preview: Knob' }).locator('circle[fill="#aa3311"]')).toHaveCount(1)
  await commit(knob.getByLabel('Knob diameter'), '35')
  await commit(knob.getByLabel('Unit cost'), '7.5')

  // Duplicate.
  await knob.getByRole('button', { name: 'Duplicate' }).click()
  await expect(handles.getByRole('button', { name: /^New knob copy Knob · \$7\.50/ })).toBeVisible()

  const saved = await pulls(page)
  const original = saved.find((h) => h.name === 'New knob')!
  const copy = saved.find((h) => h.name === 'New knob copy')!
  expect(original.handle).toMatchObject({ style: 'knob', color: '#aa3311' })
  expect(copy.handle).toEqual(original.handle)
  expect(copy.id).not.toBe(original.id)

  // Assign it to the cabinet (01·8 Doors → Pull).
  await openSection(page, 'Cabinet')
  await openCard(page, 'Doors')
  const pullSelect = page.getByLabel('Pull', { exact: true })
  await pullSelect.selectOption({ label: 'New knob' })
  await expect(pullSelect).toHaveValue(original.id)

  // The estimate prices one knob per front: the drawer and the two doors.
  await openSection(page, 'Drawings & BOM')
  await page.getByRole('tab', { name: 'Estimate' }).click()
  const cells = page.getByRole('row', { name: /^New knob/ }).first().getByRole('cell')
  await expect(cells.nth(2)).toHaveText('3 pcs')
  await expect(cells.nth(3)).toHaveText('$7.50')
  await expect(page.getByRole('row', { name: /^Bar pull 128/ })).toHaveCount(0)
})

test('imports a GLB as a custom handle', async ({ page }) => {
  const handles = await openHandles(page)
  await handles.locator('input[name="handle-import-file"]').setInputFiles(CUBE_GLB)
  await expect(page.getByRole('status').filter({ hasText: /Handle model “cube” imported/ })).toBeVisible()

  // A 1-unit glTF cube is read as 10 mm (handle-sized), not 1 m.
  const cube = page.getByRole('group', { name: 'cube', exact: true })
  await expect(cube.getByLabel('Handle style')).toHaveValue('custom')
  await expect(cube.getByText('GLB model · 10 × 10 × 10 mm')).toBeVisible()
  await expect(cube.getByLabel('Model units')).toHaveValue('cm')
  await expect(cube.getByRole('button', { name: 'Replace model…' })).toBeVisible()

  const saved = (await pulls(page)).find((h) => h.name === 'cube')!
  expect(saved.handle).toMatchObject({ style: 'custom', unit: 'cm' })
  expect(saved.handle?.blobId).toMatch(/^sha256-[0-9a-f]{64}$/)

  // On the cabinet, the 3D view loads the model from the browser's model store without errors.
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  await openSection(page, 'Cabinet')
  await openCard(page, 'Doors')
  await page.getByLabel('Pull', { exact: true }).selectOption({ label: 'cube' })
  await page.getByRole('tab', { name: '3D', exact: true }).click()
  await page.getByRole('button', { name: 'Doors open', exact: true }).click()
  await page.waitForTimeout(1000)
  expect(errors).toEqual([])
})
