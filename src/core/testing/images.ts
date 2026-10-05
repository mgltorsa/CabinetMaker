/**
 * Tiny, valid PNG and JPEG byte streams built in code, so image tests need no
 * binary fixtures. Test-only (uses node:zlib).
 */
import { deflateSync } from 'node:zlib'

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of bytes) {
    crc ^= b
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}

function chunk(type: string, data: Uint8Array): number[] {
  const typed = new Uint8Array([...Array.from(type, (c) => c.charCodeAt(0)), ...data])
  return [...u32(data.length), ...typed, ...u32(crc32(typed))]
}

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** A `width` × `height` RGBA PNG filled with one colour. */
export function tinyPng(width = 2, height = 1, rgba: [number, number, number, number] = [200, 40, 40, 255]): Uint8Array {
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0])
  const row = [0, ...Array.from({ length: width }, () => rgba).flat()]
  const raw = new Uint8Array(Array.from({ length: height }, () => row).flat())
  return new Uint8Array([...PNG_SIGNATURE, ...chunk('IHDR', ihdr), ...chunk('IDAT', deflateSync(raw)), ...chunk('IEND', new Uint8Array())])
}

/** PNG signature and IHDR only, claiming `width` × `height` (for dimension checks). */
export function pngHeader(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0])
  return new Uint8Array([...PNG_SIGNATURE, ...chunk('IHDR', ihdr)])
}

/**
 * Baseline JPEG structure (SOI, APP0, SOF0, EOI) for a `width` × `height`
 * 3-channel image. Enough for header parsing and for pdf-lib's `embedJpg`,
 * which copies the stream without decoding it.
 */
export function tinyJpeg(width = 3, height = 2): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9])
}

export function dataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
}
