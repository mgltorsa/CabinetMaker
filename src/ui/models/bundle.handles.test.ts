import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { HardwareItem, Project, SceneModel } from '@/core/types'
import { contentId, unusedBlobIds } from './blobStore'
import { projectBlobRefs } from './blobRefs'
import { buildProjectBundle, readProjectBundle } from './bundle'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

async function customHandle(bytes: Uint8Array, id = 'pull-custom'): Promise<HardwareItem> {
  return {
    id,
    kind: 'pull',
    name: 'Shell handle',
    manufacturer: '',
    sku: '',
    unitCost: 3,
    props: { centers: 0 },
    handle: { style: 'custom', blobId: await contentId(bytes), format: 'stl', unit: 'mm', nativeSize: { x: 120, y: 20, z: 25 } },
  }
}

async function withHandle(bytes: Uint8Array): Promise<{ project: Project; blobId: string }> {
  const item = await customHandle(bytes)
  return { project: { ...fixtureProject(), hardware: [...fixtureProject().hardware, item] }, blobId: item.handle!.blobId! }
}

describe('project bundle: custom handle models', () => {
  it('lists blobs of models and custom handles once each', async () => {
    const bytes = enc('solid handle')
    const { project, blobId } = await withHandle(bytes)
    const model: SceneModel = { id: 'm', name: 'Same file', format: 'stl', blobId, unit: 'mm', nativeSize: { x: 1, y: 1, z: 1 }, position: { x: 0, y: 0, z: 0 }, rotationYDeg: 0, scale: 1, visible: true }
    expect(projectBlobRefs(project)).toEqual([{ blobId, format: 'stl', name: 'Shell handle' }])
    expect(projectBlobRefs({ ...project, models: [model] })).toHaveLength(1)
    expect(projectBlobRefs(fixtureProject())).toEqual([])
  })

  it('zips a custom handle’s model file and restores it on import', async () => {
    const bytes = enc('solid handle\nendsolid handle\n')
    const { project, blobId } = await withHandle(bytes)
    const zip = buildProjectBundle(project, new Map([[blobId, bytes]]))
    expect(Object.keys(unzipSync(zip))).toContain(`models/${blobId}.stl`)

    const read = await readProjectBundle(zip)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.project).toEqual(project)
    expect(read.blobs.get(blobId)).toEqual(bytes)
    expect(read.missing).toEqual([])
  })

  it('reports a missing handle model file', async () => {
    const { project, blobId } = await withHandle(enc('gone'))
    const read = await readProjectBundle(buildProjectBundle(project, new Map()))
    expect(read.ok && read.missing).toEqual([blobId])
  })

  it('never offers a handle’s model file as unused', async () => {
    const { project, blobId } = await withHandle(enc('kept'))
    expect(unusedBlobIds([blobId, 'sha256-other'], projectBlobRefs(project))).toEqual(['sha256-other'])
  })
})
