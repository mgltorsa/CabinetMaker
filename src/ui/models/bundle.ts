/**
 * Project bundle: one .zip with `project.json` plus every referenced model
 * file (imported models and custom handles, see `blobRefs`) under
 * `models/<blobId>.<format>`, so a project with imported models can
 * move between browsers. Reading treats the zip as untrusted: size caps per
 * entry and in total, only referenced entries kept, content ids re-verified.
 */
import { strToU8, unzipSync, type UnzipFileInfo, zipSync, type Zippable } from 'fflate'
import type { Project } from '@/core/types'
import { MAX_BUNDLE_BYTES, MAX_MODEL_BYTES, MAX_PROJECT_JSON_BYTES } from '../lib/limits'
import { parseProjectJson } from '../persistence'
import { projectBlobRefs } from './blobRefs'
import { contentId, isBlobId } from './blobStore'
import { isZipBytes } from './format'

export const PROJECT_ENTRY = 'project.json'
const MODELS_DIR = 'models/'
/** Model entry: `models/<blobId>.<ext>`; nothing else under models/ is read. */
const MODEL_ENTRY = /^models\/([a-z0-9][a-z0-9-]{0,99})\.(glb|gltf|obj|stl)$/
/** Fast deflate: model files are large and often already dense. */
const MODEL_LEVEL = 1
export { isZipBytes }

/** Zip the project and the bytes of every model it references (files missing from `blobs` are skipped). */
export function buildProjectBundle(project: Project, blobs: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const files: Zippable = { [PROJECT_ENTRY]: strToU8(JSON.stringify(project, null, 2)) }
  for (const ref of projectBlobRefs(project)) {
    const bytes = blobs.get(ref.blobId)
    const name = `${MODELS_DIR}${ref.blobId}.${ref.format}`
    if (bytes && isBlobId(ref.blobId) && !(name in files)) files[name] = [bytes, { level: MODEL_LEVEL }]
  }
  return zipSync(files)
}

export type BundleRead =
  | {
      ok: true
      project: Project
      /** Verified model files by blob id. */
      blobs: Map<string, Uint8Array>
      /** Blob ids the project references that the bundle did not (validly) carry. */
      missing: string[]
    }
  | { ok: false; error: string }

const MB = 1024 * 1024

/** An entry that would inflate past the caps (thrown from the unzip filter). */
class BundleLimitError extends Error {}

/** Which entries to inflate; throws when one would inflate past the caps. */
function entryFilter(): (file: UnzipFileInfo) => boolean {
  let total = 0
  return (file) => {
    const isProject = file.name === PROJECT_ENTRY
    if (!isProject && !MODEL_ENTRY.test(file.name)) return false
    const cap = isProject ? MAX_PROJECT_JSON_BYTES : MAX_MODEL_BYTES
    total += file.originalSize
    if (file.originalSize > cap) throw new BundleLimitError(`${file.name} is too large (over ${cap / MB} MB)`)
    if (total > MAX_BUNDLE_BYTES) throw new BundleLimitError(`The .zip is too large (over ${MAX_BUNDLE_BYTES / MB} MB unpacked)`)
    return true
  }
}

export async function readProjectBundle(zip: Uint8Array): Promise<BundleRead> {
  if (zip.byteLength > MAX_BUNDLE_BYTES) return { ok: false, error: `The .zip is larger than ${MAX_BUNDLE_BYTES / MB} MB` }
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(zip, { filter: entryFilter() })
  } catch (error: unknown) {
    return { ok: false, error: error instanceof BundleLimitError ? error.message : 'File is not a readable .zip file' }
  }
  const json = entries[PROJECT_ENTRY]
  if (!json) return { ok: false, error: `The .zip has no ${PROJECT_ENTRY}` }
  const parsed = parseProjectJson(new TextDecoder().decode(json))
  if (!parsed.ok) return parsed

  const referenced = new Set(projectBlobRefs(parsed.project).map((r) => r.blobId))
  const blobs = new Map<string, Uint8Array>()
  for (const [name, bytes] of Object.entries(entries)) {
    const id = MODEL_ENTRY.exec(name)?.[1]
    if (id === undefined || !referenced.has(id) || blobs.has(id)) continue
    // Ids are content hashes: a mismatching file would poison the deduplicating store.
    if ((await contentId(bytes)) === id) blobs.set(id, bytes)
  }
  return { ok: true, project: parsed.project, blobs, missing: [...referenced].filter((id) => !blobs.has(id)) }
}
