/**
 * Construction constants. Manufacturer-derived numbers carry a source note and
 * MUST be verified against the current manufacturer spec before cutting: the
 * shop owns these values, the engine only applies them consistently.
 */
import type { Mm } from '@/core/types'

/**
 * How a slide family derives the drawer-box width from the clear opening
 * width (LW, between the section panels):
 * - 'inside': the runner locates on the inside of the box sides, so the
 *   INSIDE box width is LW − deduction and the outside width grows with the
 *   actual side thickness (outside = LW − deduction + 2 × side thickness).
 * - 'outside': the runner sits between the box side and the cabinet side, so
 *   the OUTSIDE box width is LW − deduction whatever the side thickness.
 */
export interface SlideWidthRule {
  basis: 'inside' | 'outside'
  deduction: Mm
}

/** Drawer slide planning values for one slide family. */
export interface SlideClearances {
  width: SlideWidthRule
  /** Thickest drawer-box side the runner supports; thicker sides get a warning. */
  maxSideThickness: Mm
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
 * for drawer sides up to 16 mm thick (so 16 mm sides give an outside width of
 * LW − 10 mm, 12 mm sides LW − 18 mm), drawer bottom recessed 13 mm, drawer
 * length = nominal runner length (NL). Vertical clearances follow the runner
 * profile height. Verify against the current manufacturer spec, including the
 * side-thickness range of the exact runner ordered.
 */
export const UNDERMOUNT_CLEARANCES: SlideClearances = {
  width: { basis: 'inside', deduction: 42 },
  maxSideThickness: 16,
  bottomClearance: 14,
  topClearance: 6,
  bottomRecess: 13,
  runnerHoleHeight: 9,
}

/**
 * Generic ball-bearing, full-extension side-mount slides: 12.7 mm (1/2") per
 * side between the box and the cabinet side is the common industry spec (e.g.
 * Accuride 3832 data sheet), so outside width = LW − 25.4 mm. The runner screws
 * to the outside of the box side, so side thickness is not limited by the
 * slide. Verify against the manufacturer spec of the slide ordered.
 */
export const SIDE_MOUNT_SIDE_CLEARANCE: Mm = 12.7
export const SIDE_MOUNT_CLEARANCES: SlideClearances = {
  width: { basis: 'outside', deduction: 2 * SIDE_MOUNT_SIDE_CLEARANCE },
  maxSideThickness: Infinity,
  bottomClearance: 10,
  topClearance: 10,
  bottomRecess: 10,
  runnerHoleHeight: 37,
}

/**
 * Catalog `mount` prop values for slides (`HardwareItem.props.mount`):
 * 0 = undermount, 1 = side-mount. Slides without a `mount` prop match either.
 */
export const SLIDE_MOUNT_UNDERMOUNT = 0
export const SLIDE_MOUNT_SIDE = 1

/**
 * Catalog `faceFrame` prop for hinge plates (`HardwareItem.props.faceFrame`):
 * 1 = face-frame mounting plate; absent or 0 = frameless (carcass side) plate.
 */
export const HINGE_PLATE_FACE_FRAME = 1

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
/** Hole spacing of a pull without `props.centers` (defined with the handle styles). */
export { DEFAULT_PULL_CENTERS } from '@/core/handles'
export const DOOR_PULL_EDGE_OFFSET: Mm = 40
export const DOOR_PULL_END_OFFSET: Mm = 80
/**
 * Edge pulls screw into the inside face this far from the grip edge (centre of
 * the screw), typical for aluminium edge pulls with a ~20 mm back flange.
 */
export const EDGE_PULL_HOLE_INSET: Mm = 10
/** Blind depth of edge-pull screw holes (pilot / insert bore), clamped to 2/3 of the front thickness. */
export const EDGE_PULL_SCREW_DEPTH: Mm = 10
export const EDGE_PULL_MAX_DEPTH_RATIO = 2 / 3
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

/**
 * Hanging rods. Typical wardrobe planning values (e.g. Häfele / Hettich
 * wardrobe-rail planning sheets and common joinery practice); verify against
 * the rod and support actually ordered.
 */
/** Rod centre below the surface above: room to lift a hanger hook off (50–75 mm is usual). */
export const DEFAULT_ROD_DROP: Mm = 65
/** Rod cut this much short of the panel at each end, so it drops into the end flange cups. */
export const ROD_END_CLEARANCE: Mm = 3
/** Rod centre position across the usable interior depth (0 = rear, 1 = front): centred for hangers. */
export const ROD_DEPTH_FRACTION = 0.5
/** Ø25 tube spans longer than this sag under a full load and need a centre support. */
export const ROD_MAX_UNSUPPORTED_SPAN: Mm = 1200
/** Clear height from the rod centre to the underside of a shelf above it (hanger hooks lift off). */
export const ROD_SHELF_CLEARANCE: Mm = 50
/** End supports (flanges) per rod. */
export const ROD_END_SUPPORTS = 2
/** Catalog `centre` prop for rod supports (`HardwareItem.props.centre`): 1 = centre support. */
export const ROD_SUPPORT_CENTRE = 1
/**
 * Wardrobe preset: rod drop below the interior top that leaves an upper
 * (hat) shelf above and puts the rod centre ~1.73 m above the floor on a
 * 2100 mm tower with a 100 mm kick — long-garment hanging height.
 */
export const WARDROBE_ROD_DROP: Mm = 350
