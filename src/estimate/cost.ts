/**
 * Cost estimate: materials + hardware (from the BOM lines) + labor + extra
 * charges, plus markups, then margin, minimum charge and tax.
 *
 *   markupAmount = materialCost × materialMarkup + hardwareCost × hardwareMarkup
 *   subtotal     = materialCost + hardwareCost + laborCost + extrasCost + markupAmount
 *   price        = max(subtotal / (1 − margin), minimumCharge)   (margin on price, not markup)
 *   marginAmount = subtotal / (1 − margin) − subtotal
 *   minimumChargeAdjustment = price − subtotal − marginAmount
 *   tax          = price × taxRate
 *   total        = price + tax
 *
 * Every line is rounded to cents once, where it is produced (BOM, labor and
 * extra lines; each markup amount; the margined price; the tax); totals are
 * exact sums in integer cents, so Σ lines = totals, price = subtotal +
 * marginAmount + minimumChargeAdjustment and total = price + tax hold to the
 * cent. The margin is clamped to [0, MAX_MARGIN] (see clampMargin); markups,
 * tax rate, minimum charge and extras that are negative, non-finite or absent
 * (projects saved before they existed) count as 0.
 */
import type { Bom, BomLine, Estimate, NestResult, Project, ProjectBuild } from '@/core/types'
import { extraLines } from './extras'
import { buildLabor } from './labor'
import { fromCents, toCents } from './money'
import { nonNegative } from './settings'

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

/** Optional commercial setting: absent, negative or non-finite → 0. */
function optionalAmount(value: number | undefined): number {
  return nonNegative(value ?? 0)
}

function sumCents(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + toCents(v), 0)
}

/** `cents × factor`, rounded to cents. */
function scaleCents(cents: number, factor: number): number {
  return toCents(fromCents(cents) * factor)
}

function isMaterialLine(line: BomLine): boolean {
  return line.category === 'sheet' || line.category === 'linear'
}

export function estimateCost(project: Project, build: ProjectBuild, nest: NestResult, bom: Bom): Estimate {
  const settings = project.estimate
  const materials = bom.lines.filter(isMaterialLine)
  const hardware = bom.lines.filter((l) => l.category === 'hardware')
  const labor = buildLabor(settings, build, nest)
  const extras = extraLines(settings.extras)
  const taxRate = optionalAmount(settings.taxRate)

  const materialCents = sumCents(materials.map((l) => l.total))
  const hardwareCents = sumCents(hardware.map((l) => l.total))
  const laborCents = sumCents(labor.map((l) => l.cost))
  const extrasCents = sumCents(extras.map((l) => l.total))
  const materialMarkupCents = scaleCents(materialCents, optionalAmount(settings.materialMarkup))
  const hardwareMarkupCents = scaleCents(hardwareCents, optionalAmount(settings.hardwareMarkup))
  const markupCents = materialMarkupCents + hardwareMarkupCents
  const subtotalCents = materialCents + hardwareCents + laborCents + extrasCents + markupCents
  const marginedCents = toCents(fromCents(subtotalCents) / (1 - clampMargin(settings.margin)))
  const priceCents = Math.max(marginedCents, toCents(optionalAmount(settings.minimumCharge)))
  const taxCents = scaleCents(priceCents, taxRate)

  return {
    currency: settings.currency,
    materials,
    hardware,
    labor,
    materialCost: fromCents(materialCents),
    hardwareCost: fromCents(hardwareCents),
    laborCost: fromCents(laborCents),
    subtotal: fromCents(subtotalCents),
    marginAmount: fromCents(marginedCents - subtotalCents),
    price: fromCents(priceCents),
    extras,
    extrasCost: fromCents(extrasCents),
    materialMarkupAmount: fromCents(materialMarkupCents),
    hardwareMarkupAmount: fromCents(hardwareMarkupCents),
    markupAmount: fromCents(markupCents),
    minimumChargeAdjustment: fromCents(priceCents - marginedCents),
    taxRate,
    tax: fromCents(taxCents),
    total: fromCents(priceCents + taxCents),
  }
}
