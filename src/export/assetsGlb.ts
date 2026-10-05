/**
 * Placed design assets → one GLB laid out in room space (no three.js).
 *
 * Layout: scene → root node "Placed assets" → one node per visible asset
 * (translation = room-space floor point, metres; rotation about +Y) → one
 * child node per catalog primitive with its own mesh. Units are metres, axes
 * glTF's (+Y up, +Z away from the back wall into the room). Unknown catalog
 * ids export as a plain box of the asset's size. Lights are recorded in the
 * asset node's extras, not as glTF lights.
 */
import { eulerToQuaternion, getAssetDef, type MaterialLook, type Primitive, resolveLook } from '@/assets'
import type { PlacedAsset } from '@/core/types'
import { EXTRAS_SOURCE, GLB_GENERATOR, type Extras } from './cabinetGlb'
import { linearRgba } from './finish'
import { BinaryWriter, encodeGlb } from './glb'
import { primitiveMesh, type TriMesh } from './primitiveMesh'

export const ASSETS_ROOT_NAME = 'Placed assets'

const M_PER_MM = 0.001
const FLOAT = 5126
const UNSIGNED_SHORT = 5123
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
const TRIANGLES = 4
const VEC3_BYTES = 12
const UNKNOWN_COLOR = '#c8c4bc'
const COLOR_DECIMALS = 1e6

interface MaterialSlot {
  key: string
  json: object
}

function primitivesOf(asset: PlacedAsset): Primitive[] {
  const def = getAssetDef(asset.assetId)
  const { x, y, z } = asset.size
  return def ? def.build(asset.size) : [{ kind: 'box', role: 'body', position: [0, y / 2, 0], size: [x, y, z] }]
}

function materialFor(p: Primitive, asset: PlacedAsset, slots: MaterialSlot[]): number {
  const look: MaterialLook = resolveLook(p, asset.color ?? getAssetDef(asset.assetId)?.defaultColor ?? UNKNOWN_COLOR)
  const glow = p.role === 'emitter' && asset.light?.on ? asset.light.color : null
  const color = glow ?? look.color
  const doubleSided = p.kind === 'cylinder' && p.openEnded === true
  const key = [p.role, color, look.roughness, look.metalness, look.opacity, glow ?? '-', doubleSided].join('|')
  const found = slots.findIndex((s) => s.key === key)
  if (found >= 0) return found
  const [r, g, b] = linearRgba(color)
  const json = {
    name: `${p.role} ${color}`,
    pbrMetallicRoughness: { baseColorFactor: [r, g, b, look.opacity], metallicFactor: look.metalness, roughnessFactor: look.roughness },
    ...(look.opacity < 1 ? { alphaMode: 'BLEND' } : {}),
    ...(doubleSided ? { doubleSided: true } : {}),
    ...(glow ? { emissiveFactor: [r, g, b] } : {}),
    extras: { role: p.role },
  }
  slots.push({ key, json })
  return slots.length - 1
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

const round = (v: number): number => Math.round(v * COLOR_DECIMALS) / COLOR_DECIMALS

function assetExtras(asset: PlacedAsset): Extras {
  return {
    source: EXTRAS_SOURCE,
    assetId: asset.assetId,
    widthMm: asset.size.x,
    heightMm: asset.size.y,
    depthMm: asset.size.z,
    rotationYDeg: asset.rotationYDeg,
    ...(asset.color ? { color: asset.color } : {}),
    ...(asset.light ? { lightOn: asset.light.on, lightIntensity: asset.light.intensity, lightColor: asset.light.color } : {}),
  }
}

/** Serialize the visible placed assets as one GLB in room space (metres). */
export function placedAssetsToGlb(assets: readonly PlacedAsset[], generator = GLB_GENERATOR): Uint8Array {
  const visible = assets.filter((a) => a.visible)
  const bin = new BinaryWriter()
  const accessors: object[] = []
  const bufferViews: object[] = []
  const meshes: object[] = []
  const slots: MaterialSlot[] = []
  // Index 0 is the root, filled in once its children are known.
  const nodes: object[] = [{}]
  const rootChildren: number[] = []

  const addView = (data: Float32Array | Uint16Array, target: number): number => {
    const range = bin.append(data)
    bufferViews.push({ buffer: 0, ...range, ...(target === ARRAY_BUFFER ? { byteStride: VEC3_BYTES } : {}), target })
    return bufferViews.length - 1
  }
  const addMesh = (name: string, mesh: TriMesh, material: number): number => {
    const vertexCount = mesh.positions.length / 3
    accessors.push({ bufferView: addView(mesh.positions, ARRAY_BUFFER), componentType: FLOAT, count: vertexCount, type: 'VEC3', ...minMax(mesh.positions) })
    accessors.push({ bufferView: addView(mesh.normals, ARRAY_BUFFER), componentType: FLOAT, count: vertexCount, type: 'VEC3' })
    accessors.push({ bufferView: addView(mesh.indices, ELEMENT_ARRAY_BUFFER), componentType: UNSIGNED_SHORT, count: mesh.indices.length, type: 'SCALAR' })
    const base = accessors.length - 3
    meshes.push({ name, primitives: [{ attributes: { POSITION: base, NORMAL: base + 1 }, indices: base + 2, material, mode: TRIANGLES }] })
    return meshes.length - 1
  }

  for (const asset of visible) {
    const half = ((asset.rotationYDeg * Math.PI) / 180) / 2
    const assetNode = {
      name: asset.name,
      translation: [asset.position.x * M_PER_MM, asset.position.y * M_PER_MM, asset.position.z * M_PER_MM],
      ...(asset.rotationYDeg !== 0 ? { rotation: [0, round(Math.sin(half)), 0, round(Math.cos(half))] } : {}),
      children: [] as number[],
      extras: assetExtras(asset),
    }
    nodes.push(assetNode)
    rootChildren.push(nodes.length - 1)
    primitivesOf(asset).forEach((p, i) => {
      const meshIndex = addMesh(`${asset.name} ${i + 1}`, primitiveMesh(p), materialFor(p, asset, slots))
      nodes.push({
        name: `${asset.name} · ${p.role} ${i + 1}`,
        mesh: meshIndex,
        translation: [p.position[0] * M_PER_MM, p.position[1] * M_PER_MM, p.position[2] * M_PER_MM],
        ...(p.rotation ? { rotation: eulerToQuaternion(p.rotation) } : {}),
      })
      assetNode.children.push(nodes.length - 1)
    })
  }

  // glTF forbids an empty `children` array.
  nodes[0] = { name: ASSETS_ROOT_NAME, ...(rootChildren.length > 0 ? { children: rootChildren } : {}), extras: { source: EXTRAS_SOURCE, assetCount: visible.length, space: 'room' } }
  const bytes = bin.toBytes()
  const json = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    ...(meshes.length > 0
      ? { meshes, materials: slots.map((s) => s.json), accessors, bufferViews, buffers: [{ byteLength: bytes.byteLength }] }
      : {}),
  }
  return encodeGlb(json, meshes.length > 0 ? bytes : new Uint8Array(0))
}
