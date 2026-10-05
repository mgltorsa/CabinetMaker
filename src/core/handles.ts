/**
 * Handle (pull) styles: defaults and resolution of a pull's optional
 * `HandleSpec` into concrete sizes. Pure; shared by the engine (holes), the
 * drawings, the 3D scene and the Blender export so they always agree.
 *
 * Default sizes are typical catalogue figures for generic hardware (bar pulls
 * Ø12 mm, 30 mm round knobs, 2 mm aluminium edge / J-profiles). They are
 * display and placement defaults only; the shop sets real sizes per item.
 */
import type { HandleSpec, HandleStyle, HardwareItem, Id, Mm, ModelFormat, ModelUnit, Vec3 } from './types'
import { MM_PER_MODEL_UNIT } from './units'

export const HANDLE_STYLES: readonly HandleStyle[] = ['bar', 'knob', 'edge', 'cup', 'j-profile', 'custom']

/** Hole spacing when a pull has no `props.centers` (the classic 128 mm bar). */
export const DEFAULT_PULL_CENTERS: Mm = 128
/** Custom handles with centres below this get a single hole (two holes this close would merge). */
export const MIN_TWO_HOLE_CENTERS: Mm = 16
/** Brushed-steel grey, as the 3D view drew every pull before handle colours existed. */
export const DEFAULT_HANDLE_COLOR = '#c9ccd0'

/** Bar pull: overall length = centres + this (15 mm overhang each end, typical for Ø12 bars). */
export const BAR_LENGTH_OVER_CENTERS: Mm = 30
/** Ø12 mm steel bar, 28 mm stand-off: typical generic bar pull (and the 3D view's former fixed size). */
const BAR_DIAMETER: Mm = 12
const BAR_PROJECTION: Mm = 28
/** Ø30 mm round knob, 28 mm projection: typical generic knob. */
const KNOB_DIAMETER: Mm = 30
const KNOB_PROJECTION: Mm = 28
/** Edge pull: e.g. a 150 mm aluminium angle on 128 mm screw centres, 2 mm sheet, 25 mm lip 12 mm off the face. */
const EDGE_LENGTH_OVER_CENTERS: Mm = 22
const EDGE_LIP: Mm = 25
const EDGE_PROJECTION: Mm = 12
/** Cup (bin) pull: e.g. 128 mm overall on 96 mm centres, 40 mm tall, 22 mm deep. */
const CUP_LENGTH_OVER_CENTERS: Mm = 32
const CUP_HEIGHT: Mm = 40
const CUP_PROJECTION: Mm = 22
/** J-profile: 2 mm aluminium, 30 mm lip, 15 mm finger gap. */
const J_LIP: Mm = 30
const J_PROJECTION: Mm = 15
const PROFILE_THICKNESS: Mm = 2

/** The imported model of a custom handle (all fields present). */
export interface HandleModel {
  blobId: Id
  format: ModelFormat
  unit: ModelUnit
  nativeSize: Vec3
}

/** A pull's handle with every size filled in. */
export interface ResolvedHandle {
  style: HandleStyle
  /** Hole spacing (`props.centers`). */
  centers: Mm
  /** Overall length along the pull (unused by J-profiles, which span the front). */
  length: Mm
  /** Size across the pull (cup height, edge / J lip height, bar and knob: the diameter). */
  width: Mm
  /** Bar / knob diameter, or profile sheet thickness. */
  diameter: Mm
  /** Stand-off from the show face. */
  projection: Mm
  color: string
  model?: HandleModel
}

export function isHandleStyle(value: unknown): value is HandleStyle {
  return typeof value === 'string' && (HANDLE_STYLES as readonly string[]).includes(value)
}

/** The model of a custom handle when all its fields are set, else null. */
export function handleModel(item: HardwareItem): HandleModel | null {
  const h = item.handle
  if (!h || h.blobId === undefined || h.format === undefined || h.unit === undefined || h.nativeSize === undefined) return null
  return { blobId: h.blobId, format: h.format, unit: h.unit, nativeSize: h.nativeSize }
}

/** Model size in mm (unit conversion only). */
export function modelSizeMm(model: HandleModel): Vec3 {
  const k = MM_PER_MODEL_UNIT[model.unit]
  return { x: model.nativeSize.x * k, y: model.nativeSize.y * k, z: model.nativeSize.z * k }
}

interface StyleSizes {
  length: Mm
  width: Mm
  diameter: Mm
  projection: Mm
}

function styleDefaults(style: HandleStyle, centers: Mm, model: HandleModel | null): StyleSizes {
  switch (style) {
    case 'knob':
      return { length: KNOB_DIAMETER, width: KNOB_DIAMETER, diameter: KNOB_DIAMETER, projection: KNOB_PROJECTION }
    case 'edge':
      return { length: centers + EDGE_LENGTH_OVER_CENTERS, width: EDGE_LIP, diameter: PROFILE_THICKNESS, projection: EDGE_PROJECTION }
    case 'cup':
      return { length: centers + CUP_LENGTH_OVER_CENTERS, width: CUP_HEIGHT, diameter: PROFILE_THICKNESS, projection: CUP_PROJECTION }
    case 'j-profile':
      return { length: 0, width: J_LIP, diameter: PROFILE_THICKNESS, projection: J_PROJECTION }
    case 'custom': {
      if (model) {
        const size = modelSizeMm(model)
        return { length: size.x, width: size.y, diameter: Math.min(size.y, size.z), projection: size.z }
      }
      return { length: centers + BAR_LENGTH_OVER_CENTERS, width: BAR_DIAMETER, diameter: BAR_DIAMETER, projection: BAR_PROJECTION }
    }
    case 'bar':
      return { length: centers + BAR_LENGTH_OVER_CENTERS, width: BAR_DIAMETER, diameter: BAR_DIAMETER, projection: BAR_PROJECTION }
  }
}

/** Every size of a pull's handle; a pull without `handle` is a bar. */
export function resolveHandle(item: HardwareItem): ResolvedHandle {
  const spec: HandleSpec = item.handle ?? { style: 'bar' }
  const style = isHandleStyle(spec.style) ? spec.style : 'bar'
  const centers = item.props.centers ?? DEFAULT_PULL_CENTERS
  const model = handleModel(item)
  const d = styleDefaults(style, centers, model)
  // Knobs are round: one diameter sets length and width unless given.
  const diameter = spec.diameter ?? d.diameter
  const round = style === 'knob' ? diameter : null
  return {
    style,
    centers,
    length: spec.length ?? round ?? d.length,
    width: spec.width ?? round ?? d.width,
    diameter,
    projection: spec.projection ?? d.projection,
    color: spec.color ?? DEFAULT_HANDLE_COLOR,
    ...(model ? { model } : {}),
  }
}

/** Holes each pull of this handle needs: 2 (bar, cup, edge, custom on centres), 1 (knob, custom single screw) or 0 (J-profile). */
export function holesPerPull(handle: ResolvedHandle): 0 | 1 | 2 {
  switch (handle.style) {
    case 'j-profile':
      return 0
    case 'knob':
      return 1
    case 'custom':
      return handle.centers < MIN_TWO_HOLE_CENTERS ? 1 : 2
    default:
      return 2
  }
}
