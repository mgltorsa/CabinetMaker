/**
 * CSV export of the cut list (part schedule) and BOM.
 *
 * Output is RFC 4180: comma separated, CRLF line endings (including after the
 * last record), cells quoted when they contain `"`, `,`, CR or LF, quotes
 * doubled. Text cells are user input (cabinet, part, material names, currency
 * code), so cells that a spreadsheet would read as a formula are neutralised
 * with a leading `'` (OWASP "CSV injection").
 */
import type { Bom, BomLine, Estimate, Project } from '@/core/types'
import { formatLength, round } from '@/core/units'
import { fromCents, roundMoney, toCents } from './money'

export type CsvValue = string | number

const CRLF = '\r\n'
/** Leading characters that make Excel / LibreOffice / Sheets evaluate a cell (incl. full-width forms). */
const FORMULA_TRIGGERS: ReadonlySet<string> = new Set(['=', '+', '-', '@', '\t', '\r', '\n', '＝', '＋', '－', '＠'])
const NEEDS_QUOTES = /[",\r\n]/

function neutraliseFormula(text: string): string {
  const first = text.charAt(0)
  return FORMULA_TRIGGERS.has(first) ? `'${text}` : text
}

/**
 * Encode one cell. Numbers are written as-is (they are computed values, so a
 * leading `-` is a sign, not a formula); non-finite numbers become empty.
 * Strings are neutralised against formula injection, then quoted if needed.
 */
export function csvCell(value: CsvValue): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  const safe = neutraliseFormula(value)
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** Encode records; every record ends with CRLF. */
export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',') + CRLF).join('')
}

function lengthUnitLabel(project: Project): string {
  return project.units === 'imperial' ? 'in' : 'mm'
}

/**
 * Cut list CSV: one row per `bom.parts` row, in schedule order. Lengths are in
 * the project's unit system (`formatLength`: mm to 0.1, or fractional inches
 * to 1/16"). Unknown cabinet / material ids are written as the raw id.
 */
export function partsToCsv(bom: Bom, project: Project): string {
  const cabinetNames = new Map(project.cabinets.map((c) => [c.id, c.name]))
  const materialNames = new Map(project.materials.map((m) => [m.id, m.name]))
  const unit = lengthUnitLabel(project)
  const fmt = (mm: number): string => formatLength(mm, project.units)
  const header: CsvValue[] = ['Cabinet', 'Part', 'Material', `Length (${unit})`, `Width (${unit})`, `Thickness (${unit})`, 'Grain', 'Ops']
  const rows = bom.parts.map((r): CsvValue[] => [
    cabinetNames.get(r.cabinetId) ?? r.cabinetId,
    r.name,
    materialNames.get(r.materialId) ?? r.materialId,
    fmt(r.length),
    fmt(r.width),
    fmt(r.thickness),
    r.grain,
    r.opCount,
  ])
  return toCsv([header, ...rows])
}

function money(amount: number): string {
  return roundMoney(amount).toFixed(2)
}

/** Tax rate label precision: `7.5 %`, `7.25 %`. */
const PERCENT_DECIMALS = 2

function lineRow(l: BomLine): CsvValue[] {
  return [l.category, l.description, l.manufacturer ?? '', l.sku ?? '', l.qty, l.unit, money(l.unitCost), money(l.total)]
}

function summaryRow(label: string, amount: number): CsvValue[] {
  return [label, '', '', '', '', '', '', money(amount)]
}

/** Extra charge lines, then the estimate from cost groups through tax to the total. */
function estimateRows(e: Estimate): CsvValue[][] {
  const adjustment = e.minimumChargeAdjustment > 0 ? [summaryRow('Minimum charge adjustment', e.minimumChargeAdjustment)] : []
  return [
    ...e.extras.map(lineRow),
    summaryRow('Materials', e.materialCost),
    summaryRow('Hardware', e.hardwareCost),
    summaryRow('Labor', e.laborCost),
    summaryRow('Extra charges', e.extrasCost),
    summaryRow('Markup', e.markupAmount),
    summaryRow('Subtotal', e.subtotal),
    summaryRow('Margin', e.marginAmount),
    ...adjustment,
    summaryRow('Price (excl. tax)', e.price),
    summaryRow(`Tax (${round(e.taxRate * 100, PERCENT_DECIMALS)} %)`, e.tax),
    summaryRow('Total', e.total),
  ]
}

/**
 * BOM CSV: one row per `bom.lines` row. Money is written as a plain decimal
 * with 2 places (spreadsheet friendly); the currency code goes in the header.
 *
 * Without `estimate` a final `Total` row sums the BOM lines. With `estimate`
 * the extra charge lines follow the BOM lines, then the estimate summary
 * (materials, hardware, labor, extra charges, markup, subtotal, margin, minimum
 * charge adjustment when > 0, price, tax) and a final `Total` row = price + tax.
 */
export function bomToCsv(bom: Bom, currency: string, estimate?: Estimate): string {
  const header: CsvValue[] = ['Category', 'Description', 'Manufacturer', 'SKU', 'Qty', 'Unit', `Unit cost (${currency})`, `Total (${currency})`]
  const rows = bom.lines.map(lineRow)
  if (estimate) return toCsv([header, ...rows, ...estimateRows(estimate)])
  const totalCents = bom.lines.reduce((acc, l) => acc + toCents(l.total), 0)
  return toCsv([header, ...rows, summaryRow('Total', fromCents(totalCents))])
}
