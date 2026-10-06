/** Tolerances and limits used by the CAM generator. All lengths in mm. */

/** A hole within this of the drill diameter is drilled (requirement P4). */
export const DRILL_DIAMETER_TOLERANCE = 0.2

/** Max deviation between a true circle and its polyline approximation. */
export const CHORD_ERROR = 0.05

/** Min overlap between adjacent parallel passes, as a fraction of tool diameter. */
export const MIN_PASS_OVERLAP = 0.1

/** A feature this much narrower than a tool still counts as the tool's size. */
export const FIT_TOLERANCE = 0.01

/** Slack when checking that an op lies inside its part or the sheet. */
export const GEOMETRY_EPSILON = 0.001

/** Fewest tabs any profiled part gets when tabs are enabled. */
export const MIN_TABS_PER_PART = 4

/**
 * Steepest helical ramp into a circular pocket, in degrees from horizontal.
 * Conservative general shop practice for solid-carbide end mills in sheet
 * goods is a 2–10° ramp; we use the top of that range and add helix turns
 * until each one descends no more steeply.
 */
export const MAX_HELIX_ANGLE_DEG = 10

/**
 * A helix needing more turns than this (its radius is tiny, so it is almost a
 * plunge anyway) is replaced by a straight plunge at the plunge feed.
 */
export const MAX_HELIX_TURNS = 12
