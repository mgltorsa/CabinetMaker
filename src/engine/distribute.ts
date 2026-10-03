import type { Mm } from '@/core/types'

export type DistributionStatus = 'ok' | 'scaled' | 'impossible'

export interface Distribution {
  sizes: Mm[]
  status: DistributionStatus
}

const EPS = 0.01

/**
 * Split `available` between slots. Fixed requests are honoured, `null`
 * requests share what is left equally. When fixed requests do not fit (or do
 * not fill the space and nothing can absorb the rest) the excess above
 * `minSize` is scaled proportionally and the status is `scaled`.
 */
export function distribute(requests: readonly (Mm | null)[], available: Mm, minSize: Mm): Distribution {
  const n = requests.length
  if (n === 0) return { sizes: [], status: 'ok' }
  if (available < n * minSize - EPS) return { sizes: requests.map(() => available / n), status: 'impossible' }

  const clamped = requests.map((r) => (r === null ? null : Math.max(r, minSize)))
  const belowMin = requests.some((r) => r !== null && r < minSize)
  const nullCount = clamped.filter((r) => r === null).length
  const fixedSum = clamped.reduce<number>((s, r) => s + (r ?? 0), 0)
  const remaining = available - fixedSum

  if (nullCount > 0 && remaining >= nullCount * minSize - EPS) {
    const share = remaining / nullCount
    return { sizes: clamped.map((r) => r ?? share), status: belowMin ? 'scaled' : 'ok' }
  }
  if (nullCount === 0 && Math.abs(remaining) <= EPS) {
    return { sizes: clamped.map((r) => r ?? 0), status: belowMin ? 'scaled' : 'ok' }
  }
  return { sizes: scaleExcess(clamped, available, minSize), status: 'scaled' }
}

/** Keep every slot at `minSize` plus a proportional share of the excess. */
function scaleExcess(clamped: readonly (Mm | null)[], available: Mm, minSize: Mm): Mm[] {
  const fixedExcess = clamped.reduce<number>((s, r) => s + (r === null ? 0 : r - minSize), 0)
  const spare = available - clamped.length * minSize
  if (fixedExcess <= EPS) {
    // Nothing to scale against: spread the spare space over every slot.
    return clamped.map(() => minSize + spare / clamped.length)
  }
  // Null slots stay at the minimum: the fixed requests already claim all the spare space.
  const factor = spare / fixedExcess
  return clamped.map((r) => (r === null ? minSize : minSize + (r - minSize) * factor))
}
