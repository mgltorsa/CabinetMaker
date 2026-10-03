/**
 * Face frame from linear stock: full-height stiles at the cabinet edges,
 * top and bottom rails between them, mid-stiles in front of the dividers and
 * mid-rails between bays. The frame covers the carcass front from the bottom
 * underside to the top (z = depth … depth + stock thickness). Face A is the
 * back face (pocket screws go there); no ops are generated.
 */
import type { SignedAxis } from '@/core/types'
import { emptyResult, warning, type BuildContext, type RuleResult } from './context'
import { boxOf, makePart, span, type FramedPart, type Span } from './geometry'

export function buildFaceFrame(ctx: BuildContext): RuleResult {
  const { cabinet, dims: d, mats, layout } = ctx
  const ffMat = mats.faceFrame
  if (!d.faceFrame || !ffMat) return emptyResult()
  const { stileWidth: sw, railWidth: rw } = cabinet.construction.faceFrame
  const z = span(d.D, d.D + d.fft)
  const make = (role: string, name: string, x: Span, y: Span, length: SignedAxis): FramedPart =>
    makePart({ cabinetId: cabinet.id, role, name, group: 'face-frame', materialId: ffMat.id, grain: ffMat.grain, bounds: boxOf(x, y, z), length, faceA: '-z' })

  const fullY = span(d.yB, d.yT)
  const railX = span(sw, d.W - sw)
  const innerY = span(d.yB + rw, d.yT - rw)
  const parts = [
    make('ff-stile-left', 'Left stile', span(0, sw), fullY, '+y'),
    make('ff-stile-right', 'Right stile', span(d.W - sw, d.W), fullY, '+y'),
    make('ff-rail-top', 'Top rail', railX, span(d.yT - rw, d.yT), '+x'),
    make('ff-rail-bottom', 'Bottom rail', railX, span(d.yB, d.yB + rw), '+x'),
    ...layout.midStiles.map((x, i) => make(`ff-mid-stile-${i + 1}`, `Mid stile ${i + 1}`, x, innerY, '+y')),
    ...layout.sections.flatMap((s) => s.midRails.map((y, k) => make(`ff-mid-rail-${s.index + 1}-${k + 1}`, `Mid rail ${s.index + 1}.${k + 1}`, s.openingX, y, '+x'))),
  ]
  const warnings = Math.max(sw, rw) > ffMat.stockWidth ? [warning(cabinet.id, 'warn', 'face-frame-stock-narrow', `Face-frame members are wider than the ${ffMat.stockWidth} mm stock`)] : []
  return { ...emptyResult(), parts, warnings }
}
