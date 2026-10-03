import { describe, expect, it } from 'vitest'
import { DEFAULT_MATERIALS, DEFAULT_NEST } from '@/core/defaults'
import { nestParts, validateNest } from '.'
import { randomParts, seededRandom } from './test-utils'

/**
 * Target is "300 parts well under 500 ms" (typically well under 100 ms locally).
 * The assertion is deliberately loose so a slow, shared CI runner does not
 * flake; a real regression (e.g. quadratic pruning) blows far past it.
 */
const BUDGET_MS = 1500

describe('nestParts performance', () => {
  it('nests 300 parts within budget', () => {
    const parts = randomParts(seededRandom(300), {
      count: 300,
      materialIds: ['ply-18', 'ply-18', 'ply-18', 'mdf-18', 'ply-6'],
      maxLength: 1200,
      maxWidth: 600,
    })
    nestParts(parts.slice(0, 20), DEFAULT_MATERIALS, DEFAULT_NEST) // warm-up (JIT)

    const start = performance.now()
    const result = nestParts(parts, DEFAULT_MATERIALS, DEFAULT_NEST)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(BUDGET_MS)
    expect(result.unplaced).toEqual([])
    expect(validateNest(result, parts, DEFAULT_MATERIALS, DEFAULT_NEST)).toEqual([])
  })
})
