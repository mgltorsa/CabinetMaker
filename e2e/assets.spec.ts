import { expect as baseExpect, type Page, test } from '@playwright/test'
import { openCard, openSection } from './helpers'

// These tests keep a WebGL view busy while they work (software rendering on CI
// takes seconds per interaction): allow for it.
const expect = baseExpect.configure({ timeout: 20_000 })
test.describe.configure({ timeout: 180_000 })

/** Console and page errors collected for a test (the app must stay error-free). */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  return errors
}

const placedList = (page: Page) => page.getByRole('list', { name: 'Placed assets' })
const placedRow = (page: Page, name: string) => placedList(page).getByRole('button', { name: new RegExp(`^${name} \\d`) })
const savedProject = (page: Page): Promise<string> => page.evaluate(() => localStorage.getItem('cabinetmaker:project') ?? '')
const addButton = (page: Page, name: string) => page.getByRole('button', { name: `Add ${name}`, exact: true })

async function openLibrary(page: Page): Promise<void> {
  await openSection(page, 'Room & Models')
  await openCard(page, 'Asset library')
  await expect(page.getByRole('list', { name: 'Asset catalog' })).toBeVisible()
}

async function commit(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label, { exact: true })
  await field.fill(value)
  await field.press('Enter')
  await expect(field).toHaveValue(value)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
})

test('adds a fridge, edits its width and colour, duplicates and deletes, and keeps it after a reload', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)

  await addButton(page, 'Fridge').click()
  await expect(placedRow(page, 'Fridge')).toHaveAttribute('aria-pressed', 'true') // a new asset is selected
  await expect(page.getByLabel('Asset width', { exact: true })).toHaveValue('700')
  await commit(page, 'Asset width', '900')
  await commit(page, 'Asset colour (hex)', '#3366aa')
  await expect(placedRow(page, 'Fridge')).toContainText('900 × 1800 × 680 mm')

  await page.getByRole('button', { name: 'Duplicate Fridge', exact: true }).click()
  await expect(placedRow(page, 'Fridge 2')).toHaveAttribute('aria-pressed', 'true')
  await expect(placedList(page).getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: 'Hide Fridge 2' }).click()
  await expect(page.getByRole('button', { name: 'Show Fridge 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Fridge 2' }).click()
  await expect(placedList(page).getByRole('listitem')).toHaveCount(1)
  await expect.poll(() => savedProject(page)).toContain('"color":"#3366aa"')

  await page.reload()
  await openLibrary(page)
  await expect(placedList(page).getByRole('listitem')).toHaveCount(1)
  await placedRow(page, 'Fridge').click()
  await expect(page.getByLabel('Asset width', { exact: true })).toHaveValue('900')
  await expect(page.getByLabel('Asset colour (hex)', { exact: true })).toHaveValue('#3366aa')
  await page.waitForTimeout(400) // let the 3D view draw it
  expect(errors).toEqual([])
})

test('adds a pendant light, switches it off and on, and toggles evening light and the Assets pill', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await page.getByRole('tab', { name: 'Lights' }).click()
  await addButton(page, 'Pendant light').click()
  await expect(placedRow(page, 'Pendant light')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('switch', { name: 'Light on' })).toBeChecked()

  await page.getByRole('button', { name: 'Turn off Pendant light' }).click()
  await expect(page.getByRole('button', { name: 'Turn on Pendant light' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('switch', { name: 'Light on' })).not.toBeChecked()
  await expect.poll(() => savedProject(page)).toContain('"on":false')

  const evening = page.getByRole('button', { name: 'Evening light', exact: true })
  await evening.click()
  await expect(evening).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('switch', { name: 'Light on' }).click()
  await expect(page.getByRole('button', { name: 'Turn off Pendant light' })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(500) // render the lit evening scene

  const pill = page.getByRole('button', { name: 'Assets', exact: true })
  await expect(pill).toHaveAttribute('aria-pressed', 'true')
  await pill.click()
  await expect(pill).toHaveAttribute('aria-pressed', 'false')
  await pill.click()
  await expect(pill).toHaveAttribute('aria-pressed', 'true')

  await expect.poll(() => savedProject(page)).toContain('"on":true')
  await page.reload()
  await openLibrary(page)
  await expect(page.getByRole('button', { name: 'Turn off Pendant light' })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(400)
  expect(errors).toEqual([])
})

test('searches the catalog and snaps an LED strip to the floor and under the wall cabinets', async ({ page }) => {
  const errors = collectErrors(page)
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search assets' }).fill('sofa')
  await expect(page.getByRole('list', { name: 'Asset catalog' }).getByRole('button')).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Search assets' }).fill('led')
  await addButton(page, 'Under-cabinet LED strip').click()
  await commit(page, 'Asset lift', '200')
  await page.getByRole('button', { name: 'Snap to floor' }).click()
  await expect(page.getByLabel('Asset lift', { exact: true })).toHaveValue('0')
  await page.getByRole('button', { name: 'Snap to under cabinets' }).click()
  // The default project has no wall cabinets: a typical 1400 mm underside, minus the strip's 12 mm.
  await expect(page.getByLabel('Asset lift', { exact: true })).toHaveValue('1388')
  await expect.poll(() => savedProject(page)).toContain('"assetId":"led-strip"')
  expect(errors).toEqual([])
})
