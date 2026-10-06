import { describe, expect, it } from 'vitest'
import { DEFAULT_ROD_MATERIAL_ID } from '@/core/defaults'
import { fixtureProject } from '@/core/fixtures'
import { createPreset } from '@/engine/presets'
import { runPipeline } from '.'

describe('wardrobe through the pipeline', () => {
  const project = fixtureProject()
  project.cabinets = [{ ...createPreset('wardrobe'), id: 'cab_w' }]
  const { build, nest, bom, estimate } = runPipeline(project)
  const rod = build.parts.find((p) => p.group === 'rod')!

  it('keeps the rod out of the sheet nest (linear stock)', () => {
    expect(rod).toBeDefined()
    expect(nest.linearPartIds).toContain(rod.id)
    expect(nest.sheets.flatMap((s) => s.placements.map((p) => p.partId))).not.toContain(rod.id)
  })

  it('lists the rod in the cut list and bills metres of rod plus its supports', () => {
    expect(bom.parts.find((r) => r.partId === rod.id)).toMatchObject({ name: 'Rod 1.1', length: rod.length, materialId: DEFAULT_ROD_MATERIAL_ID })
    expect(estimate.materials.find((l) => l.refId === DEFAULT_ROD_MATERIAL_ID)).toMatchObject({ unit: 'm' })
    expect(estimate.hardware.find((l) => l.refId === 'rod-end-25')).toMatchObject({ qty: 2 })
  })
})
