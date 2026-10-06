/**
 * Money helpers. Amounts are plain numbers in the project currency; every
 * money value the estimate module outputs is rounded to cents (2 decimals) and
 * sums are taken in integer cents so totals equal the sum of their lines.
 */

const CENTS_PER_UNIT = 100
/** Significant digits kept before rounding, to strip binary noise like 1.005 × 100 = 100.4999…. */
const NOISE_PRECISION = 12
const DEFAULT_LOCALE = 'en-US'
const NON_FINITE_TEXT = '—'

/** Amount → integer cents, half away from zero. Non-finite amounts count as 0. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  const scaled = Number.parseFloat((Math.abs(amount) * CENTS_PER_UNIT).toPrecision(NOISE_PRECISION))
  const cents = Math.round(scaled)
  return cents === 0 ? 0 : Math.sign(amount) * cents
}

export function fromCents(cents: number): number {
  return cents / CENTS_PER_UNIT
}

/** Round an amount to cents. */
export function roundMoney(amount: number): number {
  return fromCents(toCents(amount))
}

/** Sum amounts exactly in cents. */
export function sumMoney(amounts: readonly number[]): number {
  return fromCents(amounts.reduce((acc, a) => acc + toCents(a), 0))
}

/**
 * Format an amount for display, e.g. `formatMoney(1234.5, 'USD')` → `$1,234.50`.
 * Falls back to `1234.50 CODE` when the currency code or locale is rejected by
 * `Intl` (currency codes are user settings), and to the bare amount when the
 * code is empty. Non-finite amounts render as an em dash.
 */
export function formatMoney(amount: number, currency: string, locale: string = DEFAULT_LOCALE): string {
  if (!Number.isFinite(amount)) return NON_FINITE_TEXT
  const code = currency.trim()
  const plain = roundMoney(amount).toFixed(2)
  if (code === '') return plain
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(amount)
  } catch (error: unknown) {
    if (error instanceof RangeError) return `${plain} ${code}`
    throw error
  }
}
