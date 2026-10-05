/**
 * Reads a user-chosen logo / watermark image into a PNG or JPEG data URL for
 * the project. The file is untrusted: its type comes from the magic bytes
 * (never the name or the browser's MIME guess), its pixel size is checked
 * before the browser decodes it, and large images are shrunk on a canvas so
 * the project stays small enough for the localStorage autosave.
 */
import { formatBytes, IMAGE_MIME, imageProblem, sniffImage, toImageDataUrl, type ImageKind } from '@/core/image'
import type { Project } from '@/core/types'
import { PDF_LIMITS } from './limits'

/** Largest file read at all (before shrinking). */
export const MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024
/** Longest side kept on upload; plenty for a logo printed a few cm wide. */
export const UPLOAD_MAX_SIDE = 1600
/** Smaller sizes tried when a shrunk image is still over the byte cap. */
const FALLBACK_SIDES = [1024, 640] as const
/** Larger sources are refused rather than decoded by the browser. */
const MAX_SOURCE_SIDE = 12_000
const JPEG_QUALITY = 0.88
/**
 * Serialised project size (chars) that still autosaves: browsers allow about
 * 5 M chars of localStorage per origin, other keys need some of it.
 */
export const AUTOSAVE_BUDGET_CHARS = 4_000_000

const IMAGE_LIMITS = { maxBytes: PDF_LIMITS.imageBytes, maxDimension: PDF_LIMITS.imageDimension }

export type ImageUploadResult = { ok: true; dataUrl: string; isResized: boolean } | { ok: false; error: string }

/** Re-encode `bytes` (a `kind` image) with its longest side at most `maxSide` px. */
export type Resize = (bytes: Uint8Array, kind: ImageKind, maxSide: number) => Promise<Uint8Array>

/** Browser canvas resize; output keeps the input format (PNG keeps transparency). */
export const canvasResize: Resize = async (bytes, kind, maxSide) => {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: IMAGE_MIME[kind] }))
  try {
    const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height, 1))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * k))
    canvas.height = Math.max(1, Math.round(bitmap.height * k))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, IMAGE_MIME[kind], JPEG_QUALITY))
    if (!blob) throw new Error('The image could not be re-encoded')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    bitmap.close()
  }
}

const fail = (error: string): ImageUploadResult => ({ ok: false, error })

async function shrink(bytes: Uint8Array, kind: ImageKind, resize: Resize): Promise<ImageUploadResult> {
  let lastSize = bytes.length
  for (const side of [UPLOAD_MAX_SIDE, ...FALLBACK_SIDES]) {
    const out = await resize(bytes, kind, side)
    const info = sniffImage(out)
    if (!info) return fail('The image could not be converted to PNG or JPEG.')
    if (imageProblem(info, out.length, IMAGE_LIMITS) === null) return { ok: true, dataUrl: toImageDataUrl(info.kind, out), isResized: true }
    lastSize = out.length
  }
  return fail(`The image is still ${formatBytes(lastSize)} after shrinking; images must be at most ${formatBytes(PDF_LIMITS.imageBytes)}. Try a simpler image or a JPEG.`)
}

/** PNG/JPEG data URL for `file`, shrunk when needed, or a message for the user. */
export async function readImageFile(file: File, resize: Resize = canvasResize): Promise<ImageUploadResult> {
  if (file.size > MAX_UPLOAD_FILE_BYTES) return fail(`The file is ${formatBytes(file.size)}; choose an image under ${formatBytes(MAX_UPLOAD_FILE_BYTES)}.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = sniffImage(bytes)
  if (!info) return fail('Choose a PNG or JPEG image (this file is not a PNG or JPEG).')
  if (info.width < 1 || info.height < 1 || info.width > MAX_SOURCE_SIDE || info.height > MAX_SOURCE_SIDE) {
    return fail(`The image is ${info.width} x ${info.height} px; choose one at most ${MAX_SOURCE_SIDE} px on each side.`)
  }
  const isSmall = info.width <= UPLOAD_MAX_SIDE && info.height <= UPLOAD_MAX_SIDE && imageProblem(info, bytes.length, IMAGE_LIMITS) === null
  if (isSmall) return { ok: true, dataUrl: toImageDataUrl(info.kind, bytes), isResized: false }
  return shrink(bytes, info.kind, resize)
}

/** Whether `project` is small enough for the localStorage autosave. */
export function fitsAutosave(project: Project): boolean {
  return JSON.stringify(project).length <= AUTOSAVE_BUDGET_CHARS
}
