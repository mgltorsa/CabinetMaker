/**
 * Surface finishes for exported meshes. Same grouping and colours as the 3D
 * view (`src/ui/lib/scene.ts` FINISH, `src/ui/views/Viewer3D.tsx` FINISHES);
 * domain modules may not import the UI, so the values are repeated here.
 */
import type { PartGroup } from '@/core/types'

export type Finish = 'carcass' | 'front' | 'back' | 'drawer-box' | 'toe-kick' | 'top' | 'face-frame'

export const FINISH_BY_GROUP: Readonly<Record<PartGroup, Finish>> = {
  carcass: 'carcass',
  shelf: 'carcass',
  divider: 'carcass',
  stretcher: 'carcass',
  back: 'back',
  front: 'front',
  'drawer-box': 'drawer-box',
  'toe-kick': 'toe-kick',
  top: 'top',
  'face-frame': 'face-frame',
}

interface FinishLook {
  /** sRGB hex, as the 3D view shows it. */
  color: string
  roughness: number
}

export const FINISH_LOOK: Readonly<Record<Finish, FinishLook>> = {
  carcass: { color: '#f3f0ea', roughness: 0.55 },
  front: { color: '#efebe4', roughness: 0.45 },
  back: { color: '#5a5651', roughness: 0.85 },
  'drawer-box': { color: '#e3cea2', roughness: 0.7 },
  'toe-kick': { color: '#ddd7cd', roughness: 0.7 },
  top: { color: '#ece8e1', roughness: 0.35 },
  'face-frame': { color: '#dcc59f', roughness: 0.6 },
}

/** sRGB transfer function inverse (IEC 61966-2-1): glTF base colours are linear. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const BYTE_MAX = 255
const COLOR_DECIMALS = 1e6

/** `#rrggbb` → linear RGBA in 0..1 (opaque). Malformed input gives mid grey. */
export function linearRgba(hex: string): [number, number, number, number] {
  const m = HEX_COLOR.exec(hex)
  const channel = (s: string | undefined): number => {
    const linear = srgbToLinear(Number.parseInt(s ?? '80', 16) / BYTE_MAX)
    return Math.round(linear * COLOR_DECIMALS) / COLOR_DECIMALS
  }
  return [channel(m?.[1]), channel(m?.[2]), channel(m?.[3]), 1]
}
