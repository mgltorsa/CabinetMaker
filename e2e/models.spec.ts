import { readFile } from 'node:fs/promises'
import { expect as baseExpect, type Page, test } from '@playwright/test'
import { unzipSync } from 'fflate'
import { openSection } from './helpers'

// These tests keep a WebGL view busy while they work; give software rendering on loaded CI room.
const expect = baseExpect.configure({ timeout: 20_000 })
test.describe.configure({ timeout: 120_000 })

const CUBE_GLB = 'e2e/fixtures/cube.glb'
const CUBE_OBJ = 'e2e/fixtures/cube.obj'

/** Console and page errors collected for a test (the app must stay error-free). */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  return errors
}

const modelInput = (page: Page) => page.locator('input[name="model-file"]')
const modelList = (page: Page) => page.getByRole('list', { name: 'Imported models' })

async function openModels(page: Page): Promise<void> {
  await openSection(page, 'Room & Models')
  await expect(page.getByRole('button', { name: /Import model/ })).toBeVisible()
}

async function importCube(page: Page, file = CUBE_GLB): Promise<void> {
  await modelInput(page).setInputFiles(file)
  await expect(page.getByRole('status').filter({ hasText: /Imported “cube”/ })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
})

test('imports a GLB, moves it with numeric fields, and keeps it after a reload', async ({ page }) => {
  const errors = collectErrors(page)
  await openModels(page)
  await importCube(page)
  const row = modelList(page).getByRole('button', { name: /^cube / })
  await expect(row).toContainText('GLB · 1000 × 1000 × 1000 mm')
  await expect(row).toHaveAttribute('aria-pressed', 'true') // a new import is selected
  await expect(page.getByRole('toolbar', { name: 'Model gizmo' })).toBeVisible()

  const x = page.getByLabel('Position X')
  await x.fill('2500')
  await x.press('Enter')
  await expect(x).toHaveValue('2500')
  const rotation = page.getByLabel('Rotation')
  await rotation.fill('90')
  await rotation.press('Enter')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cabinetmaker:project') ?? '')).toContain('"rotationYDeg":90')

  await page.reload()
  await openModels(page)
  const restored = modelList(page).getByRole('button', { name: /^cube / })
  await expect(restored).toBeVisible()
  await expect(restored).not.toContainText('File missing') // bytes came back from IndexedDB
  await restored.click()
  await expect(page.getByLabel('Position X')).toHaveValue('2500')
  await expect(page.getByLabel('Rotation')).toHaveValue('90')
  await page.waitForTimeout(500) // let the 3D view load the model from storage
  expect(errors).toEqual([])
})

test('imports an OBJ in the chosen units and toggles models off and on', async ({ page }) => {
  const errors = collectErrors(page)
  await openModels(page)
  await page.getByLabel('Import units').selectOption('cm')
  await importCube(page, CUBE_OBJ)
  await expect(modelList(page).getByRole('button', { name: /^cube / })).toContainText('OBJ · 10 × 10 × 10 mm')
  await page.getByLabel('File units').selectOption('m')
  await expect(modelList(page).getByRole('button', { name: /^cube / })).toContainText('1000 × 1000 × 1000 mm')

  const pill = page.getByRole('button', { name: 'Models', exact: true })
  await expect(pill).toHaveAttribute('aria-pressed', 'true')
  await pill.click()
  await expect(pill).toHaveAttribute('aria-pressed', 'false')
  await pill.click()
  await page.getByRole('button', { name: 'Remove cube' }).click()
  await expect(modelList(page)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('refuses unsupported and external-buffer files with a clear message', async ({ page }) => {
  await openModels(page)
  const gltf = { asset: { version: '2.0' }, buffers: [{ byteLength: 8, uri: 'scene.bin' }] }
  await modelInput(page).setInputFiles({ name: 'scene.gltf', mimeType: 'model/gltf+json', buffer: Buffer.from(JSON.stringify(gltf)) })
  await expect(page.getByRole('alert').filter({ hasText: 'external file (scene.bin)' })).toBeVisible()
  await modelInput(page).setInputFiles({ name: 'broken.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('not a model at all') })
  await expect(page.getByRole('alert').filter({ hasText: 'Could not import “broken.glb”' })).toBeVisible()
  await expect(modelList(page)).toHaveCount(0)
})

test('builds a room with a door and places cabinets along the back wall', async ({ page }) => {
  const errors = collectErrors(page)
  await openModels(page)
  await page.getByLabel('Room width').fill('3600')
  await page.getByLabel('Room width').press('Enter')
  await page.getByRole('button', { name: 'Build room' }).click()
  await expect(page.getByRole('button', { name: /^05·1 Room 3600 mm × 3000 mm · 0 openings$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Add door' }).click()
  await expect(page.getByLabel('Door width')).toHaveValue('900')
  const roomPill = page.getByRole('button', { name: 'Room', exact: true })
  await roomPill.click()
  await expect(roomPill).toHaveAttribute('aria-pressed', 'false')
  await roomPill.click()

  await page.getByRole('button', { name: /^05·3 Cabinet placement/ }).click()
  await page.getByRole('button', { name: 'Place cabinets along back wall' }).click()
  await expect(page.getByRole('button', { name: /^05·3 Cabinet placement 1 of 1 placed freely$/ })).toBeVisible()
  const z = page.getByLabel('Base cabinet Z')
  await z.fill('400')
  await z.press('Enter')
  await expect(z).toHaveValue('400')
  await page.waitForTimeout(400)
  expect(errors).toEqual([])
})

test('exports a .zip with the model files and restores them in a browser that lacks them', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await openModels(page)
  await importCube(page)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project with models (.zip)' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('untitled-cabinet-with-models.zip')
  const zipPath = await download.path()
  const entries = unzipSync(new Uint8Array(await readFile(zipPath)))
  const names = Object.keys(entries)
  expect(names).toContain('project.json')
  const modelEntry = names.find((n) => n.startsWith('models/'))
  expect(modelEntry).toMatch(/^models\/sha256-[0-9a-f]{64}\.glb$/)
  expect(Buffer.from(entries[modelEntry!]!)).toEqual(await readFile(CUBE_GLB))

  // Simulate another browser: the project is there (localStorage) but the model store is empty.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cabinetmaker:project') ?? '')).toContain('"models"')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('cabinetmaker-models')
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      }),
  )
  await page.reload()
  await openModels(page)
  await expect(modelList(page).getByRole('button', { name: /^cube / })).toContainText('File missing')
  await expect(page.getByRole('status').filter({ hasText: 'not stored in this browser' })).toBeVisible()

  await page.locator('header input[type="file"]').setInputFiles(zipPath)
  await expect(page.getByRole('status').filter({ hasText: 'Imported “Untitled cabinet”' })).toBeVisible()
  await expect(modelList(page).getByRole('button', { name: /^cube / })).not.toContainText('File missing')
})
