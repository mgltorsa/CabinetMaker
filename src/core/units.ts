import type { Mm, UnitSystem } from './types'

export const MM_PER_INCH = 25.4

export function inchesToMm(inches: number): Mm {
  return inches * MM_PER_INCH
}

export function mmToInches(mm: Mm): number {
  return mm / MM_PER_INCH
}

/** Round to a fixed number of decimals, avoiding `-0`. */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals
  const r = Math.round(value * f) / f
  return Object.is(r, -0) ? 0 : r
}

/** Greatest common divisor for fraction reduction. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Format inches as a mixed fraction to the nearest 1/`denominator`, e.g. `23 5/8"`. */
export function formatFractionalInches(inches: number, denominator = 16): string {
  const sign = inches < 0 ? '-' : ''
  const total = Math.round(Math.abs(inches) * denominator)
  const whole = Math.floor(total / denominator)
  const num = total % denominator
  if (num === 0) return `${sign}${whole}"`
  const g = gcd(num, denominator)
  const frac = `${num / g}/${denominator / g}`
  return whole === 0 ? `${sign}${frac}"` : `${sign}${whole} ${frac}"`
}

/** Format a length for display in the project's unit system. */
export function formatLength(mm: Mm, units: UnitSystem): string {
  if (units === 'imperial') return formatFractionalInches(mmToInches(mm))
  return `${round(mm, 1)}`
}

/**
 * Parse user input into mm. Metric: plain number (mm). Imperial: inches with
 * optional fraction (`23 5/8`, `23-5/8`, `5/8`, `23.625`, trailing `"` allowed).
 * Returns `null` when the text is not a valid length.
 */
export function parseLength(text: string, units: UnitSystem): Mm | null {
  const t = text.trim().replace(/"$/, '').trim()
  if (t === '') return null
  if (units === 'metric') {
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  const m = /^(\d+(?:\.\d+)?)?(?:[\s-]+)?(?:(\d+)\/(\d+))?$/.exec(t)
  if (!m || (m[1] === undefined && m[2] === undefined)) return null
  const whole = m[1] !== undefined ? Number(m[1]) : 0
  const frac = m[2] !== undefined && m[3] !== undefined ? Number(m[2]) / Number(m[3]) : 0
  if (m[3] !== undefined && Number(m[3]) === 0) return null
  return inchesToMm(whole + frac)
}
