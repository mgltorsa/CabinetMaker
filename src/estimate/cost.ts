/**
 * Cost estimate: materials + hardware (from the BOM lines) + labor, then margin.
 *
 *   subtotal     = materialCost + hardwareCost + laborCost
 *   price        = subtotal / (1 − margin)          (margin on price, not markup)
 *   marginAmount = price − subtotal
 *
 * Every line is rounded to cents once, where it is produced; totals are exact
 * sums in integer cents, so Σ lines = totals and price = subtotal + marginAmount
 * hold to the cent. The margin is clamped to [0, MAX_MARGIN] (see clampMargin).
 */
import type { Bom, BomLine, Estimate, NestResult, Project, ProjectBuild } from '@/core/types'
import { buildLabor } from './labor'
import { fromCents, toCents } from './money'

/**
 * Largest accepted margin. margin ≥ 1 would divide by zero or go negative; a
 * clamped 99 % margin yields an absurd (×100) but finite price that the user
 * will notice and fix.
 */
export const MAX_MARGIN = 0.99

/** Non-finite or negative → 0; ≥ 1 → MAX_MARGIN. */
export function clampMargin(margin: number): number {
  if (!Number.isFinite(margin) || margin < 0) return 0
  return Math.min(margin, MAX_MARGIN)
}

function sumCents(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + toCents(v), 0)
}

function isMaterialLine(line: BomLine): boolean {
  return line.category === 'sheet' || line.category === 'linear'
}

export function estimateCost(project: Project, build: ProjectBuild, nest: NestResult, bom: Bom): Estimate {
  const settings = project.estimate
  const materials = bom.lines.filter(isMaterialLine)
  const hardware = bom.lines.filter((l) => l.category === 'hardware')
  const labor = buildLabor(settings, build, nest)

  const materialCents = sumCents(materials.map((l) => l.total))
  const hardwareCents = sumCents(hardware.map((l) => l.total))
  const laborCents = sumCents(labor.map((l) => l.cost))
  const subtotalCents = materialCents + hardwareCents + laborCents
  const priceCents = toCents(fromCents(subtotalCents) / (1 - clampMargin(settings.margin)))

  return {
    currency: settings.currency,
    materials,
    hardware,
    labor,
    materialCost: fromCents(materialCents),
    hardwareCost: fromCents(hardwareCents),
    laborCost: fromCents(laborCents),
    subtotal: fromCents(subtotalCents),
    marginAmount: fromCents(priceCents - subtotalCents),
    price: fromCents(priceCents),
  }
}
