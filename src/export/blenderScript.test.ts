import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { createPreset } from '@/engine'
import { runPipeline } from '@/pipeline'
import { BLENDER_SCRIPT, BLENDER_SCRIPT_NAME } from './blenderScript'
import { buildBlenderBundle } from './bundle'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = join(HERE, BLENDER_SCRIPT_NAME)
const HARNESS_PATH = join(HERE, 'testing', 'fake_bpy_run.py')

const hasPython = spawnSync('python3', ['--version']).status === 0

/** A real 1×1 PNG header is enough: the fake image loader reads IHDR width/height. */
const PNG_1PX = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
)

const tempDirs: string[] = []
afterEach(() => {
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function extractBundle(): { bundleDir: string; libraryDir: string } {
  const project = fixtureProject()
  project.cabinets.push({ ...createPreset('wall'), id: 'cab_2', name: 'Wall cabinet' })
  const zip = buildBlenderBundle(project, runPipeline(project), { thumbnails: new Map([['cab_1', PNG_1PX]]) })
  const root = mkdtempSync(join(tmpdir(), 'cm-blender-'))
  tempDirs.push(root)
  const bundleDir = join(root, 'bundle')
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    mkdirSync(dirname(join(bundleDir, name)), { recursive: true })
    writeFileSync(join(bundleDir, name), bytes)
  }
  return { bundleDir, libraryDir: join(root, 'library') }
}

function runHarness(bundleDir: string, libraryDir: string): { stdout: string; harness: { status: number; leftovers: Record<string, number>; writes: number } } {
  const run = spawnSync('python3', [HARNESS_PATH, SCRIPT_PATH, bundleDir, libraryDir], { encoding: 'utf8' })
  expect(run.stderr).toBe('')
  const last = run.stdout.trim().split('\n').at(-1) ?? ''
  expect(last.startsWith('HARNESS ')).toBe(true)
  return { stdout: run.stdout, harness: JSON.parse(last.slice('HARNESS '.length)) }
}

describe('Blender script', () => {
  it('ships import_to_home_builder.py byte-identical to the BLENDER_SCRIPT constant', () => {
    expect(readFileSync(SCRIPT_PATH, 'utf8')).toBe(BLENDER_SCRIPT)
  })

  it('documents both ways to run it', () => {
    expect(BLENDER_SCRIPT).toContain('blender --background --python import_to_home_builder.py -- <bundle dir> <library dir>')
    expect(BLENDER_SCRIPT).toMatch(/^BUNDLE_DIR = ""$/m)
    expect(BLENDER_SCRIPT).toMatch(/^LIBRARY_DIR = ""$/m)
  })

  it.skipIf(!hasPython)('is valid Python 3 syntax', () => {
    const check = spawnSync('python3', ['-c', 'import ast, sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1])', SCRIPT_PATH], {
      encoding: 'utf8',
    })
    expect(check.stderr).toBe('')
    expect(check.status).toBe(0)
  })
})

describe.skipIf(!hasPython)('Blender script against a stand-in bpy', () => {
  it('writes one asset .blend per cabinet, copies thumbnails and cleans up', () => {
    const { bundleDir, libraryDir } = extractBundle()
    const { stdout, harness } = runHarness(bundleDir, libraryDir)

    expect(harness.status).toBe(0)
    expect(harness.writes).toBe(2)
    expect(harness.leftovers).toEqual({ objects: 0, meshes: 0, materials: 0, collections: 0, scenes: 0, images: 0 })
    expect(readdirSync(libraryDir).sort()).toEqual(['base-cabinet.blend', 'base-cabinet.png', 'wall-cabinet.blend'])
    expect(stdout).toContain('2 of 2 cabinets written')
  })

  it('marks a collection named after the cabinet as an asset, with the cabinet metadata and a preview', () => {
    const { bundleDir, libraryDir } = extractBundle()
    runHarness(bundleDir, libraryDir)
    const blend = JSON.parse(readFileSync(join(libraryDir, 'base-cabinet.blend'), 'utf8')) as {
      blocks: { kind: string; name: string; props: Record<string, unknown>; asset?: { tags: string[] }; preview?: { size: number[]; pixels: number }; objects?: string[]; children?: string[]; generatedPreview: boolean }[]
    }
    const collection = blend.blocks.find((b) => b.kind === 'collection')!
    expect(collection.name).toBe('Base cabinet')
    expect(collection.props).toMatchObject({ cabinetId: 'cab_1', cabinetType: 'base', widthMm: 600, source: 'CabinetMaker' })
    expect(collection.asset?.tags).toEqual(['CabinetMaker', 'base'])
    expect(collection.preview).toEqual({ size: [256, 256], pixels: 256 * 256 * 4 })
    expect(collection.objects).toContain('Left side')
    expect(collection.objects).toContain('Base cabinet')
    expect(blend.blocks.find((b) => b.kind === 'scene')?.children).toEqual(['Base cabinet'])

    const wall = JSON.parse(readFileSync(join(libraryDir, 'wall-cabinet.blend'), 'utf8')) as typeof blend
    expect(wall.blocks.find((b) => b.kind === 'collection')?.generatedPreview).toBe(true)
  })

  it('reports a missing bundle instead of crashing', () => {
    const { libraryDir } = extractBundle()
    const { stdout, harness } = runHarness(join(libraryDir, 'nowhere'), libraryDir)
    expect(harness.status).toBe(2)
    expect(stdout).toContain('manifest.json not found')
  })

  it('reports a broken model, still writes the other cabinets and leaves nothing behind', () => {
    const { bundleDir, libraryDir } = extractBundle()
    writeFileSync(join(bundleDir, 'cabinets', 'wall-cabinet.glb'), 'not a glb')
    const { stdout, harness } = runHarness(bundleDir, libraryDir)
    expect(harness.status).toBe(1)
    expect(harness.writes).toBe(1)
    expect(harness.leftovers).toEqual({ objects: 0, meshes: 0, materials: 0, collections: 0, scenes: 0, images: 0 })
    expect(stdout).toContain('1 of 2 cabinets written')
    expect(stdout).toMatch(/FAILED {2}Wall cabinet: glTF import failed/)
  })

  it('refuses manifest paths that leave the bundle folder', () => {
    const { bundleDir, libraryDir } = extractBundle()
    const manifestPath = join(bundleDir, 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { cabinets: { glb: string; slug: string }[] }
    manifest.cabinets[0]!.glb = '../../outside.glb'
    manifest.cabinets[1]!.slug = '../escape'
    writeFileSync(manifestPath, JSON.stringify(manifest))
    const { stdout, harness } = runHarness(bundleDir, libraryDir)
    expect(harness.status).toBe(1)
    expect(stdout).toContain('File path leaves the bundle folder')
    expect(stdout).toContain('Unsafe file name in manifest')
    expect(harness.writes).toBe(0)
  })
})
