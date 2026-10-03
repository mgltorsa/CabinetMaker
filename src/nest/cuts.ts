/**
 * Cut-count estimate for a cutting plan.
 *
 * Counts distinct straight cut segments: every part edge must be cut; edges on
 * the same line are one cut when the stretch between them crosses no part
 * (it runs through kerf/waste only). Edges on the trim boundary still count
 * because the trim strip is cut off separately. Breakdown/squaring cuts of the
 * raw sheet are not included. A router profiles each part on its own, so for
 * CNC labor `4 × parts` is the upper bound; this number is the saw-style count
 * shown on the cutting plan.
 */
import type { Sheet } from '@/core/types'
import { EPS } from './geometry'

/** A placement in cut-local axes: `a` across the cut line, `b` along it. */
interface Span {
  readonly a0: number
  readonly a1: number
  readonly b0: number
  readonly b1: number
}

interface Edge {
  readonly line: number
  readonly start: number
  readonly end: number
}

function edgesOf(spans: readonly Span[]): Edge[] {
  return spans
    .flatMap((s) => [
      { line: s.a0, start: s.b0, end: s.b1 },
      { line: s.a1, start: s.b0, end: s.b1 },
    ])
    .sort((p, q) => p.line - q.line || p.start - q.start)
}

/** True when a straight cut along `line` from `from` to `to` would cut into a part. */
function crossesPart(spans: readonly Span[], line: number, from: number, to: number): boolean {
  return spans.some((s) => s.a0 < line - EPS && line < s.a1 - EPS && s.b0 < to - EPS && from < s.b1 - EPS)
}

/** `next` (sorted after `cut`) extends the same straight cut. */
function extendsCut(spans: readonly Span[], cut: Edge, next: Edge): boolean {
  if (Math.abs(next.line - cut.line) > EPS) return false
  return next.start <= cut.end + EPS || !crossesPart(spans, cut.line, cut.end, next.start)
}

function countLineCuts(spans: readonly Span[]): number {
  const [first, ...rest] = edgesOf(spans)
  if (first === undefined) return 0
  let count = 1
  let cut: Edge = first
  for (const edge of rest) {
    if (extendsCut(spans, cut, edge)) {
      cut = { line: cut.line, start: cut.start, end: Math.max(cut.end, edge.end) }
    } else {
      count += 1
      cut = edge
    }
  }
  return count
}

/** Distinct straight cut segments needed to free every part on the sheet. */
export function estimateCutCount(sheet: Sheet): number {
  const vertical = sheet.placements.map((p) => ({ a0: p.x, a1: p.x + p.sizeX, b0: p.y, b1: p.y + p.sizeY }))
  const horizontal = sheet.placements.map((p) => ({ a0: p.y, a1: p.y + p.sizeY, b0: p.x, b1: p.x + p.sizeX }))
  return countLineCuts(vertical) + countLineCuts(horizontal)
}
