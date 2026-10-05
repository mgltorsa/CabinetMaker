/**
 * Shared three.js materials for placed assets: one material per distinct look
 * (colour, finish, glow, sidedness), reused by every mesh and every asset.
 */
import { DoubleSide, FrontSide, MeshStandardMaterial } from 'three'
import type { MaterialLook } from '@/assets'

/** Distinct looks kept before the cache is flushed (three re-uploads a disposed material on next use). */
const MAX_CACHED = 256

const cache = new Map<string, MeshStandardMaterial>()

export interface MaterialOptions {
  /** Glow colour (lit emitters), or null. */
  emissive: string | null
  doubleSided: boolean
}

export function assetMaterial(look: MaterialLook, options: MaterialOptions): MeshStandardMaterial {
  const key = [look.color, look.roughness, look.metalness, look.opacity, options.emissive ?? '-', options.doubleSided ? 2 : 1].join('|')
  const hit = cache.get(key)
  if (hit) return hit
  if (cache.size >= MAX_CACHED) {
    cache.forEach((m) => m.dispose())
    cache.clear()
  }
  const isTransparent = look.opacity < 1
  const material = new MeshStandardMaterial({
    color: look.color,
    roughness: look.roughness,
    metalness: look.metalness,
    transparent: isTransparent,
    opacity: look.opacity,
    depthWrite: !isTransparent,
    side: options.doubleSided ? DoubleSide : FrontSide,
    ...(options.emissive ? { emissive: options.emissive, emissiveIntensity: 1 } : {}),
  })
  cache.set(key, material)
  return material
}
