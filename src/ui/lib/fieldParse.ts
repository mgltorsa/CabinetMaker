import type { Mm, UnitSystem } from '@/core/types'
import { formatLength, parseLength } from '@/core/units'

export type FieldParse<T> = { ok: true; value: T } | { ok: false; error: string }

export interface RangeOptions {
  min?: number
  max?: number
}

function checkRange(value: number, { min, max }: RangeOptions, show: (v: number) => string): FieldParse<number> {
  if (min !== undefined && value < min) return { ok: false, error: `Must be at least ${show(min)}` }
  if (max !== undefined && value > max) return { ok: false, error: `Must be at most ${show(max)}` }
  return { ok: true, value }
}

/** Parse a length typed in project units into mm; never yields NaN. */
export function parseLengthField(text: string, units: UnitSystem, range: RangeOptions = {}): FieldParse<Mm> {
  const mm = parseLength(text, units)
  if (mm === null || !Number.isFinite(mm)) {
    const hint = units === 'metric' ? 'a number of millimetres' : 'inches, e.g. 23 5/8'
    return { ok: false, error: `Enter ${hint}` }
  }
  return checkRange(mm, range, (v) => formatLength(v, units))
}

/** Like `parseLengthField`, but an empty field means "auto" (`null`). */
export function parseOptionalLengthField(text: string, units: UnitSystem, range: RangeOptions = {}): FieldParse<Mm | null> {
  return text.trim() === '' ? { ok: true, value: null } : parseLengthField(text, units, range)
}

export interface NumberOptions extends RangeOptions {
  integer?: boolean
}

export function parseNumberField(text: string, options: NumberOptions = {}): FieldParse<number> {
  const t = text.trim()
  const n = t === '' ? Number.NaN : Number(t)
  if (!Number.isFinite(n)) return { ok: false, error: 'Enter a number' }
  if (options.integer && !Number.isInteger(n)) return { ok: false, error: 'Enter a whole number' }
  return checkRange(n, options, String)
}
