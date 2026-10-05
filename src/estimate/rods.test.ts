import { describe, expect, it } from 'vitest'
import { createProject, DEFAULT_ROD_MATERIAL_ID } from '@/core/defaults'
import { buildBom } from './bom'
import { estimateCost } from './cost'
import { makeBuild, makeNest, makePart, usage } from './test-fixtures'

/** A 958 mm Ø25 rod (linear stock, not nested) with its two end supports. */
function rodCase() {
  const project = createProject()
  const rod = makePart({ id: 'cab_1:rod-1-1', name: 'Rod 1.1', group: 'rod', materialId: DEFAULT_ROD_MATERIAL_ID, length: 958, width: 25, thickness: 25, grain: 'none' })
  const side = makePart({ id: 'cab_1:side-left', name: 'Side left', group: 'carcass' })
  const build = makeBuild([rod, side], [usage('rod-end-25', 2)])
  const nest = makeNest([{ materialId: 'ply-18', partIds: [side.id] }], [rod.id])
  return { project, build, nest }
}

describe('hanging rods in the BOM and estimate', () => {
  it('bills the rod by the metre with waste, from 3 m lengths', () => {
    const { project, build, nest } = rodCase()
    const line = buildBom(project, build, nest).lines.find((l) => l.refId === DEFAULT_ROD_MATERIAL_ID)
    // 958 mm × 1.15 waste = 1.1017 m → 1.102 m at 6 / m.
    expect(line).toMatchObject({ category: 'linear', unit: 'm', qty: 1.102, unitCost: 6, total: 6.61 })
    expect(line!.description).toBe('Wardrobe rod Ø25 chrome: 0.958 m net + 15% waste, 1 × 3000 mm board')
  })

  it('bills the end supports as hardware', () => {
    const { project, build, nest } = rodCase()
    const line = buildBom(project, build, nest).lines.find((l) => l.refId === 'rod-end-25')
    expect(line).toMatchObject({ category: 'hardware', qty: 2, unit: 'pcs', unitCost: 1.2, total: 2.4, sku: 'ROD-END-25' })
  })

  it('lists rods last in the cut list and counts them in the estimate totals', () => {
    const { project, build, nest } = rodCase()
    const bom = buildBom(project, build, nest)
    expect(bom.parts.map((r) => r.name)).toEqual(['Side left', 'Rod 1.1'])
    const estimate = estimateCost(project, build, nest, bom)
    expect(estimate.materials.map((l) => l.refId)).toContain(DEFAULT_ROD_MATERIAL_ID)
    expect(estimate.hardware.map((l) => l.refId)).toEqual(['rod-end-25'])
    expect(estimate.hardwareCost).toBe(2.4)
  })
})
