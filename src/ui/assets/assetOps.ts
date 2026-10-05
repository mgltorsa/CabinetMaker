/**
 * Pure, immutable Project edits for placed design assets (sidebar 05·4).
 * Same rules as `projectOps`: return a new Project, or the same reference
 * when nothing changed. Every result stays inside the validator's bounds.
 */
import { getAssetDef } from '@/assets'
import type { AssetLight, Id, PlacedAsset, Project, Vec3 } from '@/core/types'
import { ASSET_LIFT, ASSET_SIZE, type Bounds, LIGHT_INTENSITY, MAX_ASSETS, ROOM_COORD } from '../lib/limits'
import { uniqueId, uniqueName } from '../projectOps'
import { defaultAssetPosition, footprintHalf } from './placement'

/** Space between an asset and its duplicate. */
export const DUPLICATE_GAP = 100

export type AssetPatch = Partial<Omit<PlacedAsset, 'id' | 'assetId'>>

const ID_PREFIX = 'ast'

const assetsOf = (project: Project): readonly PlacedAsset[] => project.assets ?? []
const clamp = (v: number, b: Bounds): number => Math.min(Math.max(v, b.min), b.max)

function clampPosition(p: Vec3): Vec3 {
  return { x: clamp(p.x, ROOM_COORD), y: clamp(p.y, ASSET_LIFT), z: clamp(p.z, ROOM_COORD) }
}

function clampSize(s: Vec3): Vec3 {
  return { x: clamp(s.x, ASSET_SIZE), y: clamp(s.y, ASSET_SIZE), z: clamp(s.z, ASSET_SIZE) }
}

function withinBounds(asset: PlacedAsset): PlacedAsset {
  const light = asset.light ? { ...asset.light, intensity: clamp(asset.light.intensity, LIGHT_INTENSITY) } : undefined
  return { ...asset, position: clampPosition(asset.position), size: clampSize(asset.size), ...(light ? { light } : {}) }
}

/** A fresh placed asset from the catalog at its default size, colour and position; `null` for an unknown id. */
export function newPlacedAsset(project: Project, assetId: string): PlacedAsset | null {
  const def = getAssetDef(assetId)
  if (!def) return null
  const assets = assetsOf(project)
  const size = { ...def.defaultSize }
  const lightSource = def.light?.(size)
  return withinBounds({
    id: uniqueId(ID_PREFIX, new Set(assets.map((a) => a.id))),
    assetId,
    name: uniqueName(def.name, assets.map((a) => a.name)),
    position: defaultAssetPosition(project, def, size),
    rotationYDeg: 0,
    size,
    color: def.defaultColor,
    visible: true,
    ...(lightSource ? { light: { on: true, intensity: 1, color: lightSource.color } } : {}),
  })
}

export function addAsset(project: Project, asset: PlacedAsset): Project {
  const assets = assetsOf(project)
  if (assets.length >= MAX_ASSETS) return project
  const taken = new Set(assets.map((a) => a.id))
  const id = taken.has(asset.id) ? uniqueId(ID_PREFIX, taken) : asset.id
  return { ...project, assets: [...assets, withinBounds({ ...asset, id })] }
}

function mapAsset(project: Project, assetId: Id, fn: (asset: PlacedAsset) => PlacedAsset): Project {
  const assets = assetsOf(project)
  const target = assets.find((a) => a.id === assetId)
  if (!target) return project
  const next = fn(target)
  return next === target ? project : { ...project, assets: assets.map((a) => (a.id === assetId ? next : a)) }
}

export function updateAsset(project: Project, assetId: Id, patch: AssetPatch): Project {
  return mapAsset(project, assetId, (a) => withinBounds({ ...a, ...patch }))
}

/** Edit a light asset's light; assets without a light are left alone. */
export function setAssetLight(project: Project, assetId: Id, patch: Partial<AssetLight>): Project {
  return mapAsset(project, assetId, (a) => (a.light ? withinBounds({ ...a, light: { ...a.light, ...patch } }) : a))
}

/** Copy an asset beside the original (to its right along X). */
export function duplicateAsset(project: Project, assetId: Id): { project: Project; copyId: Id | null } {
  const assets = assetsOf(project)
  const source = assets.find((a) => a.id === assetId)
  if (!source || assets.length >= MAX_ASSETS) return { project, copyId: null }
  const copy: PlacedAsset = {
    ...source,
    id: uniqueId(ID_PREFIX, new Set(assets.map((a) => a.id))),
    name: uniqueName(source.name, assets.map((a) => a.name)),
    position: { ...source.position, x: source.position.x + footprintHalf(source.size, source.rotationYDeg).x * 2 + DUPLICATE_GAP },
    size: { ...source.size },
    ...(source.light ? { light: { ...source.light } } : {}),
  }
  const next = addAsset(project, copy)
  return { project: next, copyId: copy.id }
}

export function removeAsset(project: Project, assetId: Id): Project {
  const assets = assetsOf(project)
  const next = assets.filter((a) => a.id !== assetId)
  return next.length === assets.length ? project : { ...project, assets: next }
}
