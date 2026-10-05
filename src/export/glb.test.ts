import { describe, expect, it } from 'vitest'
import { BinaryWriter, encodeGlb } from './glb'
import { parseGlb } from './testing/glbCheck'

const minimal = (byteLength: number) => ({ asset: { version: '2.0' }, buffers: [{ byteLength }] })

describe('encodeGlb', () => {
  it('writes the header, a space-padded JSON chunk and a zero-padded BIN chunk', () => {
    const bin = new Uint8Array([1, 2, 3, 4, 5])
    const glb = encodeGlb(minimal(5), bin)
    const dv = new DataView(glb.buffer)

    expect(dv.getUint32(0, true)).toBe(0x46546c67) // "glTF"
    expect(dv.getUint32(4, true)).toBe(2)
    expect(dv.getUint32(8, true)).toBe(glb.byteLength)
    const jsonLength = dv.getUint32(12, true)
    expect(jsonLength % 4).toBe(0)
    const binHeader = 20 + jsonLength
    const binLength = dv.getUint32(binHeader, true)
    expect(binLength).toBe(8)
    expect([...glb.subarray(binHeader + 8)]).toEqual([1, 2, 3, 4, 5, 0, 0, 0])
    expect(parseGlb(glb).problems).toEqual([])
  })

  it('keeps multi-byte UTF-8 names aligned (byte length, not string length)', () => {
    const json = { ...minimal(0), nodes: [{ name: 'Tür — Ø 35 mm' }] }
    const glb = encodeGlb(json, new Uint8Array(0))
    const parsed = parseGlb(glb)

    expect(parsed.problems).toEqual([])
    expect(parsed.json.nodes?.[0]?.name).toBe('Tür — Ø 35 mm')
  })

  it('omits the BIN chunk when there is no binary data', () => {
    const glb = encodeGlb({ asset: { version: '2.0' } }, new Uint8Array(0))
    const jsonLength = new DataView(glb.buffer).getUint32(12, true)
    expect(glb.byteLength).toBe(20 + jsonLength)
  })
})

describe('BinaryWriter', () => {
  it('aligns every block to 4 bytes and reports its offset', () => {
    const w = new BinaryWriter()
    const a = w.append(new Uint16Array([1, 2, 3]))
    const b = w.append(new Float32Array([1.5]))
    const bytes = w.toBytes()

    expect(a).toEqual({ byteOffset: 0, byteLength: 6 })
    expect(b).toEqual({ byteOffset: 8, byteLength: 4 })
    expect(bytes.byteLength).toBe(12)
    expect(new DataView(bytes.buffer).getFloat32(8, true)).toBe(1.5)
  })
})
