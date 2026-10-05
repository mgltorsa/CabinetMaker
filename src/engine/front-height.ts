/**
 * Inverse of the layout for one front: which bay heights make a front come
 * out at a given height. A bay's `height` is the front height only for
 * frameless-overlay; inset and face-frame styles store the opening height, and
 * their fronts are smaller (reveals) or larger (frame lap). Rather than
 * re-deriving those rules, the edit is made on the laid-out bay height (front
 * and bay height move together one for one) and checked by laying out again.
 *
 * Which bay gives up the space: bays with a `null` (shared) height absorb it
 * when there are any; when every bay is fixed, the neighbouring bay (below,
 * else above) does, and the other bays keep their laid-out heights.
 */
import type { Cabinet, Mm } from '@/core/types'
import { round } from '@/core/units'
import { resolveMaterials } from './context'
import { computeDims } from './dims'
import { spanSize } from './geometry'
import { computeLayout, type BayLayout } from './layout'
import type { EngineContext } from './index'

export type FrontHeightEdit = { ok: true; heights: (Mm | null)[] } | { ok: false; error: string }

/** Stored heights are rounded to this many decimals (µm), so they stay readable. */
const DECIMALS = 3
/** Laid-out fronts may differ from the typed height by float noise and that rounding. */
const TOLERANCE: Mm = 0.01

function bayLayouts(cabinet: Cabinet, ctx: EngineContext, sectionIndex: number): BayLayout[] | null {
  const resolved = resolveMaterials(cabinet, ctx.materials)
  if (!resolved.ok) return null
  const dims = computeDims(cabinet, resolved.mats)
  if (dims.fatal) return null
  return computeLayout(cabinet, dims.dims).layout.sections[sectionIndex]?.bays ?? null
}

function withHeights(cabinet: Cabinet, sectionIndex: number, heights: readonly (Mm | null)[]): Cabinet {
  return {
    ...cabinet,
    sections: cabinet.sections.map((s, i) => (i === sectionIndex ? { ...s, bays: s.bays.map((b, j) => ({ ...b, height: heights[j] ?? null })) } : s)),
  }
}

function proposeHeights(bays: readonly BayLayout[], bayIndex: number, delta: Mm): (Mm | null)[] {
  const requests = bays.map((b) => b.bay.height)
  const target = round(bays[bayIndex]!.height + delta, DECIMALS)
  const hasShared = requests.some((h, j) => h === null && j !== bayIndex)
  if (hasShared) return requests.map((h, j) => (j === bayIndex ? target : h))
  const donor = bayIndex + 1 < bays.length ? bayIndex + 1 : bayIndex - 1
  return bays.map((b, j) => (j === bayIndex ? target : j === donor ? round(b.height - delta, DECIMALS) : b.height))
}

/**
 * Bay heights (for every bay of the section, in order) that make the front of
 * `sectionIndex` / `bayIndex` (0-based) `frontHeight` tall, or why it cannot be.
 */
export function bayHeightsForFront(cabinet: Cabinet, ctx: EngineContext, sectionIndex: number, bayIndex: number, frontHeight: Mm): FrontHeightEdit {
  const section = cabinet.sections[sectionIndex]
  const bay = section?.bays[bayIndex]
  if (!section || !bay) return { ok: false, error: 'There is no such front' }
  if (bay.kind === 'open') return { ok: false, error: 'An open bay has no front' }
  if (section.bays.length < 2) return { ok: false, error: 'This front fills its section; change the cabinet height instead' }
  if (!Number.isFinite(frontHeight) || frontHeight <= 0) return { ok: false, error: 'Enter a positive height' }
  const before = bayLayouts(cabinet, ctx, sectionIndex)
  const current = before?.[bayIndex]
  if (!before || !current) return { ok: false, error: 'The cabinet cannot be laid out; fix its warnings first' }

  const heights = proposeHeights(before, bayIndex, frontHeight - spanSize(current.front.y))
  const after = bayLayouts(withHeights(cabinet, sectionIndex, heights), ctx, sectionIndex)?.[bayIndex]
  if (!after || Math.abs(spanSize(after.front.y) - frontHeight) > TOLERANCE) {
    return { ok: false, error: 'That height does not fit: the other bays in this section need room' }
  }
  return { ok: true, heights }
}
