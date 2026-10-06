import type { Mm, ModelUnit, UnitSystem } from './types'

export const MM_PER_INCH = 25.4

/** Millimetres per unit of an imported model file (models, custom handles). */
export const MM_PER_MODEL_UNIT: Readonly<Record<ModelUnit, number>> = { m: 1000, cm: 10, mm: 1, in: MM_PER_INCH }

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
  const total = Math.round(Math.abs(inches) * denominator)
  if (total === 0) return '0"' // never "-0"
  const sign = inches < 0 ? '-' : ''
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

/** Millimetres per unit for explicit unit suffixes. */
const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: MM_PER_INCH, '"': MM_PER_INCH, ft: 12 * MM_PER_INCH, "'": 12 * MM_PER_INCH }

const NUMBER = String.raw`(?:\d+(?:\.\d*)?|\.\d+)`
/** `600`, `600mm`, `60 cm`, `1.2m`, `-5` (a decimal comma is accepted). */
const METRIC_RE = new RegExp(`^([+-]?${NUMBER})\\s*(mm|cm|m)?$`)
/** Optional feet, then whole / decimal inches and/or a fraction: `2' 6 1/2"`, `23-5/8`, `.5in`. */
const IMPERIAL_RE = new RegExp(`^(?:(${NUMBER})\\s*(?:'|ft)\\s*-?\\s*)?(?:(${NUMBER})(?:\\s*-\\s*|\\s+)?)?(?:(\\d+)\\/(\\d+))?\\s*(?:"|in)?$`)

/**
 * Parse user input into mm. Accepts the project's units by default and any
 * explicit unit: metric `600`, `600 mm`, `60cm`, `1,5`; imperial `23 5/8`,
 * `23-5/8"`, `.5`, `24in`, `2' 6"`. Returns `null` when the text is not a
 * valid length.
 */
export function parseLength(text: string, units: UnitSystem): Mm | null {
  const t = text.trim().toLowerCase().replace(/[″”]/g, '"').replace(/[′’]/g, "'")
  if (t === '') return null
  // Decimal comma ("1,5") when there is no decimal point.
  const normalized = t.includes('.') ? t : t.replace(/^([+-]?\d+),(\d+)/, '$1.$2')

  const metric = METRIC_RE.exec(normalized)
  if (metric && (metric[2] !== undefined || units === 'metric')) {
    const value = Number(metric[1])
    return Number.isFinite(value) ? value * (MM_PER_UNIT[metric[2] ?? 'mm'] ?? 1) : null
  }

  const imperial = IMPERIAL_RE.exec(normalized)
  const hasImperialMark = /['"]|in$|ft/.test(normalized) || normalized.includes('/')
  if (!imperial || (units === 'metric' && !hasImperialMark)) return null
  const [, feet, inches, num, den] = imperial
  if (feet === undefined && inches === undefined && num === undefined) return null
  if (den !== undefined && Number(den) === 0) return null
  const total = (feet !== undefined ? Number(feet) * 12 : 0) + (inches !== undefined ? Number(inches) : 0) + (num !== undefined && den !== undefined ? Number(num) / Number(den) : 0)
  return Number.isFinite(total) ? inchesToMm(total) : null
}
