import { describe, expect, it } from 'vitest'
import type { Material, NestSettings } from '@/core/types'
import { nestParts, validateNest } from '.'
import { makeLinearMaterial, makeSheetMaterial, pick, randomInt, randomParts, seededRandom } from './test-utils'

const MATERIALS: Material[] = [
  makeSheetMaterial({ id: 'ply', sheetLength: 2440, sheetWidth: 1220, grained: true }),
  makeSheetMaterial({ id: 'mdf', sheetLength: 2440, sheetWidth: 1220, grained: false }),
  makeSheetMaterial({ id: 'bb', sheetLength: 1525, sheetWidth: 1525, grained: true, thickness: 12 }),
  makeLinearMaterial({ id: 'maple' }),
]
const MATERIAL_IDS = ['ply', 'ply', 'mdf', 'bb', 'maple', 'missing'] as const
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1)

function randomSettings(rng: () => number): NestSettings {
  return {
    kerf: pick(rng, [0, 3.175, 6.35, 8]),
    edgeTrim: pick(rng, [0, 5, 10, 25]),
    partSpacing: pick(rng, [0, 1, 4]),
    ignoreGrain: rng() < 0.25,
  }
}

describe('nestParts property sweep', () => {
  it.each(SEEDS)('produces a valid nest for random input (seed %i)', (seed) => {
    const rng = seededRandom(seed)
    const parts = randomParts(rng, {
      count: randomInt(rng, 1, 80),
      materialIds: MATERIAL_IDS,
      maxLength: pick(rng, [600, 1300, 2600]),
      maxWidth: pick(rng, [300, 800, 1300]),
    })
    const settings = randomSettings(rng)

    const result = nestParts(parts, MATERIALS, settings)

    expect(validateNest(result, parts, MATERIALS, settings)).toEqual([])
    for (const summary of result.summary) {
      const material = MATERIALS.find((m) => m.id === summary.materialId)
      if (material?.kind !== 'sheet') throw new Error('summary for non-sheet material')
      const usable = (material.sheetLength - 2 * settings.edgeTrim) * (material.sheetWidth - 2 * settings.edgeTrim)
      const placedArea = result.sheets
        .filter((s) => s.materialId === summary.materialId)
        .reduce((sum, s) => sum + s.yield * s.length * s.width, 0)
      // Area lower bound: never use fewer sheets than the parts physically need.
      expect(summary.sheetCount).toBeGreaterThanOrEqual(Math.ceil(placedArea / usable - 1e-9))
    }
  })
})
