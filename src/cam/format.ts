/** Number and comment formatting for G-code and human-readable messages. */
import { OUTPUT_DECIMALS } from './geometry'

/** Up to 3 decimals, no trailing zeros, never `-0` or exponent notation. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Cannot format non-finite number ${value}`)
  const fixed = value.toFixed(OUTPUT_DECIMALS)
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  return trimmed === '-0' ? '0' : trimmed
}

/** Like `formatNumber`, but prints non-finite values (for warning messages about bad input). */
export function formatForMessage(value: number): string {
  return Number.isFinite(value) ? formatNumber(value) : String(value)
}

const ASCII_REPLACEMENTS: Readonly<Record<string, string>> = {
  '×': 'x',
  '—': '-',
  '–': '-',
  '°': 'deg',
  Ø: 'D',
  '″': '"',
  '’': "'",
}

/**
 * Make text safe inside a `( … )` G-code comment: printable ASCII only (some
 * controllers choke on UTF-8), no parentheses (they would end the comment)
 * and no line breaks (they would start a new block).
 */
export function sanitizeComment(text: string): string {
  return Array.from(text)
    .map((ch) => ASCII_REPLACEMENTS[ch] ?? ch)
    .join('')
    .replace(/\(/g, '[')
    .replace(/\)/g, ']')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?')
    .trim()
}
