/**
 * Panel space → sheet space.
 *
 * Face A is up on the router (machine Z = 0 at face A, see `core/types.ts`), so
 * the mapping must be a proper rotation, never a mirror: a mirror would put
 * every op on the wrong end/side of the physical panel.
 *
 * - `rotated: false`: panel x → sheet +X, panel y → sheet +Y. The panel origin
 *   maps to the placement corner `(placement.x, placement.y)`.
 * - `rotated: true`: the panel is turned 90° counter-clockwise seen from above.
 *   Panel x (length) → sheet +Y, panel y (width) → sheet −X. The panel origin
 *   maps to the **lower-right** corner of the footprint,
 *   `(placement.x + part.width, placement.y)`.
 *
 * The part's own `length`/`width` define the mapping; a disagreeing
 * `placement.sizeX/sizeY` is reported by the generator.
 */
import type { Mm, Part, Placement, Vec3 } from '@/core/types'

export type PanelToSheet = (p: Vec3) => Vec3

export interface Rect {
  minX: Mm
  minY: Mm
  maxX: Mm
  maxY: Mm
}

type PartSize = Pick<Part, 'length' | 'width'>

export function panelToSheet(placement: Placement, part: PartSize): PanelToSheet {
  if (!placement.rotated) {
    return (p) => ({ x: placement.x + p.x, y: placement.y + p.y, z: p.z })
  }
  return (p) => ({ x: placement.x + part.width - p.y, y: placement.y + p.x, z: p.z })
}

/** Sheet-space rectangle covered by the placed part. */
export function partFootprint(placement: Placement, part: PartSize): Rect {
  const sizeX = placement.rotated ? part.width : part.length
  const sizeY = placement.rotated ? part.length : part.width
  return { minX: placement.x, minY: placement.y, maxX: placement.x + sizeX, maxY: placement.y + sizeY }
}
