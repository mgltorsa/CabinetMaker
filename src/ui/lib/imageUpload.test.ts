import { describe, expect, it, vi } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { DEFAULT_PDF_SETTINGS } from '@/core/pdf-settings'
import { pngHeader, tinyJpeg, tinyPng } from '@/core/testing/images'
import { fitsAutosave, MAX_UPLOAD_FILE_BYTES, readImageFile, UPLOAD_MAX_SIDE, type Resize } from './imageUpload'
import { PDF_LIMITS } from './limits'

const file = (bytes: Uint8Array, name = 'logo.png', type = 'image/png'): File => new File([bytes.slice()], name, { type })

const noResize: Resize = () => Promise.reject(new Error('should not resize'))

describe('readImageFile', () => {
  it('keeps a small PNG or JPEG as is', async () => {
    const png = await readImageFile(file(tinyPng(4, 4)), noResize)
    expect(png).toEqual({ ok: true, dataUrl: `data:image/png;base64,${Buffer.from(tinyPng(4, 4)).toString('base64')}`, isResized: false })
    const jpeg = await readImageFile(file(tinyJpeg(), 'photo.jpg', 'image/jpeg'), noResize)
    expect(jpeg.ok && jpeg.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('judges the content, not the file name or type', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')
    const result = await readImageFile(file(svg, 'logo.png', 'image/png'), noResize)
    expect(result).toEqual({ ok: false, error: expect.stringContaining('PNG or JPEG') })
    const renamed = await readImageFile(file(tinyJpeg(), 'logo.png', 'image/png'), noResize)
    expect(renamed.ok && renamed.dataUrl.startsWith('data:image/jpeg')).toBe(true)
  })

  it('refuses huge files before reading them', async () => {
    const big = { size: MAX_UPLOAD_FILE_BYTES + 1, arrayBuffer: vi.fn() } as unknown as File
    const result = await readImageFile(big, noResize)
    expect(result.ok).toBe(false)
    expect(big.arrayBuffer).not.toHaveBeenCalled()
  })

  it('downscales large images and validates the result', async () => {
    const resize = vi.fn<Resize>(() => Promise.resolve(tinyPng(8, 8)))
    const result = await readImageFile(file(pngHeader(UPLOAD_MAX_SIDE * 2, 100)), resize)
    expect(resize).toHaveBeenCalledWith(expect.any(Uint8Array), 'png', UPLOAD_MAX_SIDE)
    expect(result.ok && result.isResized).toBe(true)
  })

  it('tries smaller sizes until the image fits the cap, then explains', async () => {
    const tooBig = new Uint8Array(PDF_LIMITS.imageBytes + 1)
    tooBig.set(tinyPng())
    const resize = vi.fn<Resize>(() => Promise.resolve(tooBig))
    const result = await readImageFile(file(pngHeader(5000, 5000)), resize)
    expect(resize.mock.calls.length).toBeGreaterThan(1)
    expect(result).toEqual({ ok: false, error: expect.stringContaining('at most 1 MB') })
  })

  it('rejects a resize that does not produce a PNG or JPEG', async () => {
    const result = await readImageFile(file(pngHeader(5000, 10)), () => Promise.resolve(new Uint8Array([1, 2, 3])))
    expect(result.ok).toBe(false)
  })
})

describe('fitsAutosave', () => {
  it('accepts normal projects and rejects ones too big for browser storage', () => {
    expect(fitsAutosave(fixtureProject())).toBe(true)
    const huge = { ...fixtureProject(), pdf: { ...DEFAULT_PDF_SETTINGS, notes: 'x'.repeat(6_000_000) } }
    expect(fitsAutosave(huge)).toBe(false)
  })
})
