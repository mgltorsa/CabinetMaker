/**
 * Minimal glTF 2.0 binary (GLB) container writer. Spec:
 * https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout
 *
 *   header (12 B): magic "glTF", version 2, total length
 *   chunk 0: JSON, padded with spaces (0x20) to a multiple of 4
 *   chunk 1: BIN, padded with zeros to a multiple of 4 (omitted when empty)
 */

const MAGIC_GLTF = 0x46546c67
const GLB_VERSION = 2
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const ALIGN = 4
const SPACE = 0x20

const padTo4 = (n: number): number => Math.ceil(n / ALIGN) * ALIGN

/** Location of a block appended to the binary buffer. */
export interface BufferRange {
  byteOffset: number
  byteLength: number
}

/** Collects typed arrays into one little-endian buffer, each block 4-byte aligned. */
export class BinaryWriter {
  private readonly blocks: Uint8Array[] = []
  private length = 0

  append(data: Float32Array | Uint16Array | Uint32Array): BufferRange {
    const byteOffset = this.length
    // Typed arrays are platform-endian; every supported browser/node host is little-endian,
    // which is what glTF requires. Copy so later edits to `data` cannot change the file.
    const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    this.blocks.push(bytes)
    this.length = padTo4(byteOffset + bytes.byteLength)
    return { byteOffset, byteLength: bytes.byteLength }
  }

  get byteLength(): number {
    return this.length
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.length)
    let offset = 0
    for (const block of this.blocks) {
      out.set(block, offset)
      offset = padTo4(offset + block.byteLength)
    }
    return out
  }
}

/** Wrap a glTF JSON document and its binary buffer into a GLB file. */
export function encodeGlb(json: object, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = padTo4(jsonBytes.byteLength)
  const binLength = padTo4(bin.byteLength)
  const hasBin = bin.byteLength > 0
  const total = HEADER_BYTES + CHUNK_HEADER_BYTES + jsonLength + (hasBin ? CHUNK_HEADER_BYTES + binLength : 0)

  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, MAGIC_GLTF, true)
  dv.setUint32(4, GLB_VERSION, true)
  dv.setUint32(8, total, true)

  dv.setUint32(12, jsonLength, true)
  dv.setUint32(16, CHUNK_JSON, true)
  out.set(jsonBytes, 20)
  out.fill(SPACE, 20 + jsonBytes.byteLength, 20 + jsonLength)

  if (hasBin) {
    const binHeader = 20 + jsonLength
    dv.setUint32(binHeader, binLength, true)
    dv.setUint32(binHeader + 4, CHUNK_BIN, true)
    out.set(bin, binHeader + CHUNK_HEADER_BYTES) // zero padding: `out` starts zero-filled
  }
  return out
}
