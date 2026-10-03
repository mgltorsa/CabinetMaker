/**
 * Pure 3D scene derivation: parts (cabinet space, mm, Y-up) → box meshes in
 * metres, with cabinets laid out left to right and the run centred on X/Z.
 */
import type { Cabinet, Part, PartGroup, ProjectBuild } from '@/core/types'
import type { ViewToggles } from '../store'

const MM_PER_M = 1000
/** Gap between neighbouring cabinets in the preview run (no room layout yet). */
const RUN_GAP_MM = 50
/** How far an "open" drawer slides out, as a fraction of cabinet depth. */
const DRAWER_OPEN_FRACTION = 0.6

export const PART_COLORS: Record<PartGroup, string> = {
  carcass: '#d8bb8e',
  back: '#c4a57a',
  shelf: '#e2c99f',
  divider: '#cfae80',
  front: '#a9bccb',
  'drawer-box': '#ead6ac',
  'face-frame': '#b98a5e',
  'toe-kick': '#6f6a62',
  top: '#83868d',
  stretcher: '#caa678',
}

export interface MeshSpec {
  partId: string
  cabinetId: string
  /** Centre, metres. */
  position: [number, number, number]
  /** Size, metres. */
  size: [number, number, number]
  color: string
}

export interface SceneSpec {
  meshes: MeshSpec[]
  /** Largest extent of the visible run, metres (for camera framing). */
  extent: number
  /** Height of the run's centre, metres. */
  centerY: number
}

/** Drawer boxes and drawer fronts move when drawers are shown open. */
export function isDrawerPart(part: Part): boolean {
  return part.group === 'drawer-box' || (part.group === 'front' && part.role.includes('drawer'))
}

export function isPartVisible(part: Part, view: ViewToggles): boolean {
  switch (part.group) {
    case 'front':
      return view.fronts
    case 'drawer-box':
      return view.drawerBoxes
    case 'back':
      return view.back
    case 'top':
      return view.top
    default:
      return true
  }
}

/** X offset of each cabinet so the run sits side by side, in mm. */
export function runOffsets(cabinets: readonly Cabinet[]): Map<string, number> {
  const offsets = new Map<string, number>()
  let x = 0
  for (const cab of cabinets) {
    offsets.set(cab.id, x)
    x += cab.width + RUN_GAP_MM
  }
  return offsets
}

export function buildScene(build: ProjectBuild, cabinets: readonly Cabinet[], view: ViewToggles): SceneSpec {
  const offsets = runOffsets(cabinets)
  const depthOf = new Map(cabinets.map((c) => [c.id, c.depth]))
  const visible = build.parts.filter((p) => isPartVisible(p, view))
  if (visible.length === 0) return { meshes: [], extent: 1, centerY: 0.4 }

  const boxes = visible.map((part) => {
    const dx = offsets.get(part.cabinetId) ?? 0
    const dz = view.open && isDrawerPart(part) ? (depthOf.get(part.cabinetId) ?? 0) * DRAWER_OPEN_FRACTION : 0
    const { min, max } = part.bounds
    return { part, min: { x: min.x + dx, y: min.y, z: min.z + dz }, max: { x: max.x + dx, y: max.y, z: max.z + dz } }
  })
  const minX = Math.min(...boxes.map((b) => b.min.x))
  const maxX = Math.max(...boxes.map((b) => b.max.x))
  const minY = Math.min(...boxes.map((b) => b.min.y))
  const maxY = Math.max(...boxes.map((b) => b.max.y))
  const minZ = Math.min(...boxes.map((b) => b.min.z))
  const maxZ = Math.max(...boxes.map((b) => b.max.z))
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2

  const meshes = boxes.map(({ part, min, max }): MeshSpec => ({
    partId: part.id,
    cabinetId: part.cabinetId,
    position: [((min.x + max.x) / 2 - cx) / MM_PER_M, (min.y + max.y) / 2 / MM_PER_M, ((min.z + max.z) / 2 - cz) / MM_PER_M],
    size: [Math.max(max.x - min.x, 0.1) / MM_PER_M, Math.max(max.y - min.y, 0.1) / MM_PER_M, Math.max(max.z - min.z, 0.1) / MM_PER_M],
    color: PART_COLORS[part.group],
  }))
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / MM_PER_M
  return { meshes, extent, centerY: (minY + maxY) / 2 / MM_PER_M }
}
