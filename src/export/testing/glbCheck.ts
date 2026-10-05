/**
 * Independent GLB structure checker for tests. It re-parses the bytes without
 * using the writer's code so a writer bug cannot hide behind a matching reader.
 * Returns human-readable problems; an empty list means the file is well formed
 * for the subset of glTF 2.0 the exporter writes.
 */

const MAGIC_GLTF = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

export interface GltfAccessor {
  bufferView: number
  byteOffset?: number
  componentType: number
  count: number
  type: string
  min?: number[]
  max?: number[]
}

export interface GltfBufferView {
  buffer: number
  byteOffset?: number
  byteLength: number
  byteStride?: number
  target?: number
}

export interface GltfNode {
  name?: string
  children?: number[]
  mesh?: number
  translation?: number[]
  rotation?: number[]
  scale?: number[]
  matrix?: number[]
  extras?: Record<string, unknown>
}

export interface GltfMaterial {
  name?: string
  pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number }
  extras?: Record<string, unknown>
}

export interface GltfJson {
  asset: { version: string; generator?: string }
  scene?: number
  scenes?: { nodes: number[]; name?: string }[]
  nodes?: GltfNode[]
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }[] }[]
  materials?: GltfMaterial[]
  accessors?: GltfAccessor[]
  bufferViews?: GltfBufferView[]
  buffers?: { byteLength: number; uri?: string }[]
}

export interface ParsedGlb {
  json: GltfJson
  bin: Uint8Array
  problems: string[]
}

function readAccessor(acc: GltfAccessor, views: readonly GltfBufferView[], bin: Uint8Array): number[] {
  const view = views[acc.bufferView]
  if (!view) return []
  const n = TYPE_COMPONENTS[acc.type] ?? 1
  const size = COMPONENT_BYTES[acc.componentType] ?? 1
  const stride = view.byteStride ?? n * size
  const base = bin.byteOffset + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const dv = new DataView(bin.buffer)
  const out: number[] = []
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      const at = base + i * stride + c * size
      if (acc.componentType === 5126) out.push(dv.getFloat32(at, true))
      else if (acc.componentType === 5123) out.push(dv.getUint16(at, true))
      else if (acc.componentType === 5125) out.push(dv.getUint32(at, true))
      else out.push(dv.getUint8(at))
    }
  }
  return out
}

/** Values of one accessor (flattened), read straight from the BIN chunk. */
export function accessorValues(glb: ParsedGlb, index: number): number[] {
  const acc = glb.json.accessors?.[index]
  return acc ? readAccessor(acc, glb.json.bufferViews ?? [], glb.bin) : []
}

function checkAccessors(json: GltfJson, bin: Uint8Array, problems: string[]): void {
  const views = json.bufferViews ?? []
  ;(json.accessors ?? []).forEach((acc, i) => {
    const view = views[acc.bufferView]
    if (!view) {
      problems.push(`accessor ${i}: missing bufferView ${acc.bufferView}`)
      return
    }
    const n = TYPE_COMPONENTS[acc.type]
    const size = COMPONENT_BYTES[acc.componentType]
    if (n === undefined || size === undefined) {
      problems.push(`accessor ${i}: bad type/componentType`)
      return
    }
    const offset = acc.byteOffset ?? 0
    if ((offset + (view.byteOffset ?? 0)) % size !== 0) problems.push(`accessor ${i}: misaligned offset`)
    const stride = view.byteStride ?? n * size
    const end = offset + (acc.count - 1) * stride + n * size
    if (acc.count < 1 || end > view.byteLength) problems.push(`accessor ${i}: ${acc.count} elements overrun bufferView ${acc.bufferView}`)
    if (acc.min && acc.max) {
      const values = readAccessor(acc, views, bin)
      for (let c = 0; c < n; c++) {
        const column = values.filter((_, k) => k % n === c)
        if (Math.min(...column) !== acc.min[c] || Math.max(...column) !== acc.max[c]) problems.push(`accessor ${i}: min/max do not match data (component ${c})`)
      }
    }
  })
}

function checkStructure(json: GltfJson, binLength: number, problems: string[]): void {
  if (json.asset?.version !== '2.0') problems.push('asset.version is not 2.0')
  const buffer = json.buffers?.[0]
  const needsBuffer = (json.bufferViews ?? []).length > 0
  if (!buffer) {
    if (needsBuffer || binLength > 0) problems.push('buffer 0 (the BIN chunk) is missing')
  } else if (buffer.uri !== undefined) problems.push('buffer 0 must be the GLB BIN chunk (no uri)')
  else if (buffer.byteLength > binLength || binLength - buffer.byteLength > 3) problems.push('buffer 0 byteLength does not match the BIN chunk')
  ;(json.bufferViews ?? []).forEach((v, i) => {
    if ((v.byteOffset ?? 0) + v.byteLength > (buffer?.byteLength ?? 0)) problems.push(`bufferView ${i} is outside the buffer`)
    if (v.byteStride !== undefined && (v.byteStride % 4 !== 0 || v.byteStride < 4)) problems.push(`bufferView ${i}: bad byteStride`)
  })
  const nodeCount = json.nodes?.length ?? 0
  const meshCount = json.meshes?.length ?? 0
  const accessorCount = json.accessors?.length ?? 0
  ;(json.nodes ?? []).forEach((n, i) => {
    if (n.mesh !== undefined && n.mesh >= meshCount) problems.push(`node ${i}: bad mesh index`)
    for (const c of n.children ?? []) if (c >= nodeCount) problems.push(`node ${i}: bad child index`)
  })
  ;(json.meshes ?? []).forEach((m, i) => {
    for (const p of m.primitives) {
      for (const a of [...Object.values(p.attributes), ...(p.indices === undefined ? [] : [p.indices])]) {
        if (a >= accessorCount) problems.push(`mesh ${i}: bad accessor index`)
      }
      if (p.material !== undefined && p.material >= (json.materials?.length ?? 0)) problems.push(`mesh ${i}: bad material index`)
      const pos = json.accessors?.[p.attributes.POSITION ?? -1]
      if (!pos?.min || !pos.max) problems.push(`mesh ${i}: POSITION needs min/max`)
    }
  })
}

/** Parse a GLB and list everything wrong with it. */
export function parseGlb(bytes: Uint8Array): ParsedGlb {
  const problems: string[] = []
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const fail = (msg: string): ParsedGlb => ({ json: { asset: { version: '' } }, bin: new Uint8Array(0), problems: [msg] })
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) return fail('too short')
  if (dv.getUint32(0, true) !== MAGIC_GLTF) return fail('bad magic')
  if (dv.getUint32(4, true) !== 2) problems.push('version is not 2')
  if (dv.getUint32(8, true) !== bytes.byteLength) problems.push('header length does not match file length')
  if (bytes.byteLength % 4 !== 0) problems.push('file length not a multiple of 4')

  const jsonLength = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== CHUNK_JSON) return fail('first chunk is not JSON')
  if (jsonLength % 4 !== 0) problems.push('JSON chunk not 4-byte aligned')
  const jsonBytes = bytes.subarray(20, 20 + jsonLength)
  // Padding is spaces only: the last non-space byte must close the JSON object.
  let last = jsonBytes.length - 1
  while (last >= 0 && jsonBytes[last] === 0x20) last--
  if (jsonBytes[last] !== 0x7d) problems.push('JSON chunk must be padded with spaces')
  const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as GltfJson

  const binStart = 20 + jsonLength
  let bin: Uint8Array = new Uint8Array(0)
  if (binStart < bytes.byteLength) {
    const binLength = dv.getUint32(binStart, true)
    if (dv.getUint32(binStart + 4, true) !== CHUNK_BIN) problems.push('second chunk is not BIN')
    if (binLength % 4 !== 0) problems.push('BIN chunk not 4-byte aligned')
    if (binStart + CHUNK_HEADER_BYTES + binLength !== bytes.byteLength) problems.push('BIN chunk does not end the file')
    bin = bytes.subarray(binStart + CHUNK_HEADER_BYTES, binStart + CHUNK_HEADER_BYTES + binLength)
  }
  checkStructure(json, bin.byteLength, problems)
  checkAccessors(json, bin, problems)
  return { json, bin, problems }
}
