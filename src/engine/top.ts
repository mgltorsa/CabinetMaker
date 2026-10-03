/**
 * Separate top on the carcass (`cabinet.top`): a finished top (defaults to the
 * front material) or a countertop. Overhangs are measured from the cabinet
 * sides and from the face of the fronts (or face frame / carcass when there
 * are no fronts). Part thickness always comes from the material; a countertop
 * with no material is supplied separately and only reported.
 */
import { emptyResult, findMaterial, materialRef, warning, type BuildContext, type RuleResult } from './context'
import { box, makePart } from './geometry'

export function buildTop(ctx: BuildContext, frontFaceZ: number): RuleResult {
  const { cabinet, dims: d, materials, mats } = ctx
  const top = cabinet.top
  if (top.kind === 'none') return emptyResult()
  const warn = (level: 'info' | 'warn', code: string, message: string): RuleResult => ({ ...emptyResult(), warnings: [warning(cabinet.id, level, code, message)] })
  if (top.kind === 'countertop' && top.materialId === null) {
    return warn('info', 'countertop-external', 'Countertop has no material: it is supplied separately and not in the cut list')
  }
  const material = top.materialId === null ? undefined : findMaterial(materials, top.materialId)
  if (top.materialId !== null && !material) return warn('warn', 'unknown-material', `Unknown top material ${top.materialId}; top omitted`)
  const ref = material ? materialRef(material) : mats.front
  const os = Math.max(0, top.overhangSides)
  const of = Math.max(0, top.overhangFront)
  const role = top.kind === 'countertop' ? 'countertop' : 'finished-top'
  const part = makePart({
    cabinetId: cabinet.id,
    role,
    name: top.kind === 'countertop' ? 'Countertop' : 'Finished top',
    group: 'top',
    materialId: ref.id,
    grain: ref.grain,
    bounds: box(-os, d.W + os, d.yT, d.yT + ref.thickness, 0, frontFaceZ + of),
    length: '+x',
    faceA: '-y',
  })
  const result = { ...emptyResult(), parts: [part] }
  if (Math.abs(ref.thickness - top.thickness) > 0.01) {
    return { ...result, warnings: [warning(cabinet.id, 'info', 'top-thickness', `Top uses the ${ref.thickness} mm material thickness, not ${top.thickness} mm`, part.id)] }
  }
  return result
}
