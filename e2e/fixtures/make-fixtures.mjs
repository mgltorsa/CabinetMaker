// Writes the tiny model fixtures used by e2e/models.spec.ts and the loader
// unit tests: a 1 m cube as a self-contained GLB (positions, normals, indices)
// and as OBJ. Run with `node e2e/fixtures/make-fixtures.mjs`; output is committed.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const HALF = 0.5

// Six faces, four vertices each (flat normals), two triangles per face.
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
]

const positions = []
const normals = []
const indices = []
for (const { n, u, v } of FACES) {
  const base = positions.length / 3
  for (const [su, sv] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    for (let k = 0; k < 3; k++) positions.push(HALF * (n[k] + su * u[k] + sv * v[k]))
    normals.push(...n)
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

function cubeGlb() {
  const pos = new Float32Array(positions)
  const nor = new Float32Array(normals)
  const idx = new Uint16Array(indices)
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nor.buffer), Buffer.from(idx.buffer)])
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)])
  const json = {
    asset: { version: '2.0', generator: 'cabinetmaker e2e fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Cube' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.55, 0.62, 0.7, 1], metallicFactor: 0, roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: binPadded.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: nor.byteLength, target: 34962 },
      { buffer: 0, byteOffset: pos.byteLength + nor.byteLength, byteLength: idx.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [-HALF, -HALF, -HALF], max: [HALF, HALF, HALF] },
      { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
  }
  let text = JSON.stringify(json)
  while (text.length % 4 !== 0) text += ' '
  const jsonChunk = Buffer.from(text, 'utf8')
  const total = 12 + 8 + jsonChunk.length + 8 + binPadded.length
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(total, 8)
  const chunk = (data, type) => {
    const h = Buffer.alloc(8)
    h.writeUInt32LE(data.length, 0)
    h.writeUInt32LE(type, 4)
    return Buffer.concat([h, data])
  }
  return Buffer.concat([header, chunk(jsonChunk, 0x4e4f534a), chunk(binPadded, 0x004e4942)])
}

function cubeObj() {
  const lines = ['# 1 m cube (cabinetmaker e2e fixture)', 'o Cube']
  for (let i = 0; i < positions.length; i += 3) lines.push(`v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}`)
  for (let i = 0; i < normals.length; i += 3) lines.push(`vn ${normals[i]} ${normals[i + 1]} ${normals[i + 2]}`)
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] + 1, indices[i + 1] + 1, indices[i + 2] + 1]
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`)
  }
  return `${lines.join('\n')}\n`
}

writeFileSync(join(here, 'cube.glb'), cubeGlb())
writeFileSync(join(here, 'cube.obj'), cubeObj())
