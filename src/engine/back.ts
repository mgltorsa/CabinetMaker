/**
 * Back panel. Captured: sits `back.inset` from the rear edge in grooves
 * (`grooveDepth`) cut in the sides, bottom and top (or rear stretcher).
 * Applied: covers the carcass rear edges; carcass panels start in front of it.
 * Face A faces the cabinet front.
 */
import { mergeResults, emptyResult, type BuildContext, type RuleResult } from './context'
import type { Carcass } from './carcass'
import { boxOf, makePart, span } from './geometry'
import { jointOps, type Fasteners } from './joinery'

export function buildBack(ctx: BuildContext, carcass: Carcass, fasteners: Fasteners): RuleResult {
  const { cabinet, dims: d, mats } = ctx
  const captured = cabinet.construction.back.construction === 'captured'
  const g = d.groove
  const x = captured ? span(d.interiorX.lo - g, d.interiorX.hi + g) : d.carcassX
  const y = captured ? span(d.interiorY.lo - g, d.interiorY.hi + g) : span(d.sideY0, d.yT)
  const back = makePart({
    cabinetId: cabinet.id,
    role: 'back',
    name: 'Back',
    group: 'back',
    materialId: mats.back.id,
    grain: mats.back.grain,
    bounds: boxOf(x, y, d.back),
    length: '+y',
    faceA: '+z',
  })
  if (!captured) return { ...emptyResult(), parts: [back] }
  const groove = (receiver: typeof back, normal: '+x' | '-x' | '+y' | '-y', along: 'x' | 'y') =>
    jointOps({ receiver, inserted: back, normal, along, method: 'dado', purpose: 'back-groove' }, fasteners)
  const grooves = [
    groove(carcass.sideLeft, '+x', 'y'),
    groove(carcass.sideRight, '-x', 'y'),
    groove(carcass.bottom, '+y', 'x'),
    ...carcass.topMembers.map((t) => groove(t, '-y', 'x')),
  ]
  return mergeResults({ ...emptyResult(), parts: [back] }, { ...emptyResult(), ops: grooves.flatMap((r) => r.ops) })
}
