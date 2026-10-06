/**
 * Which placed lights the 3D view turns into real three.js lights. Every
 * light costs shader work on every material, and shadow-casting point lights
 * render the scene six more times, so both are capped.
 */
import { getAssetDef, type LightSource } from '@/assets'
import type { Id, PlacedAsset } from '@/core/types'

/** Real lights in the scene at once; further switched-on fixtures only glow. */
export const MAX_RENDERED_LIGHTS = 8
/** Placed lights that cast shadows (the first point / spot lights in list order). */
export const MAX_SHADOW_LIGHTS = 2

export interface PlannedLight {
  assetId: Id
  /** Asset-space source with the asset's brightness and colour applied. */
  source: LightSource
  castShadow: boolean
}

export function lightPlan(assets: readonly PlacedAsset[]): Map<Id, PlannedLight> {
  const plan = new Map<Id, PlannedLight>()
  let shadows = 0
  for (const asset of assets) {
    if (plan.size >= MAX_RENDERED_LIGHTS) break
    const light = asset.light
    const make = getAssetDef(asset.assetId)?.light
    if (!asset.visible || !light?.on || light.intensity <= 0 || !make) continue
    const base = make(asset.size)
    const castShadow = base.kind !== 'rect' && shadows < MAX_SHADOW_LIGHTS
    if (castShadow) shadows += 1
    plan.set(asset.id, { assetId: asset.id, source: { ...base, intensity: base.intensity * light.intensity, color: light.color }, castShadow })
  }
  return plan
}
