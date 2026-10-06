/**
 * Binary geometry for the GLB writer: any number of box meshes sharing one
 * normal and one index accessor. Each box gets its own POSITION accessor;
 * positions are relative to the owning node (offset baked in).
 */
import { BOX_INDEX_COUNT, BOX_INDICES, BOX_NORMALS, BOX_VERTEX_COUNT, boxPositions } from './box'
import { BinaryWriter } from './glb'

export type Triple = [number, number, number]

/** A box mesh: full size and its centre relative to the owning node, metres. */
export interface GeoBox {
  size: Triple
  offset: Triple
}

// glTF enums (spec §5): component types, buffer targets.
const FLOAT = 5126
const UNSIGNED_SHORT = 5123
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
const VEC3_BYTES = 12

/** Accessor indices fixed by `boxGeometry`: every box shares one normal and one index accessor. */
export const NORMAL_ACCESSOR = 0
export const INDEX_ACCESSOR = 1
const POSITION_VIEW = 2

export interface BoxGeometry {
  bin: Uint8Array
  bufferViews: object[]
  accessors: object[]
  /** Per box, in order: its POSITION accessor. */
  positionAccessors: number[]
}

function minMax(values: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  values.forEach((v, i) => {
    const c = i % 3
    min[c] = Math.min(min[c]!, v)
    max[c] = Math.max(max[c]!, v)
  })
  return { min, max }
}

function boxVertices(box: GeoBox): Float32Array {
  const p = boxPositions(box.size)
  if (box.offset.every((o) => o === 0)) return p
  return p.map((v, i) => v + box.offset[i % 3]!)
}

/**
 * Binary layout: shared normals, shared indices, then every box's 24
 * positions back to back in one strided bufferView (one accessor per box).
 */
export function boxGeometry(boxes: readonly GeoBox[]): BoxGeometry {
  const bin = new BinaryWriter()
  const normals = bin.append(BOX_NORMALS)
  const indices = bin.append(BOX_INDICES)
  const positions = boxes.map(boxVertices)
  const positionStart = bin.byteLength
  for (const p of positions) bin.append(p)
  const positionBytes = BOX_VERTEX_COUNT * VEC3_BYTES

  const shared = [
    { bufferView: 0, componentType: FLOAT, count: BOX_VERTEX_COUNT, type: 'VEC3' },
    { bufferView: 1, componentType: UNSIGNED_SHORT, count: BOX_INDEX_COUNT, type: 'SCALAR' },
  ]
  const perBox = positions.map((p, i) => ({
    bufferView: POSITION_VIEW,
    byteOffset: i * positionBytes,
    componentType: FLOAT,
    count: BOX_VERTEX_COUNT,
    type: 'VEC3',
    ...minMax(p),
  }))
  return {
    bin: bin.toBytes(),
    bufferViews: [
      { buffer: 0, ...normals, byteStride: VEC3_BYTES, target: ARRAY_BUFFER },
      { buffer: 0, ...indices, target: ELEMENT_ARRAY_BUFFER },
      { buffer: 0, byteOffset: positionStart, byteLength: positionBytes * boxes.length, byteStride: VEC3_BYTES, target: ARRAY_BUFFER },
    ],
    accessors: [...shared, ...perBox],
    positionAccessors: perBox.map((_, i) => shared.length + i),
  }
}
