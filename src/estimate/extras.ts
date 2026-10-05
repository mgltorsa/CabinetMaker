/**
 * User-defined extra charges (finishing, delivery, installation, design fee…)
 * as estimate lines. Each line total is qty × unitCost rounded to cents once,
 * here; negative or non-finite quantities and costs count as 0. Lines keep the
 * order of `EstimateSettings.extras`.
 */
import type { BomLine, ExtraCharge } from '@/core/types'
import { roundMoney } from './money'
import { nonNegative } from './settings'

export function extraLine(extra: ExtraCharge): BomLine {
  const qty = nonNegative(extra.qty)
  const unitCost = nonNegative(extra.unitCost)
  return { category: 'extra', refId: extra.id, description: extra.label, qty, unit: extra.unit, unitCost, total: roundMoney(qty * unitCost) }
}

/** Absent extras (projects saved before they existed) yield no lines. */
export function extraLines(extras: readonly ExtraCharge[] | undefined): BomLine[] {
  return (extras ?? []).map(extraLine)
}
