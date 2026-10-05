import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Mesh } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseModel } from './loaders'

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(fileURLToPath(new URL(`../../../e2e/fixtures/${name}`, import.meta.url))))
const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

const ASCII_STL = `solid tri
facet normal 0 0 1
 outer loop
  vertex 0 0 0
  vertex 600 0 0
  vertex 0 900 0
 endloop
endfacet
endsolid tri
`

describe('parseModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the 1 m cube GLB with its bounding box in file units', async () => {
    const parsed = await parseModel(fixture('cube.glb'), 'glb')
    expect(parsed.nativeSize).toEqual({ x: 1, y: 1, z: 1 })
    expect(parsed.centre).toEqual({ x: 0, y: 0, z: 0 })
    expect(parsed.minY).toBe(-0.5)
    let meshes = 0
    parsed.object.traverse((o) => {
      if (o instanceof Mesh) meshes++
    })
    expect(meshes).toBe(1)
  })

  it('reads the OBJ cube', async () => {
    const parsed = await parseModel(fixture('cube.obj'), 'obj')
    expect(parsed.nativeSize).toEqual({ x: 1, y: 1, z: 1 })
  })

  it('reads ASCII STL into a mesh', async () => {
    const parsed = await parseModel(enc(ASCII_STL), 'stl')
    expect(parsed.nativeSize).toEqual({ x: 600, y: 900, z: 0 })
    expect(parsed.object.children[0]).toBeInstanceOf(Mesh)
  })

  it('reads a glTF with an embedded (data:) buffer', async () => {
    // three's FileLoader (used for data: buffers) reports progress with the browser's ProgressEvent.
    if (typeof globalThis.ProgressEvent === 'undefined') {
      vi.stubGlobal('ProgressEvent', class extends Event {})
    }
    const glb = fixture('cube.glb')
    const view = new DataView(glb.buffer, glb.byteOffset)
    const jsonLength = view.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as { buffers: { byteLength: number; uri?: string }[] }
    const bin = glb.subarray(20 + jsonLength + 8)
    json.buffers[0]!.uri = `data:application/octet-stream;base64,${Buffer.from(bin).toString('base64')}`
    const parsed = await parseModel(enc(JSON.stringify(json)), 'gltf')
    expect(parsed.nativeSize).toEqual({ x: 1, y: 1, z: 1 })
  })

  it('refuses a glTF that points at an external buffer before loading anything', async () => {
    const gltf = enc(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 8, uri: 'cube.bin' }] }))
    await expect(parseModel(gltf, 'gltf')).rejects.toThrow(/external file \(cube\.bin\)/)
  })

  it('rejects garbage and models without geometry', async () => {
    await expect(parseModel(enc('this is not a model'), 'glb')).rejects.toThrow()
    await expect(parseModel(enc('# nothing\n'), 'obj')).rejects.toThrow(/no geometry/)
  })
})
