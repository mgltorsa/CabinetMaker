import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project } from '@/core/types'
import { createPreset } from '@/engine'
import { runPipeline } from '@/pipeline'
import { BLENDER_SCRIPT } from './blenderScript'
import { buildBlenderBundle, type BundleManifest } from './bundle'
import { cabinetSlugs } from './slug'
import { parseGlb } from './testing/glbCheck'

/** 8-byte PNG signature + filler: the bundle stores thumbnails as given. */
const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function twoCabinets(): Project {
  const project = fixtureProject()
  project.name = 'Kitchen Run #2'
  project.cabinets.push({ ...createPreset('wall'), id: 'cab_2', name: 'Wall cabinet' })
  return project
}

function unzipBundle(project: Project, thumbnails?: ReadonlyMap<string, Uint8Array>) {
  const files = unzipSync(buildBlenderBundle(project, runPipeline(project), { thumbnails }))
  const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as BundleManifest
  return { files, manifest }
}

describe('cabinetSlugs', () => {
  it('slugs names and keeps them unique', () => {
    const slugs = cabinetSlugs([
      { id: 'a', name: 'Base cabinet' },
      { id: 'b', name: 'Base Cabinet' },
      { id: 'c', name: 'Évier / sink' },
      { id: 'd', name: '***' },
      { id: 'e', name: 'base-cabinet-2' },
    ])
    expect([...slugs.values()]).toEqual(['base-cabinet', 'base-cabinet-2', 'evier-sink', 'cabinet', 'base-cabinet-2-2'])
  })

  it('never produces path separators or dots-only names', () => {
    const slugs = cabinetSlugs([{ id: 'x', name: '../../etc/passwd' }, { id: 'y', name: '..' }])
    for (const s of slugs.values()) expect(s).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('buildBlenderBundle', () => {
  it('zips one GLB per cabinet plus the manifest, the script and a README', () => {
    const { files } = unzipBundle(twoCabinets())
    expect(Object.keys(files).sort()).toEqual([
      'README.txt',
      'cabinets/base-cabinet.glb',
      'cabinets/wall-cabinet.glb',
      'import_to_home_builder.py',
      'manifest.json',
    ])
  })

  it('writes valid GLB files', () => {
    const { files } = unzipBundle(twoCabinets())
    for (const name of ['cabinets/base-cabinet.glb', 'cabinets/wall-cabinet.glb']) {
      expect(parseGlb(files[name]!).problems).toEqual([])
    }
    expect(parseGlb(files['cabinets/wall-cabinet.glb']!).json.nodes![0]!.name).toBe('Wall cabinet')
  })

  it('adds the PNG thumbnails it is given, next to the GLB with the same name', () => {
    const { files, manifest } = unzipBundle(twoCabinets(), new Map([['cab_1', FAKE_PNG]]))
    expect([...files['cabinets/base-cabinet.png']!]).toEqual([...FAKE_PNG])
    expect(files['cabinets/wall-cabinet.png']).toBeUndefined()
    expect(manifest.cabinets.map((c) => c.thumbnail)).toEqual(['cabinets/base-cabinet.png', null])
  })

  it('ships the script byte-identical to BLENDER_SCRIPT', () => {
    const { files } = unzipBundle(twoCabinets())
    expect(strFromU8(files['import_to_home_builder.py']!)).toBe(BLENDER_SCRIPT)
  })

  it('is deterministic for the same input', () => {
    const project = twoCabinets()
    const result = runPipeline(project)
    expect(buildBlenderBundle(project, result)).toEqual(buildBlenderBundle(project, result))
  })
})

describe('bundle manifest', () => {
  it('names the project, the format and the units', () => {
    const { manifest } = unzipBundle(twoCabinets())
    expect(manifest.format).toBe('cabinetmaker-blender-bundle')
    expect(manifest.version).toBe(1)
    expect(manifest.project).toEqual({ id: 'prj_fixture', name: 'Kitchen Run #2' })
    expect(manifest.units).toEqual({ geometry: 'm', dimensions: 'mm', display: 'metric' })
    expect(manifest.axes.up).toBe('+Y')
    expect(manifest.script).toBe('import_to_home_builder.py')
  })

  it('lists each cabinet with its files and dimensions', () => {
    const { manifest } = unzipBundle(twoCabinets())
    const [base, wall] = manifest.cabinets
    expect(base).toMatchObject({ id: 'cab_1', name: 'Base cabinet', slug: 'base-cabinet', type: 'base', glb: 'cabinets/base-cabinet.glb' })
    expect(base).toMatchObject({ widthMm: 600, heightMm: 870, depthMm: 580, floorHeightMm: 0, constructionStyle: 'frameless-overlay' })
    expect(wall).toMatchObject({ slug: 'wall-cabinet', type: 'wall', floorHeightMm: 1450 })
  })

  it("repeats each GLB's root extras so the script can copy them without parsing the GLB", () => {
    const project = twoCabinets()
    const { files, manifest } = unzipBundle(project)
    const glb = parseGlb(files['cabinets/base-cabinet.glb']!)
    expect(manifest.cabinets[0]!.extras).toEqual(glb.json.nodes![0]!.extras)
    expect(manifest.cabinets[0]!.partCount).toBe(glb.json.nodes![0]!.children!.length)
  })

  it('lists the materials used, with names and thickness', () => {
    const { manifest } = unzipBundle(twoCabinets())
    const ids = manifest.materials.map((m) => m.id)
    expect(ids).toEqual(['ply-18', 'ply-6', 'bb-12', 'mdf-18'])
    expect(manifest.materials[0]).toMatchObject({ id: 'ply-18', name: '18 mm plywood', kind: 'sheet', thicknessMm: 18 })
    expect(manifest.cabinets[1]!.materialIds).toEqual(['ply-18', 'ply-6', 'mdf-18'])
  })

  it('lists hardware with manufacturer SKUs, per cabinet and in total', () => {
    const { manifest } = unzipBundle(twoCabinets())
    const hinges = manifest.hardware.find((h) => h.id === 'blum-cliptop-110')!
    expect(hinges).toMatchObject({ kind: 'hinge', manufacturer: 'Blum', sku: 'CLIP top 71B3550', qty: 8 })
    const baseSlides = manifest.cabinets[0]!.hardware.find((h) => h.kind === 'slide')!
    expect(baseSlides).toMatchObject({ id: 'blum-tandem-533', sku: 'TANDEM 563H5330B', qty: 1, note: 'Drawer slide pairs' })
    expect(manifest.cabinets[1]!.hardware.some((h) => h.kind === 'slide')).toBe(false)
  })

  it('keeps hardware that is missing from the catalog, by id', () => {
    const project = twoCabinets()
    const result = runPipeline(project)
    project.hardware = project.hardware.filter((h) => h.id !== 'pin-5')
    const files = unzipSync(buildBlenderBundle(project, result))
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as BundleManifest
    expect(manifest.hardware.find((h) => h.id === 'pin-5')).toMatchObject({ name: 'pin-5', sku: '', manufacturer: '' })
  })

  it('skips a cabinet without a build and says so', () => {
    const project = twoCabinets()
    const result = runPipeline(project)
    const partial = { ...result, build: { ...result.build, cabinets: result.build.cabinets.filter((c) => c.cabinetId !== 'cab_2') } }
    const files = unzipSync(buildBlenderBundle(project, partial))
    const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as BundleManifest
    expect(manifest.cabinets.map((c) => c.id)).toEqual(['cab_1'])
    expect(manifest.skipped).toEqual([{ id: 'cab_2', name: 'Wall cabinet', reason: 'The cabinet could not be built' }])
    expect(files['cabinets/wall-cabinet.glb']).toBeUndefined()
  })
})

describe('bundle README', () => {
  it('explains how to run the script and add the asset library, and how it was tested', () => {
    const { files } = unzipBundle(twoCabinets())
    const readme = strFromU8(files['README.txt']!)
    expect(readme).toContain('Kitchen Run #2')
    expect(readme).toContain('blender --background --python import_to_home_builder.py --')
    expect(readme).toContain('File Paths')
    expect(readme).toContain('Asset Libraries')
    expect(readme).toContain('Home Builder')
    expect(readme).toMatch(/not been run inside Blender/i)
    expect(readme).toContain('base-cabinet')
  })
})
