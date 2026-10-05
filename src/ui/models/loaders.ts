/**
 * Parse untrusted model bytes with three's example loaders. Nothing here
 * fetches: glTF must be self-contained (checked before parsing) and the
 * loading manager rewrites any URL that is not `data:` / `blob:` to an empty
 * data URL as a second line of defence. Loaded only on demand (three is big).
 */
import { Box3, BufferGeometry, Group, LoadingManager, Mesh, MeshStandardMaterial, type Object3D, Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import type { ModelFormat, Vec3 } from '@/core/types'
import { selfContainedError } from './format'

export interface ParsedModel {
  object: Object3D
  /** Bounding-box size in file units. */
  nativeSize: Vec3
  /** Bounding-box centre in file units. */
  centre: Vec3
  /** Lowest point (file units): the model is lifted by this to stand on the floor. */
  minY: number
}

const STL_COLOR = '#b8bcc2'

const EMPTY_DATA_URL = 'data:,'

function lockedManager(): LoadingManager {
  const manager = new LoadingManager()
  manager.setURLModifier((url) => (/^(data|blob):/i.test(url) ? url : EMPTY_DATA_URL))
  return manager
}

/** A standalone ArrayBuffer holding exactly `bytes` (loaders read `.buffer`). */
const ownBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer

async function parseGltf(bytes: Uint8Array): Promise<Object3D> {
  const gltf = await new GLTFLoader(lockedManager()).parseAsync(ownBuffer(bytes), '')
  return gltf.scene
}

function parseStl(bytes: Uint8Array): Object3D {
  const geometry: BufferGeometry = new STLLoader().parse(ownBuffer(bytes))
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const material = new MeshStandardMaterial({ color: STL_COLOR, roughness: 0.6, metalness: 0.1 })
  const group = new Group()
  group.add(new Mesh(geometry, material))
  return group
}

async function parseObject(bytes: Uint8Array, format: ModelFormat): Promise<Object3D> {
  switch (format) {
    case 'glb':
    case 'gltf':
      return parseGltf(bytes)
    case 'obj':
      return new OBJLoader().parse(new TextDecoder().decode(bytes))
    case 'stl':
      return parseStl(bytes)
  }
}

const tidy = (v: number): number => Number(v.toPrecision(12)) || 0

export async function parseModel(bytes: Uint8Array, format: ModelFormat): Promise<ParsedModel> {
  const refused = selfContainedError(bytes, format)
  if (refused) throw new Error(refused)
  const object = await parseObject(bytes, format)
  object.updateMatrixWorld(true)
  const box = new Box3().setFromObject(object)
  if (box.isEmpty() || ![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) {
    throw new Error('The file has no geometry')
  }
  object.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  const size = box.getSize(box.min.clone())
  const centre = box.getCenter(box.min.clone())
  return {
    object,
    nativeSize: { x: tidy(size.x), y: tidy(size.y), z: tidy(size.z) },
    centre: { x: tidy(centre.x), y: tidy(centre.y), z: tidy(centre.z) },
    minY: tidy(box.min.y),
  }
}

/** Free GPU-side resources of a parsed model (geometries, materials, textures). */
export function disposeObject(object: Object3D): void {
  object.traverse((o) => {
    if (!(o instanceof Mesh)) return
    o.geometry.dispose()
    const materials = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of materials) {
      for (const value of Object.values(m) as unknown[]) {
        if (value instanceof Texture) value.dispose()
      }
      m.dispose()
    }
  })
}
