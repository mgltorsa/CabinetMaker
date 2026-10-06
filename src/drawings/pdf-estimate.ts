/**
 * Rows of the plan book's estimate summary page: detail groups (labor
 * buckets, extra charges) on the left, totals from cost groups through tax to
 * the grand total on the right. Pure: amounts are pre-formatted strings, the
 * renderer only places them.
 */
import type { BomLine, Estimate } from '@/core/types'
import { round } from '@/core/units'
import { sumMoney } from '@/estimate'
import { money } from './pdf-plan'

export interface SummaryRow {
  label: string
  amount: string
  isBold?: boolean
}

export interface DetailGroup {
  heading: string
  rows: SummaryRow[]
}

/** Extra charge rows that fit the left column; the rest are folded into one row. */
export const MAX_PDF_EXTRA_ROWS = 12
const PERCENT_DECIMALS = 2

function extraRow(line: BomLine, currency: string): SummaryRow {
  return { label: `${line.description} (${line.qty} ${line.unit} x ${money(line.unitCost, currency)})`, amount: money(line.total, currency) }
}

function extraRows(extras: readonly BomLine[], currency: string): SummaryRow[] {
  if (extras.length <= MAX_PDF_EXTRA_ROWS) return extras.map((l) => extraRow(l, currency))
  const shown = extras.slice(0, MAX_PDF_EXTRA_ROWS - 1)
  const rest = extras.slice(MAX_PDF_EXTRA_ROWS - 1)
  const folded: SummaryRow = { label: `${rest.length} more extra charges`, amount: money(sumMoney(rest.map((l) => l.total)), currency) }
  return [...shown.map((l) => extraRow(l, currency)), folded]
}

export function estimateDetailGroups(est: Estimate): DetailGroup[] {
  const cur = est.currency
  const labor: DetailGroup = {
    heading: 'Labor',
    rows: est.labor.map((line) => ({ label: `${line.bucket} (${Math.round(line.minutes)} min)`, amount: money(line.cost, cur) })),
  }
  return est.extras.length > 0 ? [labor, { heading: 'Extra charges', rows: extraRows(est.extras, cur) }] : [labor]
}

/** Totals column. Extras, markup and minimum charge rows appear only when non-zero. */
export function estimateTotalRows(est: Estimate): SummaryRow[] {
  const cur = est.currency
  const row = (label: string, amount: number, isBold = false): SummaryRow => ({ label, amount: money(amount, cur), isBold })
  const optional = (label: string, amount: number): SummaryRow[] => (amount > 0 ? [row(label, amount)] : [])
  return [
    row('Materials', est.materialCost),
    row('Hardware', est.hardwareCost),
    row('Labor', est.laborCost),
    ...optional('Extra charges', est.extrasCost),
    ...optional('Markup', est.markupAmount),
    row('Subtotal', est.subtotal, true),
    row('Margin', est.marginAmount),
    ...optional('Minimum charge adjustment', est.minimumChargeAdjustment),
    row('Price (excl. tax)', est.price, true),
    row(`Tax (${round(est.taxRate * 100, PERCENT_DECIMALS)} %)`, est.tax),
    row('Total', est.total, true),
  ]
}
