/**
 * Construction constants. Manufacturer-derived numbers carry a source note and
 * MUST be verified against the current manufacturer spec before cutting: the
 * shop owns these values, the engine only applies them consistently.
 */
import type { Mm } from '@/core/types'

/** Drawer slide planning values for one slide family. */
export interface SlideClearances {
  /** Opening width minus outside drawer-box width (both sides together). */
  sideClearanceTotal: Mm
  /** Gap from the opening bottom to the underside of the box sides. */
  bottomClearance: Mm
  /** Gap from the top of the box sides to the opening top. */
  topClearance: Mm
  /** Distance from the lower edge of the box sides to the underside of the bottom. */
  bottomRecess: Mm
  /** Height of the runner screw holes above the opening bottom. */
  runnerHoleHeight: Mm
}

/**
 * Blum TANDEM plus BLUMOTION (563H/569H) and MOVENTO (760H/766H) undermount
 * runners. Source: Blum planning guides — "inside drawer width = LW − 42 mm"
 * with 16 mm sides (outside width = LW − 10 mm), drawer bottom recessed 13 mm,
 * drawer length = nominal runner length (NL). Vertical clearances follow the
 * runner profile height. Verify against manufacturer spec.
 */
export const UNDERMOUNT_CLEARANCES: SlideClearances = {
  sideClearanceTotal: 10,
  bottomClearance: 14,
  topClearance: 6,
  bottomRecess: 13,
  runnerHoleHeight: 9,
}

/**
 * Generic ball-bearing side-mount slides: 12.7 mm (1/2") per side is the
 * industry-standard clearance (e.g. Accuride 3832 data sheet). Verify against
 * manufacturer spec.
 */
export const SIDE_MOUNT_CLEARANCES: SlideClearances = {
  sideClearanceTotal: 25.4,
  bottomClearance: 10,
  topClearance: 10,
  bottomRecess: 10,
  runnerHoleHeight: 37,
}

/** Catalog `mount` prop values for slides (`props.mount`). */
export const SLIDE_MOUNT_UNDERMOUNT = 0
export const SLIDE_MOUNT_SIDE = 1

/** Runner screw positions measured back from the opening front: System 32 points 37 + 32·k. */
export const RUNNER_HOLE_SYSTEM32_STEPS: readonly number[] = [0, 7, 14]
export const RUNNER_HOLE_DIAMETER: Mm = 5
export const RUNNER_HOLE_DEPTH: Mm = 10
/** Keep runner holes this far short of the slide's rear end. */
export const RUNNER_HOLE_REAR_MARGIN: Mm = 10

/** System 32: 32 mm hole pitch, first row 37 mm from the front edge. */
export const SYSTEM32_PITCH: Mm = 32
export const SYSTEM32_SETBACK: Mm = 37

/**
 * Hinge count by door height. Source: Blum "number of hinges" guide (door
 * height and weight, 16–19 mm doors). Verify against manufacturer spec for
 * heavy or wide doors.
 */
export const HINGE_COUNT_BY_HEIGHT: readonly { maxHeight: Mm; count: number }[] = [
  { maxHeight: 900, count: 2 },
  { maxHeight: 1600, count: 3 },
]
export const HINGE_COUNT_MAX = 4
/** Doors shorter than this cannot take two cup hinges. */
export const MIN_HINGED_DOOR_HEIGHT: Mm = 120

/** Blum CLIP mounting plates: two screws 32 mm apart on the System 32 line. Verify. */
export const HINGE_PLATE_HOLE_SPACING: Mm = 32
export const HINGE_PLATE_HOLE_DIAMETER: Mm = 5
export const HINGE_PLATE_HOLE_DEPTH: Mm = 10

/** Festool DOMINO 5×30 tenon is 19 mm wide (Festool 494938). Verify for other sizes. */
export const DOMINO_TENON_WIDTH: Mm = 19
export const DEFAULT_DOMINO = { thickness: 5, length: 30 } as const
export const DEFAULT_DOWEL = { diameter: 8, length: 30 } as const

/** Joinery layout. */
export const JOINT_END_INSET: Mm = 50
export const JOINT_MAX_PITCH: Mm = 150
/** Face bores/mortises go this fraction into the receiving panel. */
export const JOINT_FACE_DEPTH_RATIO = 2 / 3
/** Dados are this fraction of the receiving panel's thickness deep. */
export const DADO_DEPTH_RATIO = 1 / 3
/** Extra depth per fastener hole for glue. */
export const FASTENER_GLUE_CLEARANCE: Mm = 1
/** Keep this much material between blind holes drilled from both faces. */
export const MIN_WEB_BETWEEN_HOLES: Mm = 2

/** Pulls. */
export const PULL_HOLE_DIAMETER: Mm = 5
export const DEFAULT_PULL_CENTERS: Mm = 128
export const DOOR_PULL_EDGE_OFFSET: Mm = 40
export const DOOR_PULL_END_OFFSET: Mm = 80
/** Drawer fronts wider than this get two pulls. */
export const WIDE_DRAWER_WIDTH: Mm = 600
/** Single doors wider than this trigger an info warning. */
export const WIDE_DOOR_WIDTH: Mm = 600

/** Partial overlay on face frames (1/2"). */
export const FACE_FRAME_OVERLAY: Mm = 12.7

/** Shelves. */
export const SHELF_SIDE_CLEARANCE: Mm = 1
export const SHELF_FRONT_SETBACK: Mm = 3
/** First/last shelf-pin hole is at least this far from the bay's top/bottom. */
export const PIN_ROW_END_MARGIN: Mm = 40

/** Minimum sizes below which the engine refuses or skips a feature (with a warning). */
export const MIN_INTERIOR: Mm = 60
export const MIN_BAY_HEIGHT: Mm = 40
export const MIN_SECTION_WIDTH: Mm = 60
export const MIN_DRAWER_BOX_HEIGHT: Mm = 40
export const MIN_DRAWER_BOX_WIDTH: Mm = 60
export const MIN_INTERIOR_DEPTH: Mm = 50
export const MIN_PART_SIZE: Mm = 1

/** Cabinets at least this tall (and wall cabinets) get a bottom rear nailer too. */
export const TALL_CABINET_HEIGHT: Mm = 1500
/** Separate kick bases get an intermediate sleeper at most this far apart. */
export const KICK_SLEEPER_MAX_SPACING: Mm = 900
