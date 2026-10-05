/**
 * Checks on untrusted model files before any parser sees them: supported
 * type, size cap, and that glTF files are self-contained (no external buffers
 * or images, which would be fetched relative to the page).
 */
import type { ModelFormat } from '@/core/types'
import { MAX_MODEL_BYTES } from '../lib/limits'
import { isRecord } from '../lib/schema'

const EXTENSIONS: Readonly<Record<string, ModelFormat>> = { glb: 'glb', gltf: 'gltf', obj: 'obj', stl: 'stl' }
/** `accept` attribute for model file inputs. */
export const MODEL_FILE_ACCEPT = '.glb,.gltf,.obj,.stl,model/gltf-binary,model/gltf+json'
const MAX_NAME_LENGTH = 80
const BYTES_PER_MB = 1024 * 1024

const GLB_MAGIC = 0x46546c67 // 'glTF'
const GLB_CHUNK_JSON = 0x4e4f534a // 'JSON'
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] // 'PK\x03\x04'
const GLB_HEADER_BYTES = 12
const GLB_CHUNK_HEADER_BYTES = 8

/** True when `bytes` start like a zip archive (project bundles are detected by content, not by name). */
export function isZipBytes(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((b, i) => bytes[i] === b)
}

export function formatFromName(name: string): ModelFormat | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  return EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? null
}

/** Display name: file name without extension, bounded in length. */
export function modelNameFromFile(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = (dot > 0 ? fileName.slice(0, dot) : dot === 0 ? '' : fileName).trim()
  return base === '' ? 'Model' : base.slice(0, MAX_NAME_LENGTH)
}

export type FileCheck = { ok: true; format: ModelFormat } | { ok: false; error: string }

export function checkModelFile(name: string, size: number): FileCheck {
  const format = formatFromName(name)
  if (!format) return { ok: false, error: `“${name}” is not a supported model. Use GLB, glTF, OBJ or STL.` }
  if (size === 0) return { ok: false, error: `“${name}” is empty.` }
  if (size > MAX_MODEL_BYTES) return { ok: false, error: `“${name}” is larger than ${MAX_MODEL_BYTES / BYTES_PER_MB} MB.` }
  return { ok: true, format }
}

function externalUri(items: unknown, label: string): string | null {
  if (items === undefined) return null
  if (!Array.isArray(items)) return `(malformed ${label})`
  for (const item of items) {
    if (!isRecord(item)) return `(malformed ${label})`
    if (item.uri === undefined) continue
    if (typeof item.uri !== 'string') return `(malformed ${label})`
    if (!item.uri.toLowerCase().startsWith('data:')) return item.uri
  }
  return null
}

/**
 * The first buffer or image URI that is not embedded (`data:`), or `null` when
 * the glTF is self-contained. Malformed shapes count as external.
 */
export function externalGltfReference(json: unknown): string | null {
  if (!isRecord(json)) return '(not a glTF object)'
  return externalUri(json.buffers, 'buffers') ?? externalUri(json.images, 'images')
}

/** The parsed JSON chunk of a GLB container. Throws on anything else. */
export function glbJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) throw new Error('File is not a GLB container')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('File is not a GLB container')
  const length = view.getUint32(GLB_HEADER_BYTES, true)
  const type = view.getUint32(GLB_HEADER_BYTES + 4, true)
  const start = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES
  if (type !== GLB_CHUNK_JSON) throw new Error('GLB has no JSON chunk')
  if (start + length > bytes.byteLength) throw new Error('GLB JSON chunk is truncated')
  return JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length)))
}

/** `null` when `bytes` may be handed to the loader, else why not. */
export function selfContainedError(bytes: Uint8Array, format: ModelFormat): string | null {
  if (format !== 'glb' && format !== 'gltf') return null
  let json: unknown
  try {
    json = format === 'glb' ? glbJson(bytes) : JSON.parse(new TextDecoder().decode(bytes))
  } catch (error: unknown) {
    return error instanceof SyntaxError ? 'glTF JSON is malformed' : error instanceof Error ? error.message : 'glTF could not be read'
  }
  const external = externalGltfReference(json)
  if (external === null) return null
  return `glTF references an external file (${external.slice(0, MAX_NAME_LENGTH)}). Export it as a single .glb, or as .gltf with embedded buffers.`
}
