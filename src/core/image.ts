/**
 * Untrusted raster images (plan-book logo and watermark). Only PNG and JPEG
 * are accepted, identified by magic bytes, never by file name or declared
 * type alone. Pixel size is read from the header so a tiny, highly
 * compressed file cannot expand into gigabytes when decoded.
 */

export type ImageKind = 'png' | 'jpeg'

export interface ImageInfo {
  kind: ImageKind
  width: number
  height: number
}

export interface ImageLimits {
  /** Decoded byte cap. */
  maxBytes: number
  /** Cap on each pixel dimension. */
  maxDimension: number
}

export type DecodedImage = { ok: true; info: ImageInfo; bytes: Uint8Array } | { ok: false; error: string }

export const IMAGE_MIME: Readonly<Record<ImageKind, string>> = { png: 'image/png', jpeg: 'image/jpeg' }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
/** IHDR is always the first chunk: length (4) + type (4) after the signature. */
const PNG_IHDR_TYPE_AT = 12
const PNG_WIDTH_AT = 16
const PNG_HEADER_LENGTH = 24

/** JPEG start-of-frame markers that carry the image size (not DHT 0xC4, JPG 0xC8, DAC 0xCC). */
const JPEG_SOF: ReadonlySet<number> = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
const JPEG_SOS = 0xda
/** Markers without a length field: TEM and RST0–7. */
const isStandalone = (m: number): boolean => m === 0x01 || (m >= 0xd0 && m <= 0xd7)

function u32be(b: Uint8Array, at: number): number {
  return (((b[at] ?? 0) << 24) | ((b[at + 1] ?? 0) << 16) | ((b[at + 2] ?? 0) << 8) | (b[at + 3] ?? 0)) >>> 0
}

function u16be(b: Uint8Array, at: number): number {
  return ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0)
}

function sniffPng(b: Uint8Array): ImageInfo | null {
  if (b.length < PNG_HEADER_LENGTH || !PNG_SIGNATURE.every((v, i) => b[i] === v)) return null
  const type = String.fromCharCode(...b.slice(PNG_IHDR_TYPE_AT, PNG_IHDR_TYPE_AT + 4))
  if (type !== 'IHDR') return null
  return { kind: 'png', width: u32be(b, PNG_WIDTH_AT), height: u32be(b, PNG_WIDTH_AT + 4) }
}

function sniffJpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null
  let i = 2
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1] ?? 0
    if (marker === 0xff) {
      i += 1 // fill byte
      continue
    }
    if (isStandalone(marker)) {
      i += 2
      continue
    }
    if (marker === JPEG_SOS || marker === 0xd9) return null
    const length = u16be(b, i + 2)
    if (length < 2) return null
    if (JPEG_SOF.has(marker)) {
      if (i + 8 >= b.length) return null
      return { kind: 'jpeg', height: u16be(b, i + 5), width: u16be(b, i + 7) }
    }
    i += 2 + length
  }
  return null
}

/** Kind and pixel size from the magic bytes and header, or `null` when not a PNG or JPEG. */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  return sniffPng(bytes) ?? sniffJpeg(bytes)
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/
/** Chunk size for String.fromCharCode spreads (stays well under argument limits). */
const ENCODE_CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += ENCODE_CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + ENCODE_CHUNK))
  return btoa(binary)
}

/** Decoded bytes, or `null` when `value` is not canonical padded base64. */
export function base64ToBytes(value: string): Uint8Array | null {
  if (value.length % 4 !== 0 || !BASE64_RE.test(value)) return null
  try {
    const binary = atob(value)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** Decoded size of a padded base64 string, without decoding it. */
function base64Size(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

export function toImageDataUrl(kind: ImageKind, bytes: Uint8Array): string {
  return `data:${IMAGE_MIME[kind]};base64,${bytesToBase64(bytes)}`
}

const MIB = 1024 * 1024

/** Human byte size rounded up, so anything over a cap reads as over it: `340 KB`, `2.3 MB`. */
export function formatBytes(n: number): string {
  if (n >= MIB) return `${(Math.ceil((n / MIB) * 10) / 10).toFixed(1).replace(/\.0$/, '')} MB`
  return `${Math.ceil(n / 1024)} KB`
}

/** Checks an image's header against `limits`; `null` when it is acceptable. */
export function imageProblem(info: ImageInfo, byteLength: number, limits: ImageLimits): string | null {
  if (byteLength > limits.maxBytes) return `is ${formatBytes(byteLength)}; images must be at most ${formatBytes(limits.maxBytes)}`
  if (info.width < 1 || info.height < 1 || info.width > limits.maxDimension || info.height > limits.maxDimension) {
    return `is ${info.width} x ${info.height} px; images must be 1 to ${limits.maxDimension} px on each side`
  }
  return null
}

const DATA_URL_RE = /^data:(image\/png|image\/jpeg);base64,/

/**
 * Validate and decode a PNG/JPEG data URL. Errors are phrased to follow a
 * field name, e.g. `project.pdf.logo ${error}`.
 */
export function decodeImageDataUrl(value: string, limits: ImageLimits): DecodedImage {
  const match = DATA_URL_RE.exec(value)
  if (!match) return { ok: false, error: 'must be a data:image/png or data:image/jpeg base64 URL' }
  const payload = value.slice(match[0].length)
  // Size check before decoding, so an oversized value costs nothing.
  const declaredSize = base64Size(payload)
  if (declaredSize > limits.maxBytes) return { ok: false, error: `is ${formatBytes(declaredSize)}; images must be at most ${formatBytes(limits.maxBytes)}` }
  const bytes = base64ToBytes(payload)
  if (!bytes) return { ok: false, error: 'is not valid base64' }
  const info = sniffImage(bytes)
  if (!info) return { ok: false, error: 'is not a PNG or JPEG image' }
  if (IMAGE_MIME[info.kind] !== match[1]) return { ok: false, error: `is declared as ${match[1]} but contains ${info.kind.toUpperCase()} data` }
  const problem = imageProblem(info, bytes.length, limits)
  return problem ? { ok: false, error: problem } : { ok: true, info, bytes }
}
