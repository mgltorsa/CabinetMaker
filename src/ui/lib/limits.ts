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
// ─── Costs (estimate parameters, hardware catalog) ──────────────────────────

/** Any money amount typed by the user (unit costs, minimum charge). */
export const MAX_MONEY = 10_000_000
/** Material / hardware markup as a fraction of cost: up to +1000 %. */
export const MARKUP: Bounds = { min: 0, max: 10 }
/** Tax rate as a fraction of the price: up to 100 %. */
export const TAX_RATE: Bounds = { min: 0, max: 1 }
/** Quantity on one extra charge line. */
export const EXTRA_QTY: Bounds = { min: 0, max: 100_000 }
/** User-defined extra charge lines per project. */
export const MAX_EXTRA_CHARGES = 50

/** Kind-specific hardware props edited in the catalog (editor only; the validator accepts any finite prop). */
export const SLIDE_LENGTH: Bounds = { min: 100, max: 1500 }
export const HINGE_OPENING_ANGLE: Bounds = { min: 1, max: 270 }
export const PULL_CENTERS: Bounds = { min: 16, max: 1500 }
/** Custom handles may take 0 centres (a single screw). */
export const CUSTOM_PULL_CENTERS: Bounds = { min: 0, max: PULL_CENTERS.max }
/** Handle length / width / diameter (mm): a J-profile cut for a 3 m front is the largest. */
export const HANDLE_DIMENSION: Bounds = { min: 0.5, max: 3000 }
/** How far a handle stands off the front (mm). */
export const HANDLE_PROJECTION: Bounds = { min: 0, max: 200 }
/** Hanging-rod drop below the bay top (rod centre). */
export const ROD_DROP: Bounds = { min: 1, max: 3000 }
/**
 * Plan-book PDF settings: watermark opacity / size / rotation, text lengths and
 * the logo and watermark image caps. Defined next to the settings so the PDF
 * renderer (a domain module) clamps to the same bounds.
 */
export { PDF_LIMITS } from '@/core/pdf-settings'
// ─── Room & imported models (phase 6) ───────────────────────────────────────

/** Imported models per project. */
export const MAX_MODELS = 50
/** Largest model file accepted (bytes). Bigger files stall parsing on the main thread. */
export const MAX_MODEL_BYTES = 50 * 1024 * 1024
/** Largest project .zip bundle, and the most it may inflate to (zip-bomb guard). */
export const MAX_BUNDLE_BYTES = 250 * 1024 * 1024
/** Largest `project.json` inside a bundle. */
export const MAX_PROJECT_JSON_BYTES = 10 * 1024 * 1024
/** Room-space coordinate of a placed model or cabinet (mm). */
export const ROOM_COORD: Bounds = { min: -20_000, max: 20_000 }
/** Lift of a model above the floor (mm). */
export const MODEL_LIFT: Bounds = { min: -5000, max: 5000 }
/** Uniform model scale on top of the unit conversion. */
export const MODEL_SCALE: Bounds = { min: 0.01, max: 100 }
/** Model bounding-box size in its own units; zero allowed for flat models. */
export const MODEL_NATIVE_SIZE: Bounds = { min: 0, max: 1e7 }
/** Rectangular room builder (mm). */
export const ROOM_SIZE: Bounds = { min: 500, max: MAX_LENGTH }
export const ROOM_HEIGHT: Bounds = { min: 1000, max: 6000 }
export const WALL_THICKNESS: Bounds = { min: 10, max: 1000 }
