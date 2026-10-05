/**
 * Overall dimensions for elevations. The primary dimension always states the
 * cabinet box the user entered (W × H × D); when something projects past it
 * (countertop, overhang, overlay fronts, face frame) a second dimension further
 * out states the overall size, and hung cabinets get their mounting height.
 */
import type { DrawingDimId, Mm } from '@/core/types'
import { dim, type DimShape, line, type LineShape, text, type TextShape, withId } from './shapes'

const EPS = 0.05

type Fmt = (v: Mm) => string

/** Horizontal: box span at `y` (below, tagged `id`), plus the overall span further out when larger. */
export function horizontalDims(box: { lo: Mm; hi: Mm }, all: { lo: Mm; hi: Mm }, y: Mm, gap: Mm, fmt: Fmt, id: DrawingDimId): DimShape[] {
  const out = [withId(dim(box.lo, y, box.hi, y, -gap * 1.5, fmt(box.hi - box.lo)), id)]
  if (all.lo < box.lo - EPS || all.hi > box.hi + EPS) out.push(dim(all.lo, y, all.hi, y, -gap * 2.8, `${fmt(all.hi - all.lo)} overall`))
  return out
}

/**
 * Vertical, left of `x`: the box height (tagged `height`), plus the overall
 * height (box bottom → highest part) when a top sits above the box.
 */
export function verticalDims(box: { lo: Mm; hi: Mm }, allTop: Mm, x: Mm, gap: Mm, fmt: Fmt): DimShape[] {
  const out = [withId(dim(x, box.lo, x, box.hi, gap * 1.5, fmt(box.hi - box.lo)), 'height')]
  if (allTop > box.hi + EPS) out.push(dim(x, box.lo, x, allTop, gap * 2.8, `${fmt(allTop - box.lo)} overall`))
  return out
}

/**
 * Hung cabinets: a note for the mounting height instead of a dimension down to
 * the floor (which would shrink the cabinet to a corner of the page). `y` is
 * below the box's horizontal dimensions. Tagged `floor-height`.
 */
export function mountingNote(floorHeight: Mm, x: Mm, y: Mm, size: Mm, fmt: Fmt): TextShape[] {
  return floorHeight > EPS ? [withId(text(x, y, `Bottom ${fmt(floorHeight)} above floor`, size, 'start'), 'floor-height')] : []
}

/** Floor line, only for cabinets that stand on the floor. */
export function floorLine(floorHeight: Mm, x0: Mm, x1: Mm): LineShape[] {
  return floorHeight > EPS ? [] : [line(x0, 0, x1, 0, 'hatch')]
}
