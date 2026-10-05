/**
 * Every model file a project references: imported scene models and custom
 * handle models. Bundles, "missing file" checks and "clear unused files" all
 * read this list so a handle's model is never dropped or deleted.
 */
import { handleModel } from '@/core/handles'
import type { ModelFormat, Project } from '@/core/types'

export interface BlobRef {
  blobId: string
  format: ModelFormat
  /** Display name of the first thing using the file (model or handle). */
  name: string
}

/** Referenced files, first use wins, each blob id once. */
export function projectBlobRefs(project: Project): BlobRef[] {
  const refs = new Map<string, BlobRef>()
  const add = (ref: BlobRef): void => {
    if (!refs.has(ref.blobId)) refs.set(ref.blobId, ref)
  }
  for (const m of project.models ?? []) add({ blobId: m.blobId, format: m.format, name: m.name })
  for (const h of project.hardware) {
    const model = h.kind === 'pull' ? handleModel(h) : null
    if (model) add({ blobId: model.blobId, format: model.format, name: h.name })
  }
  return [...refs.values()]
}
