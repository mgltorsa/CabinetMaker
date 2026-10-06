import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, decodeImageDataUrl, sniffImage, toImageDataUrl } from './image'
import { dataUrl, pngHeader, tinyJpeg, tinyPng } from './testing/images'

const LIMITS = { maxBytes: 1024, maxDimension: 4096 }

describe('sniffImage', () => {
  it('detects PNG by magic bytes and reads its size', () => {
    expect(sniffImage(tinyPng(5, 3))).toEqual({ kind: 'png', width: 5, height: 3 })
  })

  it('detects JPEG by magic bytes and reads its size from the SOF marker', () => {
    expect(sniffImage(tinyJpeg(640, 480))).toEqual({ kind: 'jpeg', width: 640, height: 480 })
  })

  it.each([
    ['empty input', new Uint8Array()],
    ['GIF', new TextEncoder().encode('GIF89a\x01\x00\x01\x00')],
    ['SVG text', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['a truncated PNG signature', tinyPng().slice(0, 6)],
    ['a PNG signature without IHDR', tinyPng().slice(0, 12)],
    ['a JPEG without a frame header', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ['a JPEG with a bad segment length', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01])],
  ])('rejects %s', (_, bytes) => {
    expect(sniffImage(bytes)).toBeNull()
  })
})

describe('base64', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array(Array.from({ length: 300 }, (_, i) => (i * 37) % 256))
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  })

  it('rejects text outside the base64 alphabet', () => {
    expect(base64ToBytes('ab$c')).toBeNull()
    expect(base64ToBytes('abc')).toBeNull()
  })
})

describe('decodeImageDataUrl', () => {
  it('accepts PNG and JPEG data URLs whose bytes match the declared type', () => {
    const png = decodeImageDataUrl(dataUrl('image/png', tinyPng()), LIMITS)
    expect(png.ok && png.info.kind).toBe('png')
    const jpeg = decodeImageDataUrl(toImageDataUrl('jpeg', tinyJpeg()), LIMITS)
    expect(jpeg.ok && jpeg.info).toEqual({ kind: 'jpeg', width: 3, height: 2 })
  })

  it.each([
    ['a non data URL', 'https://example.com/logo.png', 'data:image/png'],
    ['an SVG data URL', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/png'],
    ['a GIF disguised as PNG', dataUrl('image/png', new TextEncoder().encode('GIF89a\x01\x00\x01\x00')), 'not a PNG or JPEG'],
    ['JPEG bytes declared as PNG', dataUrl('image/png', tinyJpeg()), 'declared as image/png'],
    ['broken base64', 'data:image/png;base64,iVBOR$$$', 'base64'],
  ])('rejects %s', (_, value, message) => {
    const result = decodeImageDataUrl(value, LIMITS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(message)
  })

  it('rejects images over the byte cap with the size in the message', () => {
    const big = new Uint8Array(2048)
    big.set(tinyPng())
    const result = decodeImageDataUrl(dataUrl('image/png', big), LIMITS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/2 KB.*at most 1 KB/)
  })

  it('rejects images with huge pixel dimensions (decompression bombs)', () => {
    const result = decodeImageDataUrl(dataUrl('image/png', pngHeader(50_000, 10)), LIMITS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('50000 x 10 px')
  })
})
