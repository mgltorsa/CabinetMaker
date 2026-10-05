/**
 * Browser glue for project bundles: download the project with its model files
 * as one .zip, and import such a zip (restoring the files to the model store).
 * fflate loads on first use.
 */
import type { Project } from '@/core/types'
import { downloadBlob, slugify } from '../lib/download'
import { MAX_BUNDLE_BYTES } from '../lib/limits'
import { type ParseResult, parseProjectJson } from '../persistence'
import { notify } from '../toast'
import { getBlobStore } from './blobStore'
import { isZipBytes } from './format'
import { useModelUi } from './modelUi'

const MB = 1024 * 1024

/** Download `<project>-with-models.zip`; models whose file is missing here are left out with a warning. */
export async function downloadProjectBundle(project: Project): Promise<void> {
  const { buildProjectBundle } = await import('./bundle')
  const store = getBlobStore()
  const blobs = new Map<string, Uint8Array>()
  const missing: string[] = []
  for (const model of project.models ?? []) {
    if (blobs.has(model.blobId)) continue
    const bytes = await store.get(model.blobId)
    if (bytes) blobs.set(model.blobId, bytes)
    else missing.push(model.name)
  }
  const zip = buildProjectBundle(project, blobs)
  downloadBlob(zip.slice(), `${slugify(project.name)}-with-models.zip`, 'application/zip')
  if (missing.length > 0) notify('error', `Not in this browser, so not in the .zip: ${missing.join(', ')}`)
}

/**
 * Read a project file: JSON, or a .zip bundle (detected by content), whose
 * model files are stored first. The caller replaces the project on success.
 */
export async function readProjectFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_BUNDLE_BYTES) return { ok: false, error: `File is larger than ${MAX_BUNDLE_BYTES / MB} MB` }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isZipBytes(bytes)) return parseProjectJson(new TextDecoder().decode(bytes))
  const { readProjectBundle } = await import('./bundle')
  const read = await readProjectBundle(bytes)
  if (!read.ok) return read
  const store = getBlobStore()
  for (const [id, blob] of read.blobs) await store.put(id, blob)
  useModelUi.getState().bumpBlobEpoch()
  if (read.missing.length > 0) notify('error', `${read.missing.length} model file(s) were missing from the .zip; they show as placeholders.`)
  return { ok: true, project: read.project }
}
