/**
 * How each material role looks. Renderers (3D view, glTF export) resolve a
 * primitive's role and the asset's colour through `resolveLook` so both agree.
 */
import type { MaterialRole, Primitive } from './types'

export interface MaterialLook {
  /** sRGB `#rrggbb`. */
  color: string
  roughness: number
  metalness: number
  /** 1 = opaque. */
  opacity: number
}

/** Fixed looks; `body` uses the asset colour and `emitter` the light colour. */
export const ROLE_LOOK: Readonly<Record<MaterialRole, MaterialLook>> = {
  body: { color: '#d8d4cc', roughness: 0.55, metalness: 0, opacity: 1 },
  // No environment map in the viewer: keep metalness low or metals render black.
  metal: { color: '#b9bdc2', roughness: 0.3, metalness: 0.35, opacity: 1 },
  steel: { color: '#a7abb0', roughness: 0.4, metalness: 0.3, opacity: 1 },
  dark: { color: '#2a2a2d', roughness: 0.45, metalness: 0.1, opacity: 1 },
  glass: { color: '#a9c8d4', roughness: 0.08, metalness: 0, opacity: 0.35 },
  wood: { color: '#9b6b40', roughness: 0.7, metalness: 0, opacity: 1 },
  white: { color: '#f4f2ee', roughness: 0.5, metalness: 0, opacity: 1 },
  fabric: { color: '#e7dccb', roughness: 0.95, metalness: 0, opacity: 1 },
  soft: { color: '#9aa6b2', roughness: 0.95, metalness: 0, opacity: 1 },
  plant: { color: '#4f7d3a', roughness: 0.8, metalness: 0, opacity: 1 },
  soil: { color: '#4a3526', roughness: 1, metalness: 0, opacity: 1 },
  ceramic: { color: '#e9e4dc', roughness: 0.35, metalness: 0, opacity: 1 },
  screen: { color: '#111418', roughness: 0.15, metalness: 0.1, opacity: 1 },
  paper: { color: '#fbf8f1', roughness: 0.9, metalness: 0, opacity: 1 },
  emitter: { color: '#fff3dc', roughness: 0.6, metalness: 0, opacity: 1 },
}

/** Emitter colour while the light is off. */
export const EMITTER_OFF_COLOR = '#d9d6cf'

/** The look of `primitive` on an asset coloured `bodyColor`. */
export function resolveLook(primitive: Pick<Primitive, 'role' | 'color'>, bodyColor: string): MaterialLook {
  const base = ROLE_LOOK[primitive.role]
  if (primitive.color) return { ...base, color: primitive.color }
  return primitive.role === 'body' ? { ...base, color: bodyColor } : base
}
