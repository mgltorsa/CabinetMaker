/**
 * `manifest.json` for the Blender bundle: what the import script reads, and a
 * human-readable index of the cabinets, materials and hardware (with SKUs).
 */
import type { Cabinet, CabinetBuild, ConstructionStyle, HardwareKind, HardwareUsage, Material, Project, UnitSystem } from '@/core/types'
import { BLENDER_SCRIPT_NAME } from './blenderScript'
import { cabinetExtras, exportParts, type Extras } from './cabinetGlb'

export const MANIFEST_FORMAT = 'cabinetmaker-blender-bundle'
export const MANIFEST_VERSION = 1
export const CABINETS_DIR = 'cabinets'

export interface ManifestHardware {
  id: string
  kind: HardwareKind | 'unknown'
  name: string
  manufacturer: string
  sku: string
  qty: number
  /** Per-cabinet lines only: what the engine used it for. */
  note?: string
}

export interface ManifestMaterial {
  id: string
  name: string
  kind: Material['kind']
  thicknessMm: number
}

export interface ManifestCabinet {
  id: string
  name: string
  slug: string
  type: Cabinet['type']
  /** Bundle-relative paths. */
  glb: string
  thumbnail: string | null
  widthMm: number
  heightMm: number
  depthMm: number
  floorHeightMm: number
  constructionStyle: ConstructionStyle
  partCount: number
  materialIds: string[]
  hardware: ManifestHardware[]
  /** Same as the GLB root node's extras; the script copies them to the asset. */
  extras: Extras
}

/** One placed design asset in `scene/placed-assets.glb` (room space). */
export interface ManifestAsset {
  id: string
  name: string
  assetId: string
  positionMm: { x: number; y: number; z: number }
  rotationYDeg: number
  sizeMm: { x: number; y: number; z: number }
}

/** Placed design assets (furniture, appliances, lights): one GLB laid out in room space. */
export interface ManifestSceneAssets {
  glb: string
  /** Room space: origin at the back-left floor corner, +X along the back wall, +Z into the room. */
  space: 'room'
  assets: ManifestAsset[]
}

export interface BundleManifest {
  format: typeof MANIFEST_FORMAT
  version: typeof MANIFEST_VERSION
  generator: string
  project: { id: string; name: string }
  /** Geometry in the GLB files is metres; every `...Mm` field is millimetres. */
  units: { geometry: 'm'; dimensions: 'mm'; display: UnitSystem }
  /** glTF axes as written (Blender's importer converts to its Z-up). */
  axes: { up: '+Y'; front: '+Z'; origin: string }
  script: string
  cabinets: ManifestCabinet[]
  skipped: { id: string; name: string; reason: string }[]
  materials: ManifestMaterial[]
  /** Project totals. */
  hardware: ManifestHardware[]
  /** Present when the project has visible placed assets. */
  sceneAssets?: ManifestSceneAssets
}

/** One cabinet's build plus the bundle paths chosen for it. */
export interface CabinetEntry {
  cabinet: Cabinet
  build: CabinetBuild
  slug: string
  glb: string
  thumbnail: string | null
}

export const MANIFEST_GENERATOR = 'CabinetMaker'
const ORIGIN = 'cabinet left / floor / back corner'

function hardwareLine(project: Project, usage: HardwareUsage): ManifestHardware {
  const item = project.hardware.find((h) => h.id === usage.hardwareId)
  return {
    id: usage.hardwareId,
    kind: item?.kind ?? 'unknown',
    name: item?.name ?? usage.hardwareId,
    manufacturer: item?.manufacturer ?? '',
    sku: item?.sku ?? '',
    qty: usage.qty,
    note: usage.note,
  }
}

function hardwareTotals(lines: readonly ManifestHardware[]): ManifestHardware[] {
  const totals = new Map<string, ManifestHardware>()
  for (const line of lines) {
    const prev = totals.get(line.id)
    const { id, kind, name, manufacturer, sku } = line
    totals.set(id, { id, kind, name, manufacturer, sku, qty: (prev?.qty ?? 0) + line.qty })
  }
  return [...totals.values()]
}

function cabinetManifest(project: Project, entry: CabinetEntry, includeSuppliedTop: boolean): ManifestCabinet {
  const { cabinet, build } = entry
  const parts = exportParts(cabinet, build, includeSuppliedTop)
  const usedIds = new Set(parts.map((p) => p.materialId))
  return {
    id: cabinet.id,
    name: cabinet.name,
    slug: entry.slug,
    type: cabinet.type,
    glb: entry.glb,
    thumbnail: entry.thumbnail,
    widthMm: cabinet.width,
    heightMm: cabinet.height,
    depthMm: cabinet.depth,
    floorHeightMm: cabinet.floorHeight,
    constructionStyle: cabinet.construction.style,
    partCount: parts.length,
    // Project order; ids without a project material (e.g. a supplied top) are left out.
    materialIds: project.materials.filter((m) => usedIds.has(m.id)).map((m) => m.id),
    hardware: build.hardware.map((u) => hardwareLine(project, u)),
    extras: cabinetExtras(cabinet, project, parts.length),
  }
}

export function buildManifest(
  project: Project,
  entries: readonly CabinetEntry[],
  skipped: BundleManifest['skipped'],
  includeSuppliedTop: boolean,
): BundleManifest {
  const cabinets = entries.map((e) => cabinetManifest(project, e, includeSuppliedTop))
  const usedMaterials = new Set(cabinets.flatMap((c) => c.materialIds))
  return {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    generator: MANIFEST_GENERATOR,
    project: { id: project.id, name: project.name },
    units: { geometry: 'm', dimensions: 'mm', display: project.units },
    axes: { up: '+Y', front: '+Z', origin: ORIGIN },
    script: BLENDER_SCRIPT_NAME,
    cabinets,
    skipped,
    materials: project.materials
      .filter((m) => usedMaterials.has(m.id))
      .map((m) => ({ id: m.id, name: m.name, kind: m.kind, thicknessMm: m.thickness })),
    hardware: hardwareTotals(cabinets.flatMap((c) => c.hardware)),
  }
}
