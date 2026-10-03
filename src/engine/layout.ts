/**
 * Opening layout: sections (columns) and bays (rows) → front rectangles,
 * clear interior spans, dividers, partitions and face-frame members.
 *
 * Bay `height` meaning per style (null bays share what is left):
 * - frameless-overlay: the front height. Fronts cover the whole carcass face
 *   minus `reveal.edge` at the outside and `reveal.between` between fronts.
 * - frameless-inset, face-frame-*: the opening height (between partitions or
 *   face-frame rails); inset fronts are the opening minus `reveal.edge` all
 *   round, face-frame overlay fronts lap the frame by FACE_FRAME_OVERLAY.
 *
 * Fixed horizontal members between bays (decision):
 * - frameless-overlay: a fixed carcass partition only between two adjacent
 *   door/open bays (stiffens tall cabinets; drawers need nothing between them).
 * - frameless-inset: a fixed partition between every pair of bays, so each
 *   inset front has its own opening to close against.
 * - face-frame styles: a face-frame mid-rail between every pair of bays and no
 *   carcass partition; mid-stiles sit in front of the carcass dividers.
 */
import type { Bay, BuildWarning, Cabinet, Mm, Section } from '@/core/types'
import { FACE_FRAME_OVERLAY, MIN_BAY_HEIGHT, MIN_SECTION_WIDTH } from './constants'
import { warning } from './context'
import type { Dims } from './dims'
import { distribute } from './distribute'
import { intersectSpan, span, spanMid, spanSize, type Span } from './geometry'

export interface FrontRect {
  x: Span
  y: Span
}

export interface BayLayout {
  bay: Bay
  /** 0-based section and bay index. */
  section: number
  index: number
  /** Clear interior height for drawer boxes and shelves (inside the carcass). */
  openingY: Span
  /** Front rectangle in the front plane (for open bays: the slot it would occupy). */
  front: FrontRect
}

export interface SectionLayout {
  index: number
  /** Between the inner faces of the bounding carcass panels. */
  carcassX: Span
  /** Face-frame opening, or the carcass interior when frameless. */
  openingX: Span
  /** Clear width for boxes and shelves: opening ∩ carcass interior. */
  clearX: Span
  bays: BayLayout[]
  /** Fixed carcass partitions (y spans) between bays, top to bottom. */
  partitions: Span[]
  /** Face-frame mid-rails (y spans) between bays, top to bottom. */
  midRails: Span[]
}

export interface CabinetLayout {
  sections: SectionLayout[]
  /** Carcass dividers (x spans), left to right. */
  dividers: Span[]
  /** Face-frame mid-stiles (x spans), left to right. */
  midStiles: Span[]
}

interface Columns {
  carcass: Span[]
  opening: Span[]
  dividers: Span[]
  midStiles: Span[]
}

type Warn = (level: BuildWarning['level'], code: string, message: string) => void

const EMPTY_LAYOUT: CabinetLayout = { sections: [], dividers: [], midStiles: [] }

export function computeLayout(cabinet: Cabinet, d: Dims): { layout: CabinetLayout; warnings: BuildWarning[] } {
  const warnings: BuildWarning[] = []
  const add: Warn = (level, code, message) => warnings.push(warning(cabinet.id, level, code, message))
  const cols = computeColumns(cabinet, d, add)
  if (!cols) return { layout: EMPTY_LAYOUT, warnings }
  const sections = cabinet.sections.map((s, i) => layoutSection(cabinet, d, s, i, cols, add))
  return { layout: { sections, dividers: cols.dividers, midStiles: cols.midStiles }, warnings }
}

function sequence(zone: Span, sizes: readonly Mm[], sep: Mm): { slots: Span[]; seps: Span[] } {
  const slots: Span[] = []
  const seps: Span[] = []
  let x = zone.lo
  sizes.forEach((w, i) => {
    slots.push(span(x, x + w))
    if (i < sizes.length - 1) seps.push(span(x + w, x + w + sep))
    x += w + sep
  })
  return { slots, seps }
}

function computeColumns(cabinet: Cabinet, d: Dims, add: Warn): Columns | null {
  const n = cabinet.sections.length
  if (n === 0) return { carcass: [], opening: [], dividers: [], midStiles: [] }
  const ff = cabinet.construction.faceFrame
  const zone = d.faceFrame ? span(ff.stileWidth, d.W - ff.stileWidth) : d.interiorX
  const sep = d.faceFrame ? ff.stileWidth : d.t
  const dist = distribute(
    cabinet.sections.map((s) => s.width),
    spanSize(zone) - (n - 1) * sep,
    MIN_SECTION_WIDTH,
  )
  if (dist.status === 'impossible') {
    add('error', 'sections-dont-fit', `${n} sections do not fit the interior width; interior left empty`)
    return null
  }
  if (dist.status === 'scaled') add('warn', 'section-widths-adjusted', 'Section widths do not add up to the interior width; scaled to fit')
  const { slots, seps } = sequence(zone, dist.sizes, sep)
  if (!d.faceFrame) return { carcass: slots, opening: slots, dividers: seps, midStiles: [] }

  const dividers = seps.map((m) => span(spanMid(m) - d.t / 2, spanMid(m) + d.t / 2))
  // Divider i sits between sections i and i + 1; the outer sections end at the sides.
  const carcass = slots.map((_, i) => span(dividers[i - 1]?.hi ?? d.interiorX.lo, dividers[i]?.lo ?? d.interiorX.hi))
  if (carcass.some((c) => spanSize(c) < MIN_SECTION_WIDTH)) {
    add('error', 'sections-dont-fit', 'Carcass sections behind the face frame are too narrow; interior left empty')
    return null
  }
  return { carcass, opening: slots, dividers, midStiles: seps }
}

function layoutSection(cabinet: Cabinet, d: Dims, s: Section, i: number, cols: Columns, add: Warn): SectionLayout {
  const carcassX = cols.carcass[i]!
  const openingX = cols.opening[i]!
  const clearX = intersectSpan(openingX, carcassX)
  const base: SectionLayout = { index: i, carcassX, openingX, clearX, bays: [], partitions: [], midRails: [] }
  if (s.bays.length === 0) return base
  const style = cabinet.construction.style
  const rows = style === 'frameless-overlay' ? overlayRows(cabinet, d, s, i, cols) : openingRows(cabinet, d, s, i, openingX)
  if (!rows) {
    add('error', 'bays-dont-fit', `Section ${i + 1}: ${s.bays.length} bays do not fit the opening height; section left empty`)
    return base
  }
  if (rows.scaled) add('warn', 'bay-heights-adjusted', `Section ${i + 1}: bay heights do not add up to the opening; scaled to fit`)
  return { ...base, bays: rows.bays, partitions: rows.partitions, midRails: rows.midRails }
}

interface Rows {
  bays: BayLayout[]
  partitions: Span[]
  midRails: Span[]
  scaled: boolean
}

/** Frameless overlay: bay heights are front heights over the whole carcass face. */
function overlayRows(cabinet: Cabinet, d: Dims, s: Section, i: number, cols: Columns): Rows | null {
  const { edge, between } = cabinet.construction.reveal
  const n = s.bays.length
  const zone = span(d.yB + edge, d.yT - edge)
  const dist = distribute(
    s.bays.map((b) => b.height),
    spanSize(zone) - (n - 1) * between,
    MIN_BAY_HEIGHT,
  )
  if (dist.status === 'impossible') return null
  const fronts = sequence(zone, [...dist.sizes].reverse(), between).slots.reverse()
  const leftDivider = cols.dividers[i - 1]
  const rightDivider = cols.dividers[i]
  const frontX = span(
    leftDivider ? spanMid(leftDivider) + between / 2 : d.carcassX.lo + edge,
    rightDivider ? spanMid(rightDivider) - between / 2 : d.carcassX.hi - edge,
  )
  // Boundary between bay j and j+1 (top to bottom): partition span or the gap centre.
  const boundaries = s.bays.slice(0, -1).map((b, j) => {
    const c = (fronts[j]!.lo + fronts[j + 1]!.hi) / 2
    const fixed = b.kind !== 'drawer' && s.bays[j + 1]!.kind !== 'drawer'
    return fixed ? span(c - d.t / 2, c + d.t / 2) : span(c, c)
  })
  const bays = s.bays.map((bay, j) => {
    const top = j === 0 ? d.interiorY.hi : boundaries[j - 1]!.lo
    const bottom = j === n - 1 ? d.interiorY.lo : boundaries[j]!.hi
    return { bay, section: i, index: j, openingY: intersectSpan(span(bottom, top), d.interiorY), front: { x: frontX, y: fronts[j]! } }
  })
  return { bays, partitions: boundaries.filter((b) => spanSize(b) > 0), midRails: [], scaled: dist.status === 'scaled' }
}

/** Inset and face-frame styles: bay heights are opening heights between fixed members. */
function openingRows(cabinet: Cabinet, d: Dims, s: Section, i: number, openingX: Span): Rows | null {
  const c = cabinet.construction
  const n = s.bays.length
  const zone = d.faceFrame ? span(d.yB + c.faceFrame.railWidth, d.yT - c.faceFrame.railWidth) : d.interiorY
  const sep = d.faceFrame ? c.faceFrame.railWidth : d.t
  const dist = distribute(
    s.bays.map((b) => b.height),
    spanSize(zone) - (n - 1) * sep,
    MIN_BAY_HEIGHT,
  )
  if (dist.status === 'impossible') return null
  const seq = sequence(zone, [...dist.sizes].reverse(), sep)
  const openings = seq.slots.reverse()
  const members = seq.seps.reverse()
  const bays = s.bays.map((bay, j) => ({
    bay,
    section: i,
    index: j,
    openingY: intersectSpan(openings[j]!, d.interiorY),
    front: frontFor(cabinet, d, openingX, openings[j]!, { first: i === 0, last: i === cabinet.sections.length - 1, top: j === 0, bottom: j === n - 1 }),
  }))
  return {
    bays,
    partitions: d.faceFrame ? [] : members,
    midRails: d.faceFrame ? members : [],
    scaled: dist.status === 'scaled',
  }
}

interface Outer {
  first: boolean
  last: boolean
  top: boolean
  bottom: boolean
}

function frontFor(cabinet: Cabinet, d: Dims, ox: Span, oy: Span, outer: Outer): FrontRect {
  const c = cabinet.construction
  const e = c.reveal.edge
  if (d.inset) return { x: span(ox.lo + e, ox.hi - e), y: span(oy.lo + e, oy.hi - e) }
  // Face-frame overlay: lap the frame, leaving `edge` at the outside and `between` inside.
  const lap = (member: Mm, isOuter: boolean): Mm =>
    Math.max(0, Math.min(FACE_FRAME_OVERLAY, isOuter ? member - e : (member - c.reveal.between) / 2))
  const sw = c.faceFrame.stileWidth
  const rw = c.faceFrame.railWidth
  return {
    x: span(ox.lo - lap(sw, outer.first), ox.hi + lap(sw, outer.last)),
    y: span(oy.lo - lap(rw, outer.bottom), oy.hi + lap(rw, outer.top)),
  }
}
