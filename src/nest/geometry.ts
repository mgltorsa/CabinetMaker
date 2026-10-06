/**
 * Nest geometry rules shared by the packer and the validator.
 *
 * Spacing rule (sheet space, mm):
 * - Usable area = sheet minus `edgeTrim` on every edge:
 *   x ∈ [edgeTrim, sheetLength − edgeTrim], y ∈ [edgeTrim, sheetWidth − edgeTrim].
 *   A part may touch the usable-area boundary (the trim margin already absorbs
 *   the edge cut).
 * - Between any two parts the clear gap along at least one axis must be
 *   ≥ `kerf + partSpacing` (the "part gap"). Parts never overlap.
 *
 * Packing trick: every part is inflated by the gap on its +X and +Y sides and
 * the usable bin is enlarged by the same gap. Non-overlapping inflated rects
 * then give exactly the rule above, and a part's real footprint can reach the
 * far trim boundary because its inflation lands in the bin's extra gap.
 */
import type { Grain, Mm, NestSettings, Part, Placement, SheetMaterial } from '@/core/types'

/** Tolerance for float comparisons (mm). Far below any shop-relevant size. */
export const EPS = 1e-6

export interface Orientation {
  /** true: part length runs along sheet Y. */
  readonly rotated: boolean
  readonly sizeX: Mm
  readonly sizeY: Mm
}

export interface UsableArea {
  readonly x0: Mm
  readonly y0: Mm
  readonly width: Mm
  readonly height: Mm
}

export function partGap(settings: NestSettings): Mm {
  return settings.kerf + settings.partSpacing
}

export function usableArea(material: SheetMaterial, settings: NestSettings): UsableArea {
  return {
    x0: settings.edgeTrim,
    y0: settings.edgeTrim,
    width: material.sheetLength - 2 * settings.edgeTrim,
    height: material.sheetWidth - 2 * settings.edgeTrim,
  }
}

/** Returns a human-readable problem with the settings, or null when valid. */
export function describeSettingsError(settings: NestSettings): string | null {
  const fields: readonly (keyof Omit<NestSettings, 'ignoreGrain'>)[] = ['kerf', 'edgeTrim', 'partSpacing']
  const bad = fields.filter((key) => !Number.isFinite(settings[key]) || settings[key] < 0)
  return bad.length === 0 ? null : `invalid nest settings: ${bad.join(', ')} must be finite and ≥ 0`
}

/** True when the sheet's grain constrains rotation for this nest. */
export function isGrainLocked(material: SheetMaterial, settings: NestSettings): boolean {
  return material.grained && !settings.ignoreGrain
}

export function footprint(part: Pick<Part, 'length' | 'width'>, rotated: boolean): Orientation {
  return rotated
    ? { rotated, sizeX: part.width, sizeY: part.length }
    : { rotated, sizeX: part.length, sizeY: part.width }
}

/** Sheet grain runs along X: 'length' grain ⇒ not rotated, 'width' ⇒ rotated. */
export function isRotationAllowed(grain: Grain, rotated: boolean, grainLocked: boolean): boolean {
  if (!grainLocked || grain === 'none') return true
  return grain === 'length' ? !rotated : rotated
}

/** Orientations permitted by grain. Square parts get one (rotating changes nothing). */
export function allowedOrientations(part: Part, grainLocked: boolean): Orientation[] {
  const options = [false, true]
    .filter((rotated) => isRotationAllowed(part.grain, rotated, grainLocked))
    .map((rotated) => footprint(part, rotated))
  const isSquare = Math.abs(part.length - part.width) <= EPS
  return isSquare ? options.slice(0, 1) : options
}

export function hasValidSize(part: Pick<Part, 'length' | 'width'>): boolean {
  return Number.isFinite(part.length) && Number.isFinite(part.width) && part.length > 0 && part.width > 0
}

/** Total placed footprint area (mm²). */
export function placedArea(placements: readonly Placement[]): number {
  return placements.reduce((sum, p) => sum + p.sizeX * p.sizeY, 0)
}

/** Formats a length for messages: integers as-is, otherwise one decimal. */
export function formatMm(value: Mm): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
