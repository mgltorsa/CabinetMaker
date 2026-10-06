import { describe, expect, it } from 'vitest'
import { MAX_MODEL_BYTES } from '../lib/limits'
import { checkModelFile, externalGltfReference, formatFromName, glbJson, isZipBytes, modelNameFromFile, selfContainedError } from './format'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

/** Minimal GLB: header + JSON chunk (+ optional BIN chunk). */
function glb(json: object, bin = new Uint8Array(0)): Uint8Array {
  let text = JSON.stringify(json)
  while (text.length % 4 !== 0) text += ' '
  const jsonBytes = enc(text)
  const binLength = bin.byteLength === 0 ? 0 : 8 + Math.ceil(bin.byteLength / 4) * 4
  const total = 12 + 8 + jsonBytes.byteLength + binLength
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.byteLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  out.set(jsonBytes, 20)
  if (binLength > 0) {
    view.setUint32(20 + jsonBytes.byteLength, binLength - 8, true)
    view.setUint32(24 + jsonBytes.byteLength, 0x004e4942, true)
    out.set(bin, 28 + jsonBytes.byteLength)
  }
  return out
}

describe('formatFromName', () => {
  it('maps supported extensions, case-insensitively', () => {
    expect(formatFromName('Chair.GLB')).toBe('glb')
    expect(formatFromName('scene.gltf')).toBe('gltf')
    expect(formatFromName('sink.obj')).toBe('obj')
    expect(formatFromName('part.v2.stl')).toBe('stl')
  })

  it('rejects anything else', () => {
    expect(formatFromName('model.fbx')).toBeNull()
    expect(formatFromName('glb')).toBeNull()
    expect(formatFromName('evil.glb.exe')).toBeNull()
  })
})

describe('modelNameFromFile', () => {
  it('drops the extension and trims long names', () => {
    expect(modelNameFromFile('Fridge 60.glb')).toBe('Fridge 60')
    expect(modelNameFromFile(`${'x'.repeat(300)}.obj`)).toHaveLength(80)
    expect(modelNameFromFile('.stl')).toBe('Model')
  })
})

describe('checkModelFile', () => {
  it('accepts a supported file within the size limit', () => {
    expect(checkModelFile('a.glb', 1234)).toEqual({ ok: true, format: 'glb' })
  })

  it('rejects unsupported types, empty files and files over the limit', () => {
    expect(checkModelFile('a.fbx', 10)).toMatchObject({ ok: false, error: expect.stringMatching(/GLB, glTF, OBJ or STL/) })
    expect(checkModelFile('a.obj', 0)).toMatchObject({ ok: false, error: expect.stringMatching(/empty/) })
    expect(checkModelFile('a.stl', MAX_MODEL_BYTES + 1)).toMatchObject({ ok: false, error: expect.stringMatching(/50 MB/) })
  })
})

describe('externalGltfReference', () => {
  it('allows embedded data: URIs and buffer views', () => {
    const json = {
      buffers: [{ byteLength: 4, uri: 'data:application/octet-stream;base64,AAAAAA==' }],
      images: [{ bufferView: 0, mimeType: 'image/png' }, { uri: 'data:image/png;base64,iVBO' }],
    }
    expect(externalGltfReference(json)).toBeNull()
    expect(externalGltfReference({ buffers: [{ byteLength: 4 }] })).toBeNull() // GLB BIN chunk
  })

  it('names the first external buffer or image', () => {
    expect(externalGltfReference({ buffers: [{ byteLength: 4, uri: 'scene.bin' }] })).toBe('scene.bin')
    expect(externalGltfReference({ images: [{ uri: 'https://example.com/t.png' }] })).toBe('https://example.com/t.png')
    expect(externalGltfReference({ buffers: [{ uri: 'DATA:x' }, { uri: '../x.bin' }] })).toBe('../x.bin')
  })

  it('treats malformed JSON shapes as external (refuse rather than guess)', () => {
    expect(externalGltfReference(null)).toBe('(not a glTF object)')
    expect(externalGltfReference({ buffers: 'nope' })).toBe('(malformed buffers)')
    expect(externalGltfReference({ images: [{ uri: 7 }] })).toBe('(malformed images)')
  })
})

describe('glbJson', () => {
  it('reads the JSON chunk of a GLB', () => {
    expect(glbJson(glb({ asset: { version: '2.0' } }))).toEqual({ asset: { version: '2.0' } })
  })

  it('rejects non-GLB bytes and truncated chunks', () => {
    expect(() => glbJson(enc('solid cube'))).toThrow(/not a GLB/)
    const bytes = glb({ asset: { version: '2.0' } })
    expect(() => glbJson(bytes.slice(0, 24))).toThrow(/truncated/)
  })
})

describe('isZipBytes', () => {
  it('detects zips by content, whatever the file is called', () => {
    expect(isZipBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true)
    expect(isZipBytes(enc('{"name":"x"}'))).toBe(false)
    expect(isZipBytes(new Uint8Array(0))).toBe(false)
  })
})

describe('selfContainedError', () => {
  it('passes OBJ / STL and self-contained glTF', () => {
    expect(selfContainedError(enc('v 0 0 0'), 'obj')).toBeNull()
    expect(selfContainedError(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }, new Uint8Array(4)), 'glb')).toBeNull()
    expect(selfContainedError(enc(JSON.stringify({ asset: { version: '2.0' } })), 'gltf')).toBeNull()
  })

  it('rejects external buffers with a clear message', () => {
    const gltf = enc(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 4, uri: 'scene.bin' }] }))
    expect(selfContainedError(gltf, 'gltf')).toMatch(/external file \(scene\.bin\).*single \.glb/)
    expect(selfContainedError(glb({ images: [{ uri: 'wood.jpg' }] }), 'glb')).toMatch(/wood\.jpg/)
  })

  it('reports malformed JSON instead of throwing', () => {
    expect(selfContainedError(enc('{ nope'), 'gltf')).toBe('glTF JSON is malformed')
    expect(selfContainedError(enc('solid x'), 'glb')).toBe('File is not a GLB container')
  })
})
