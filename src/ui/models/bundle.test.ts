import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Project, SceneModel } from '@/core/types'
import { MAX_MODEL_BYTES } from '../lib/limits'
import { contentId } from './blobStore'
import { buildProjectBundle, isZipBytes, PROJECT_ENTRY, readProjectBundle } from './bundle'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

async function modelFor(bytes: Uint8Array, over: Partial<SceneModel> = {}): Promise<SceneModel> {
  return {
    id: 'mdl_1',
    name: 'Cube',
    format: 'obj',
    blobId: await contentId(bytes),
    unit: 'm',
    nativeSize: { x: 1, y: 1, z: 1 },
    position: { x: 1000, y: 0, z: 500 },
    rotationYDeg: 0,
    scale: 1,
    visible: true,
    ...over,
  }
}

async function projectWith(files: Uint8Array[]): Promise<{ project: Project; blobs: Map<string, Uint8Array> }> {
  const models = await Promise.all(files.map((f, i) => modelFor(f, { id: `mdl_${i}` })))
  const blobs = new Map(models.map((m, i) => [m.blobId, files[i]!]))
  return { project: { ...fixtureProject(), models }, blobs }
}

describe('project bundle (.zip)', () => {
  it('round-trips the project and every model file', async () => {
    const files = [enc('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'), new Uint8Array([1, 2, 3, 4])]
    const { project, blobs } = await projectWith(files)
    const zip = buildProjectBundle(project, blobs)
    expect(isZipBytes(zip)).toBe(true)

    const read = await readProjectBundle(zip)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.project).toEqual(project)
    expect(read.blobs).toEqual(blobs)
    expect(read.missing).toEqual([])
  })

  it('names entries project.json and models/<blobId>.<format>', async () => {
    const { project, blobs } = await projectWith([enc('v 0 0 0')])
    const names = Object.keys(unzipSync(buildProjectBundle(project, blobs)))
    expect(names).toEqual([PROJECT_ENTRY, `models/${project.models![0]!.blobId}.obj`])
  })

  it('bundles a model file once even when several models share it', async () => {
    const file = enc('v 0 0 0')
    const { project, blobs } = await projectWith([file, file])
    expect(Object.keys(unzipSync(buildProjectBundle(project, blobs)))).toHaveLength(2)
  })

  it('reports referenced files that are missing from the bundle', async () => {
    const { project } = await projectWith([enc('v 0 0 0')])
    const read = await readProjectBundle(buildProjectBundle(project, new Map()))
    expect(read.ok && read.missing).toEqual([project.models![0]!.blobId])
  })

  it('drops files whose bytes do not match their content id (no store poisoning)', async () => {
    const { project } = await projectWith([enc('v 0 0 0')])
    const id = project.models![0]!.blobId
    const zip = zipSync({ [PROJECT_ENTRY]: strToU8(JSON.stringify(project)), [`models/${id}.obj`]: enc('tampered') })
    const read = await readProjectBundle(zip)
    expect(read.ok && read.blobs.size).toBe(0)
    expect(read.ok && read.missing).toEqual([id])
  })

  it('ignores unreferenced and oddly named entries', async () => {
    const { project, blobs } = await projectWith([enc('v 0 0 0')])
    const extra = enc('x')
    const zip = zipSync({
      [PROJECT_ENTRY]: strToU8(JSON.stringify(project)),
      ...Object.fromEntries([...blobs].map(([id, b]) => [`models/${id}.obj`, b])),
      [`models/${await contentId(extra)}.stl`]: extra,
      '../evil.sh': extra,
      'models/../../x.glb': extra,
    })
    const read = await readProjectBundle(zip)
    expect(read.ok && [...read.blobs.keys()]).toEqual([...blobs.keys()])
  })

  it('rejects bundles without a valid project', async () => {
    expect(await readProjectBundle(zipSync({ 'readme.txt': enc('hi') }))).toEqual({ ok: false, error: 'The .zip has no project.json' })
    expect(await readProjectBundle(zipSync({ [PROJECT_ENTRY]: enc('{') }))).toEqual({ ok: false, error: 'File is not valid JSON' })
    expect(await readProjectBundle(enc('not a zip'))).toMatchObject({ ok: false, error: expect.stringMatching(/not a readable \.zip/) })
  })

  it('refuses entries that inflate past the size limits (zip bomb guard)', async () => {
    const { project } = await projectWith([enc('v')])
    const zip = zipSync({ [PROJECT_ENTRY]: strToU8(JSON.stringify(project)), [`models/${project.models![0]!.blobId}.obj`]: enc('v') })
    // Forge the model's declared size in the central directory (what a bomb would claim) instead of deflating 50 MB.
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    const CENTRAL_HEADER = 0x02014b50
    const UNCOMPRESSED_SIZE_OFFSET = 24
    let headers = 0
    for (let i = 0; i + 4 <= zip.byteLength; i++) {
      if (view.getUint32(i, true) !== CENTRAL_HEADER) continue
      headers++
      if (headers === 2) view.setUint32(i + UNCOMPRESSED_SIZE_OFFSET, MAX_MODEL_BYTES + 1, true)
    }
    expect(headers).toBe(2)
    expect(await readProjectBundle(zip)).toMatchObject({ ok: false, error: expect.stringMatching(/too large/) })
  })
})
