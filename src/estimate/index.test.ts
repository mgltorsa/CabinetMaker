import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { bomToCsv, buildBom, estimateCost, formatMoney, partsToCsv } from '.'
import { makeBuild, makeNest, makePart, usage } from './test-fixtures'

describe('estimate public API', () => {
  it('runs BOM → estimate → CSV end to end on a hand-built job', () => {
    const project = fixtureProject()
    const build = makeBuild([makePart({ id: 'cab_1:side-left', name: 'Side left' })], [usage('pin-5', 4)])
    const nest = makeNest([{ materialId: 'ply-18', partIds: ['cab_1:side-left'] }])

    const bom = buildBom(project, build, nest)
    const estimate = estimateCost(project, build, nest, bom)

    expect(estimate.materialCost).toBe(85)
    expect(estimate.hardwareCost).toBe(0.6)
    expect(estimate.price).toBeGreaterThan(estimate.subtotal)
    expect(partsToCsv(bom, project)).toContain('Base cabinet,Side left,18 mm plywood,500,300,18,length,0')
    expect(bomToCsv(bom, estimate.currency)).toContain('Total,,,,,,,85.60')
    expect(formatMoney(estimate.price, estimate.currency)).toMatch(/^\$\d/)
  })
})
