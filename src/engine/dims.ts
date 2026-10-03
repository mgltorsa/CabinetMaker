/**
 * Key cabinet-space coordinates every rule shares, plus input feasibility.
 *
 * Conventions (cabinet space, see core/types): origin at the left / floor /
 * back corner, +X right, +Y up, +Z toward the front.
 * - `width` is the overall width: the carcass for frameless, the face frame
 *   for face-frame styles (the carcass is set in by `faceFrame.overhang`).
 * - `height` is floor-to-carcass-top including the toe kick, excluding any
 *   countertop or finished top (those sit on top). `floorHeight` lifts all of it.
 * - `depth` is the carcass depth including the back; face frames and overlay
 *   fronts project in front of z = depth.
 */
import type { BuildWarning, Cabinet, Mm, TopConstruction } from '@/core/types'
import { MIN_INTERIOR, MIN_INTERIOR_DEPTH, TALL_CABINET_HEIGHT, DADO_DEPTH_RATIO } from './constants'
import { warning, type Materials } from './context'
import { span, spanSize, type Span } from './geometry'

export interface Dims {
  W: Mm
  H: Mm
  D: Mm
  /** Carcass, back, front and face-frame thickness (face frame 0 when frameless). */
  t: Mm
  bt: Mm
  ft: Mm
  fft: Mm
  faceFrame: boolean
  inset: boolean
  /** Outer x of the carcass (between the outside faces of the sides). */
  carcassX: Span
  interiorX: Span
  /** Floor level (floorHeight), carcass box underside, carcass top, bottom of the sides. */
  y0: Mm
  yB: Mm
  yT: Mm
  sideY0: Mm
  interiorY: Span
  /** Rear z of carcass panels (applied backs sit behind them). */
  rearZ: Mm
  back: Span
  backFrontZ: Mm
  /** Interior parts start here: in front of the back and any rear nailer. */
  rearLimitZ: Mm
  /** z range of doors / drawer fronts. */
  frontZ: Span
  /** Front edge of the usable interior (behind inset fronts). */
  interiorFrontZ: Mm
  nailers: { top: boolean; bottom: boolean; width: Mm }
  top: TopConstruction
  /** Back groove depth (0 when the back is applied). */
  groove: Mm
  /** How far top/bottom/dividers/partitions run into dados (0 unless joinery is dado). */
  dado: Mm
}

export function dadoDepth(receiverThickness: Mm): Mm {
  return Math.round(receiverThickness * DADO_DEPTH_RATIO * 10) / 10
}

export interface DimsResult {
  dims: Dims
  warnings: BuildWarning[]
  fatal: boolean
}

function frontSpan(style: Cabinet['construction']['style'], D: Mm, ft: Mm, fft: Mm): Span {
  switch (style) {
    case 'frameless-overlay':
      return span(D, D + ft)
    case 'frameless-inset':
      return span(D - ft, D)
    case 'face-frame-overlay':
      return span(D + fft, D + fft + ft)
    case 'face-frame-inset':
      return span(D + fft - ft, D + fft)
  }
}

type Add = (level: BuildWarning['level'], code: string, message: string) => void

type Vertical = Pick<Dims, 'y0' | 'yB' | 'yT' | 'sideY0' | 'interiorY'>
type Depth = Pick<Dims, 'rearZ' | 'back' | 'backFrontZ' | 'rearLimitZ' | 'groove' | 'nailers'>

function verticalDims(cabinet: Cabinet, t: Mm): Vertical {
  const kick = cabinet.construction.toeKick
  const kickType = kick.height > 0 ? kick.type : 'none'
  const y0 = Number.isFinite(cabinet.floorHeight) ? Math.max(0, cabinet.floorHeight) : 0
  const yB = y0 + (kickType === 'none' ? 0 : kick.height)
  const yT = y0 + cabinet.height
  return { y0, yB, yT, sideY0: kickType === 'full' ? y0 : yB, interiorY: span(yB + t, yT - t) }
}

/** Back panel, back groove and rear nailers; interior parts start at `rearLimitZ`. */
function depthDims(cabinet: Cabinet, t: Mm, bt: Mm, interiorY: Span, add: Add): Depth {
  const c = cabinet.construction
  const captured = c.back.construction === 'captured'
  const maxGroove = t / 2
  if (captured && c.back.grooveDepth > maxGroove) add('warn', 'groove-too-deep', `Back groove limited to ${maxGroove} mm (half the carcass thickness)`)
  const backInset = Math.max(0, c.back.inset)
  const back = captured ? span(backInset, backInset + bt) : span(0, bt)
  const nailerFits = c.rearNailer && c.nailerWidth > 0 && c.nailerWidth * 3 <= spanSize(interiorY)
  if (c.rearNailer && !nailerFits && Number.isFinite(cabinet.height)) add('warn', 'nailer-skipped', 'Rear nailer does not fit the interior height; omitted')
  return {
    rearZ: captured ? 0 : bt,
    back,
    backFrontZ: back.hi,
    rearLimitZ: back.hi + (nailerFits ? t : 0),
    groove: captured ? Math.min(Math.max(0, c.back.grooveDepth), maxGroove) : 0,
    nailers: {
      top: nailerFits,
      bottom: nailerFits && (cabinet.type === 'wall' || cabinet.height >= TALL_CABINET_HEIGHT),
      width: c.nailerWidth,
    },
  }
}

function effectiveTop(cabinet: Cabinet, rearZ: Mm, add: Add): TopConstruction {
  const c = cabinet.construction
  if (c.top === 'stretchers' && (c.stretcherWidth <= 0 || 2 * c.stretcherWidth >= cabinet.depth - rearZ)) {
    add('warn', 'stretchers-replaced', 'Stretchers would overlap or are zero width; using a full top')
    return 'full-top'
  }
  return c.top
}

export function computeDims(cabinet: Cabinet, mats: Materials): DimsResult {
  const c = cabinet.construction
  const warnings: BuildWarning[] = []
  const add: Add = (level, code, message) => {
    warnings.push(warning(cabinet.id, level, code, message))
  }
  const { width: W, height: H, depth: D } = cabinet
  const t = mats.carcass.thickness
  const bt = mats.back.thickness
  const ft = mats.front.thickness
  const faceFrame = c.style.startsWith('face-frame')
  const fft = faceFrame && mats.faceFrame ? mats.faceFrame.thickness : 0
  const overhang = faceFrame ? Math.max(0, c.faceFrame.overhang) : 0
  const carcassX = span(overhang, W - overhang)
  const vertical = verticalDims(cabinet, t)
  const depth = depthDims(cabinet, t, bt, vertical.interiorY, add)
  const frontZ = frontSpan(c.style, D, ft, fft)
  const dims: Dims = {
    W,
    H,
    D,
    t,
    bt,
    ft,
    fft,
    faceFrame,
    inset: c.style.endsWith('inset'),
    carcassX,
    interiorX: span(carcassX.lo + t, carcassX.hi - t),
    ...vertical,
    ...depth,
    frontZ,
    interiorFrontZ: Math.min(D, frontZ.lo),
    top: effectiveTop(cabinet, depth.rearZ, add),
    dado: c.joinery === 'dado' ? dadoDepth(t) : 0,
  }
  const fatal = checkFeasible(cabinet, dims, add)
  return { dims, warnings, fatal }
}


/** Returns true when the cabinet cannot be built at all (an error has been added). */
function checkFeasible(cabinet: Cabinet, d: Dims, add: Add): boolean {
  const dims = [cabinet.width, cabinet.height, cabinet.depth, cabinet.floorHeight]
  if (!dims.every(Number.isFinite) || cabinet.width <= 0 || cabinet.height <= 0 || cabinet.depth <= 0) {
    add('error', 'invalid-dimensions', 'Width, height and depth must be positive numbers')
    return true
  }
  if (spanSize(d.interiorX) < MIN_INTERIOR) {
    add('error', 'too-narrow', `Cabinet is too narrow: interior width ${round1(spanSize(d.interiorX))} mm < ${MIN_INTERIOR} mm`)
    return true
  }
  if (spanSize(d.interiorY) < MIN_INTERIOR) {
    add('error', 'too-short', `Cabinet is too short: interior height ${round1(spanSize(d.interiorY))} mm < ${MIN_INTERIOR} mm`)
    return true
  }
  if (d.interiorFrontZ - d.rearLimitZ < MIN_INTERIOR_DEPTH) {
    add('error', 'too-shallow', `Cabinet is too shallow: interior depth ${round1(d.interiorFrontZ - d.rearLimitZ)} mm < ${MIN_INTERIOR_DEPTH} mm`)
    return true
  }
  return false
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}
