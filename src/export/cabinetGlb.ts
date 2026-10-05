/**
 * One cabinet → glTF 2.0 binary (GLB), written by hand (no three.js).
 *
 * Layout: scene → root node (the cabinet, identity transform) → one child node
 * per part, each with its own mesh. Units are metres; axes are cabinet space,
 * which is already glTF's convention (+X right, +Y up, +Z toward the front,
 * origin at the cabinet's left / floor / back corner). A part node is
 * translated to the part's bounds centre and its vertices are relative to that
 * centre, so every part keeps a sensible pivot in Blender. Nodes carry no
 * rotation or scale. Doors and drawers are exported closed.
 */
import type { Cabinet, CabinetBuild, Part, Project } from '@/core/types'
import { synthesizedTop } from '@/drawings/front-elevation'
import { BOX_INDEX_COUNT, BOX_INDICES, BOX_NORMALS, BOX_VERTEX_COUNT, boxPositions } from './box'
import { FINISH_BY_GROUP, FINISH_LOOK, linearRgba, type Finish } from './finish'
import { BinaryWriter, encodeGlb } from './glb'

export const GLB_GENERATOR = 'CabinetMaker glTF exporter'
/** Recorded in extras so importers can tell where the asset came from. */
export const EXTRAS_SOURCE = 'CabinetMaker'

const MM_PER_M = 1000
/** Degenerate (zero-thickness) parts still get a visible box, as in the 3D view. */
const MIN_SIZE_MM = 0.1

// glTF enums (spec §5): component types, buffer targets, primitive mode.
const FLOAT = 5126
const UNSIGNED_SHORT = 5123
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
const TRIANGLES = 4
const VEC3_BYTES = 12

export interface CabinetGlbOptions {
  /** Include a countertop/top supplied separately (not a cut part), like the 3D view. Default true. */
  includeSuppliedTop?: boolean
  /** `asset.generator`. */
  generator?: string
}

/** JSON-safe scalar metadata (becomes Blender custom properties). */
export type ExtrasValue = string | number | boolean
export type Extras = Record<string, ExtrasValue>

/** Parts exported for a cabinet: its cut parts plus, optionally, the supplied top the 3D view draws. */
export function exportParts(cabinet: Cabinet, build: CabinetBuild, includeSuppliedTop = true): Part[] {
  const top = includeSuppliedTop ? synthesizedTop(cabinet, build.parts) : null
  return top ? [...build.parts, top] : [...build.parts]
}

/** Cabinet-level metadata, shared by the GLB root node and the bundle manifest. */
export function cabinetExtras(cabinet: Cabinet, project: Project, partCount: number): Extras {
  return {
    source: EXTRAS_SOURCE,
    projectName: project.name,
    cabinetId: cabinet.id,
    cabinetType: cabinet.type,
    widthMm: cabinet.width,
    heightMm: cabinet.height,
    depthMm: cabinet.depth,
    floorHeightMm: cabinet.floorHeight,
    constructionStyle: cabinet.construction.style,
    partCount,
  }
}

const materialName = (project: Project, id: string): string | undefined => project.materials.find((m) => m.id === id)?.name

function partExtras(part: Part, project: Project, isSupplied: boolean): Extras {
  return {
    partId: part.id,
    role: part.role,
    group: part.group,
    lengthMm: part.length,
    widthMm: part.width,
    thicknessMm: part.thickness,
    materialId: part.materialId,
    materialName: materialName(project, part.materialId) ?? '',
    grain: part.grain,
    opCount: part.ops.length,
    supplied: isSupplied,
  }
}

// ─── Materials ──────────────────────────────────────────────────────────────

interface MaterialSlot {
  key: string
  materialId: string
  finish: Finish
  name: string
}

const slotKey = (part: Part): string => `${part.materialId}\u0000${FINISH_BY_GROUP[part.group]}`

/**
 * One glTF material per (project material, finish). The name is the project
 * material's name; a material used for several finishes gets the finish
 * appended so names stay unique in Blender.
 */
function materialSlots(parts: readonly Part[], project: Project, suppliedIds: ReadonlySet<string>): MaterialSlot[] {
  const firstByKey = new Map<string, Part>()
  for (const p of parts) if (!firstByKey.has(slotKey(p))) firstByKey.set(slotKey(p), p)
  const firsts = [...firstByKey.entries()]
  const finishesPerMaterial = new Map<string, number>()
  for (const [, p] of firsts) finishesPerMaterial.set(p.materialId, (finishesPerMaterial.get(p.materialId) ?? 0) + 1)

  const used = new Set<string>()
  return firsts.map(([key, p]) => {
    const finish = FINISH_BY_GROUP[p.group]
    const base = materialName(project, p.materialId) ?? (p.materialId === '' && suppliedIds.has(p.id) ? `${p.name} (supplied)` : p.materialId || finish)
    let name = (finishesPerMaterial.get(p.materialId) ?? 0) > 1 ? `${base} (${finish})` : base
    for (let n = 2; used.has(name); n++) name = `${base} (${finish} ${n})`
    used.add(name)
    return { key, materialId: p.materialId, finish, name }
  })
}

function materialJson(slot: MaterialSlot): object {
  const look = FINISH_LOOK[slot.finish]
  return {
    name: slot.name,
    pbrMetallicRoughness: { baseColorFactor: linearRgba(look.color), metallicFactor: 0, roughnessFactor: look.roughness },
    extras: { materialId: slot.materialId, finish: slot.finish },
  }
}

// ─── Geometry ───────────────────────────────────────────────────────────────

const AXES = ['x', 'y', 'z'] as const

function partBox(part: Part): { centre: [number, number, number]; size: [number, number, number] } {
  const { min, max } = part.bounds
  const [cx, cy, cz] = AXES.map((k) => (min[k] + max[k]) / 2 / MM_PER_M)
  const [sx, sy, sz] = AXES.map((k) => Math.max(max[k] - min[k], MIN_SIZE_MM) / MM_PER_M)
  return { centre: [cx ?? 0, cy ?? 0, cz ?? 0], size: [sx ?? 0, sy ?? 0, sz ?? 0] }
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

// ─── Document ───────────────────────────────────────────────────────────────

/** Accessor indices fixed by `partGeometry`: every box shares one normal and one index accessor. */
const NORMAL_ACCESSOR = 0
const INDEX_ACCESSOR = 1
const POSITION_VIEW = 2

interface PartGeometry {
  bin: Uint8Array
  bufferViews: object[]
  accessors: object[]
  /** Per part, in order: its POSITION accessor and its node translation (metres). */
  positionAccessors: number[]
  centres: [number, number, number][]
}

/**
 * Binary layout: shared normals, shared indices, then every part's 24
 * positions back to back in one strided bufferView (one accessor per part).
 */
function partGeometry(parts: readonly Part[]): PartGeometry {
  const bin = new BinaryWriter()
  const normals = bin.append(BOX_NORMALS)
  const indices = bin.append(BOX_INDICES)
  const boxes = parts.map(partBox)
  const positions = boxes.map((b) => boxPositions(b.size))
  const positionStart = bin.byteLength
  for (const p of positions) bin.append(p)
  const positionBytes = BOX_VERTEX_COUNT * VEC3_BYTES

  const shared = [
    { bufferView: 0, componentType: FLOAT, count: BOX_VERTEX_COUNT, type: 'VEC3' },
    { bufferView: 1, componentType: UNSIGNED_SHORT, count: BOX_INDEX_COUNT, type: 'SCALAR' },
  ]
  const perPart = positions.map((p, i) => ({
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
      { buffer: 0, byteOffset: positionStart, byteLength: positionBytes * parts.length, byteStride: VEC3_BYTES, target: ARRAY_BUFFER },
    ],
    accessors: [...shared, ...perPart],
    positionAccessors: perPart.map((_, i) => shared.length + i),
    centres: boxes.map((b) => b.centre),
  }
}

/** Serialize one cabinet (closed doors and drawers) as a GLB file. */
export function cabinetToGlb(cabinet: Cabinet, cabinetBuild: CabinetBuild, project: Project, options: CabinetGlbOptions = {}): Uint8Array {
  const parts = exportParts(cabinet, cabinetBuild, options.includeSuppliedTop ?? true)
  const cutIds = new Set(cabinetBuild.parts.map((p) => p.id))
  const suppliedIds = new Set(parts.filter((p) => !cutIds.has(p.id)).map((p) => p.id))
  const root = {
    name: cabinet.name,
    ...(parts.length > 0 ? { children: parts.map((_, i) => i + 1) } : {}),
    extras: cabinetExtras(cabinet, project, parts.length),
  }
  const document = {
    asset: { version: '2.0', generator: options.generator ?? GLB_GENERATOR },
    scene: 0,
    // Unnamed: the cabinet's name belongs to the root node only (importers may apply a scene name to their own scene).
    scenes: [{ nodes: [0] }],
  }
  if (parts.length === 0) return encodeGlb({ ...document, nodes: [root] }, new Uint8Array(0))

  const slots = materialSlots(parts, project, suppliedIds)
  const slotIndex = new Map(slots.map((s, i) => [s.key, i]))
  const geometry = partGeometry(parts)
  const meshes = parts.map((part, i) => ({
    name: part.name,
    primitives: [
      {
        attributes: { POSITION: geometry.positionAccessors[i], NORMAL: NORMAL_ACCESSOR },
        indices: INDEX_ACCESSOR,
        material: slotIndex.get(slotKey(part)) ?? 0,
        mode: TRIANGLES,
      },
    ],
  }))
  const partNodes = parts.map((part, i) => ({
    name: part.name,
    mesh: i,
    translation: geometry.centres[i],
    extras: partExtras(part, project, suppliedIds.has(part.id)),
  }))
  const json = {
    ...document,
    nodes: [root, ...partNodes],
    meshes,
    materials: slots.map(materialJson),
    accessors: geometry.accessors,
    bufferViews: geometry.bufferViews,
    buffers: [{ byteLength: geometry.bin.byteLength }],
  }
  return encodeGlb(json, geometry.bin)
}
