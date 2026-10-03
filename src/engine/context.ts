/**
 * Shared types for engine rules: resolved materials, the per-cabinet build
 * context, and the result every rule returns.
 */
import type { BuildWarning, Cabinet, Grain, HardwareItem, Id, Material, Mm, WarningLevel } from '@/core/types'
import type { Dims } from './dims'
import type { FramedPart } from './geometry'
import type { CabinetLayout } from './layout'
import type { PlacedOp } from './ops'

export interface MaterialRef {
  id: Id
  thickness: Mm
  grain: Grain
}

export interface Materials {
  carcass: MaterialRef
  back: MaterialRef
  front: MaterialRef
  drawerBox: MaterialRef
  drawerBottom: MaterialRef
  /** Linear stock; null for frameless styles. */
  faceFrame: (MaterialRef & { stockWidth: Mm }) | null
}

export interface BuildContext {
  cabinet: Cabinet
  materials: readonly Material[]
  mats: Materials
  catalog: readonly HardwareItem[]
  dims: Dims
  layout: CabinetLayout
}

export interface HardwareNeed {
  hardwareId: Id
  qty: number
  note: string
}

export interface RuleResult {
  parts: FramedPart[]
  ops: PlacedOp[]
  hardware: HardwareNeed[]
  warnings: BuildWarning[]
}

export function emptyResult(): RuleResult {
  return { parts: [], ops: [], hardware: [], warnings: [] }
}

export function mergeResults(...results: readonly RuleResult[]): RuleResult {
  return {
    parts: results.flatMap((r) => r.parts),
    ops: results.flatMap((r) => r.ops),
    hardware: results.flatMap((r) => r.hardware),
    warnings: results.flatMap((r) => r.warnings),
  }
}

export function warning(cabinetId: Id, level: WarningLevel, code: string, message: string, partId?: Id): BuildWarning {
  return partId === undefined ? { level, code, message, cabinetId } : { level, code, message, cabinetId, partId }
}

export function grainOf(material: Material): Grain {
  if (material.kind === 'linear') return 'length'
  return material.grained ? 'length' : 'none'
}

export function materialRef(material: Material): MaterialRef {
  return { id: material.id, thickness: material.thickness, grain: grainOf(material) }
}

export function findMaterial(materials: readonly Material[], id: Id | null): Material | undefined {
  return id === null ? undefined : materials.find((m) => m.id === id)
}

type ResolveResult = { ok: true; mats: Materials } | { ok: false; warnings: BuildWarning[] }

/** Resolve every material the cabinet needs; missing ones are fatal (error warnings). */
export function resolveMaterials(cabinet: Cabinet, materials: readonly Material[]): ResolveResult {
  const c = cabinet.construction
  const hasDrawers = cabinet.sections.some((s) => s.bays.some((b) => b.kind === 'drawer'))
  const faceFrame = c.style.startsWith('face-frame')
  const missing: string[] = []
  const get = (id: Id, needed: boolean): Material | undefined => {
    const m = findMaterial(materials, id)
    if (!m && needed) missing.push(id)
    return m
  }
  const carcass = get(c.carcassMaterialId, true)
  const back = get(c.backMaterialId, true)
  const front = get(c.frontMaterialId, true)
  const drawerBox = get(c.drawerBoxMaterialId, hasDrawers)
  const drawerBottom = get(c.drawerBottomMaterialId, hasDrawers)
  const ff = get(c.faceFrameMaterialId, faceFrame)
  if (!carcass || !back || !front || missing.length > 0) {
    return { ok: false, warnings: [warning(cabinet.id, 'error', 'unknown-material', `Unknown material(s): ${[...new Set(missing)].join(', ')}`)] }
  }
  const carcassRef = materialRef(carcass)
  return {
    ok: true,
    mats: {
      carcass: carcassRef,
      back: materialRef(back),
      front: materialRef(front),
      drawerBox: drawerBox ? materialRef(drawerBox) : carcassRef,
      drawerBottom: drawerBottom ? materialRef(drawerBottom) : carcassRef,
      faceFrame: faceFrame && ff ? { ...materialRef(ff), stockWidth: ff.kind === 'linear' ? ff.width : ff.sheetWidth } : null,
    },
  }
}
