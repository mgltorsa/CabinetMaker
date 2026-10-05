/**
 * Sanity bounds shared by the project validator (imports, saved projects) and
 * the editor inputs, so the UI can never produce a project the validator
 * rejects. They exist to stop runaway derivations (millions of toolpath
 * points, tens of thousands of holes), not to encode shop practice.
 *
 * Invariant: every editor input is at least as strict as the validator.
 */
import type { Mm } from '@/core/types'

export interface Bounds {
  min: number
  max: number
}

/** Generic upper bound for any length (10 m): larger than any sheet or room wall. */
export const MAX_LENGTH: Mm = 10_000

/** Cabinet width / height / depth. */
export const CABINET_DIMENSION: Bounds = { min: 50, max: 3000 }
/** Cabinet floor height (wall cabinets hang above the floor). */
export const FLOOR_HEIGHT: Bounds = { min: 0, max: 3000 }
/** Fixed section widths and bay heights (`null` = auto is always allowed). */
export const SECTION_SIZE: Bounds = { min: 1, max: 3000 }

export const MAX_CABINETS = 100
export const MAX_SECTIONS = 10
export const MAX_BAYS = 20
export const MAX_SHELVES = 20
/** Catalog lists (materials, hardware, walls…): far above any real shop, low enough to render. */
export const MAX_CATALOG_ITEMS = 1000

/** Smallest step down per pass; smaller values explode the pass count. */
export const MIN_STEP_DOWN: Mm = 0.1
/** Tool numbers T1..T99. */
export const TOOL_NUMBER: Bounds = { min: 1, max: 99 }

/**
 * Shelf pins: spacing bounded below and diameter above, so spacing ≥ diameter
 * always holds and a tall side cannot get thousands of holes.
 */
export const MIN_SHELF_PIN_SPACING: Mm = 12
export const MAX_SHELF_PIN_DIAMETER: Mm = 12

/** Tabs: spacing bounded below and width above, so spacing > width always holds. */
export const MIN_TAB_SPACING: Mm = 50
export const MAX_TAB_WIDTH: Mm = 40

/** Material (stock) thickness: veneers up to slabs; more is a typo that would explode CAM passes. */
export const MATERIAL_THICKNESS: Bounds = { min: 0.1, max: 200 }
/** Sheet length / width and linear board width / stock length. */
export const STOCK_SIZE: Bounds = { min: 1, max: MAX_LENGTH }
