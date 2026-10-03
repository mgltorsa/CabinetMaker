import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'

type JsonProject = {
  name: string
  tools: { stepDown: number }[]
  hardware: { id: string; kind: string; props: Record<string, number> }[]
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
})

/** The current project, via the Export JSON button. */
async function exportedProject(page: Page): Promise<JsonProject> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await downloadPromise
  return JSON.parse(await readFile(await download.path(), 'utf8')) as JsonProject
}

async function importProject(page: Page, project: JsonProject): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
}

test('CAM names sheets per material and downloads matching .nc files', async ({ page }) => {
  await page.getByRole('tab', { name: 'CAM' }).click()
  const picker = page.getByLabel('Sheet', { exact: true })
  await expect(picker.locator('option').first()).toHaveText('Sheet 1 (ply-18#1) — 18 mm plywood')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ply-18#1 (.nc)' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('untitled-cabinet-ply-18-1.nc')
  const gcode = await readFile(await download.path(), 'utf8')
  expect(gcode).toContain('(Sheet: ply-18#1)')
  expect(gcode).toContain('(Material: 18 mm plywood, 18 mm)')
})

test('CAM errors on any sheet block every download and are listed per sheet', async ({ page }) => {
  await page.getByRole('tab', { name: 'CAM' }).click()
  const tableX = page.getByLabel('Table X')
  await tableX.fill('1000')
  await tableX.press('Enter')

  let downloads = 0
  page.on('download', () => downloads++)
  await page.getByRole('button', { name: /Download all sheets/ }).click()

  const blocked = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: 'G-code not written' }) })
  await expect(blocked).toBeVisible()
  await expect(blocked).toContainText('Sheet 1 (ply-18#1) — 18 mm plywood')
  await expect(blocked).toContainText('Sheet 1 (ply-6#1)')
  await expect(blocked).toContainText('larger than the 1000 × 1250 mm table')
  expect(downloads).toBe(0)
})

test('machine settings keep drills off profile/dado and flag duplicate tool numbers', async ({ page }) => {
  await page.getByRole('tab', { name: 'CAM' }).click()
  await expect(page.getByLabel('Profile tool').locator('option')).toHaveText([/^T1 /, /^T2 /])
  await expect(page.getByLabel('Dado tool').locator('option')).toHaveText([/^T1 /, /^T2 /])
  await expect(page.getByLabel('Drill tool').locator('option')).toHaveCount(3)
  await expect(page.getByLabel('Edge inset')).toHaveCount(0)

  const number = page.getByLabel('T3 number')
  await number.fill('1')
  await number.press('Enter')
  await expect(page.getByText('T1 is used by another tool; numbers must be unique')).toHaveCount(2)
  await expect(page.getByLabel('T1 number').first()).toHaveAttribute('aria-invalid', 'true')
})

test('importing a project with a runaway step down is rejected with its path', async ({ page }) => {
  const project = await exportedProject(page)
  project.name = 'Runaway'
  project.tools[0]!.stepDown = 0.001
  await importProject(page, project)
  await expect(page.getByRole('alert').filter({ hasText: 'Import failed: project.tools[0].stepDown must be at least 0.1' })).toBeVisible()
  await expect(page.getByLabel('Project name')).toHaveValue('Untitled cabinet')
})

test('side mount is offered only with side-mount slides in the catalog', async ({ page }) => {
  const project = await exportedProject(page)
  const undermountOnly = project.hardware.filter((h) => h.kind !== 'slide' || h.props.mount === 0)
  await importProject(page, { ...project, name: 'Undermount only', hardware: undermountOnly })
  await expect(page.getByLabel('Project name')).toHaveValue('Undermount only')
  await page.locator('summary', { hasText: /^Drawers$/ }).click()
  const mount = page.getByLabel('Slide mount')
  await expect(mount.locator('option[value="side-mount"]')).toBeDisabled()

  const sideSlide = { id: 'side-457', kind: 'slide', name: 'Side-mount slide 457 mm (pair)', manufacturer: 'Generic', sku: 'SIDE-457', unitCost: 15, props: { length: 457, mount: 1 } }
  await importProject(page, { ...project, name: 'With side mount', hardware: [...undermountOnly, sideSlide] })
  await expect(page.getByLabel('Project name')).toHaveValue('With side mount')
  await expect(mount.locator('option[value="side-mount"]')).toBeEnabled()
  await mount.selectOption('side-mount')

  await page.locator('summary', { hasText: /^Hardware$/ }).click()
  const slide = page.getByLabel('Slide', { exact: true })
  await expect(slide).toHaveValue('side-457')
  await expect(slide.locator('option')).toHaveText(['Side-mount slide 457 mm (pair) (Generic SIDE-457)'])
})
