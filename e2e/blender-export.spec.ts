import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { openCard, openSection, projectMenu } from './helpers'

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
})

async function unzipDownload(download: Download): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await readFile(await download.path())))
}

async function downloadFromCard(page: Page): Promise<Download> {
  await openSection(page, 'Drawings & BOM')
  await openCard(page, 'Blender / Home Builder')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Blender bundle (.zip)' }).click()
  return downloadPromise
}

/** GLB header + JSON chunk (the BIN chunk is covered by unit tests). */
function glbJson(bytes: Uint8Array): { nodes: { name: string; children?: number[]; extras?: Record<string, unknown> }[] } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(dv.getUint32(0, true)).toBe(GLB_MAGIC)
  expect(dv.getUint32(4, true)).toBe(2)
  expect(dv.getUint32(8, true)).toBe(bytes.byteLength)
  const jsonLength = dv.getUint32(12, true)
  expect(jsonLength % 4).toBe(0)
  expect(dv.getUint32(16, true)).toBe(CHUNK_JSON)
  return JSON.parse(strFromU8(bytes.subarray(20, 20 + jsonLength))) as ReturnType<typeof glbJson>
}

test('the Blender card downloads a bundle with a GLB, thumbnail, manifest and script', async ({ page }) => {
  const download = await downloadFromCard(page)
  expect(download.suggestedFilename()).toBe('untitled-cabinet-blender.zip')
  const files = await unzipDownload(download)

  expect(Object.keys(files).sort()).toEqual([
    'README.txt',
    'cabinets/base-cabinet.glb',
    'cabinets/base-cabinet.png',
    'import_to_home_builder.py',
    'manifest.json',
  ])
  expect([...files['cabinets/base-cabinet.png']!.subarray(0, 8)]).toEqual(PNG_SIGNATURE)

  const gltf = glbJson(files['cabinets/base-cabinet.glb']!)
  const root = gltf.nodes[0]!
  expect(root.name).toBe('Base cabinet')
  expect(root.extras).toMatchObject({ cabinetType: 'base', widthMm: 600, heightMm: 870, depthMm: 580 })
  expect(root.children!.map((i) => gltf.nodes[i]!.name)).toContain('Left side')

  const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as { project: { name: string }; cabinets: { glb: string; thumbnail: string | null }[] }
  expect(manifest.project.name).toBe('Untitled cabinet')
  expect(manifest.cabinets).toEqual([expect.objectContaining({ glb: 'cabinets/base-cabinet.glb', thumbnail: 'cabinets/base-cabinet.png' })])
  expect(strFromU8(files['import_to_home_builder.py']!)).toContain('import bpy')
})

test('the project menu offers the same Blender bundle', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download')
  await projectMenu(page, 'Download Blender bundle (.zip)')
  const files = await unzipDownload(await downloadPromise)
  expect(files['cabinets/base-cabinet.glb']).toBeDefined()
  expect(files['README.txt']).toBeDefined()
})
