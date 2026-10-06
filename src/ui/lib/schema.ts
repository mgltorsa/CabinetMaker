/**
 * Tiny runtime validator for untrusted JSON (localStorage, imported files).
 *
 * A `Check<T>` returns `null` when the value is valid or a message naming the
 * first offending path. The phantom `T` lets `obj<T>()` require a check for
 * every key of `T`, so the schema cannot silently drift from the contract.
 */

export interface Check<T> {
  (value: unknown, path: string): string | null
  /** Phantom marker; never set at runtime. */
  readonly _type?: T
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const num: Check<number> = (v, p) => (typeof v === 'number' && Number.isFinite(v) ? null : `${p} must be a finite number`)

export const str: Check<string> = (v, p) => (typeof v === 'string' ? null : `${p} must be a string`)

export const bool: Check<boolean> = (v, p) => (typeof v === 'boolean' ? null : `${p} must be true or false`)

export function oneOf<T extends string | number>(...allowed: readonly T[]): Check<T> {
  return (v, p) => (allowed.some((a) => a === v) ? null : `${p} must be one of ${allowed.join(', ')}`)
}

export function nullable<T>(check: Check<T>): Check<T | null> {
  return (v, p) => (v === null ? null : check(v, p))
}

/** Key may be absent. Typed as `Check<T>` so it fits optional keys under `-?`. */
export function optional<T>(check: Check<T>): Check<T> {
  return (v, p) => (v === undefined ? null : check(v, p))
}

export interface NumberRange {
  min?: number
  max?: number
  /** Exclusive lower bound (e.g. 0 for "must be positive"). */
  above?: number
  below?: number
  integer?: boolean
}

/** Finite number within `range`. */
export function numIn(range: NumberRange): Check<number> {
  return (v, p) => {
    const err = num(v, p)
    if (err) return err
    const n = v as number
    if (range.integer && !Number.isInteger(n)) return `${p} must be a whole number`
    if (range.min !== undefined && n < range.min) return `${p} must be at least ${range.min}`
    if (range.max !== undefined && n > range.max) return `${p} must be at most ${range.max}`
    if (range.above !== undefined && !(n > range.above)) return `${p} must be greater than ${range.above}`
    if (range.below !== undefined && !(n < range.below)) return `${p} must be less than ${range.below}`
    return null
  }
}

/** Number ≥ 0 (and ≤ `max` when given). */
export const nonNegative = (max?: number): Check<number> => numIn({ min: 0, max })

/** Number > 0 (and ≤ `max` when given). */
export const positive = (max?: number): Check<number> => numIn({ above: 0, max })

export interface ListBounds {
  min?: number
  max?: number
}

export function arrayOf<T>(check: Check<T>, bounds: ListBounds = {}): Check<T[]> {
  return (v, p) => {
    if (!Array.isArray(v)) return `${p} must be a list`
    if (bounds.min !== undefined && v.length < bounds.min) return `${p} must have at least ${bounds.min} item(s)`
    if (bounds.max !== undefined && v.length > bounds.max) return `${p} must have at most ${bounds.max} items (got ${v.length})`
    for (let i = 0; i < v.length; i++) {
      const err = check(v[i], `${p}[${i}]`)
      if (err) return err
    }
    return null
  }
}

export function recordOf<T>(check: Check<T>): Check<Record<string, T>> {
  return (v, p) => {
    if (!isRecord(v)) return `${p} must be an object`
    for (const [k, val] of Object.entries(v)) {
      const err = check(val, `${p}.${k}`)
      if (err) return err
    }
    return null
  }
}

export type Shape<T> = { [K in keyof T]-?: Check<T[K]> }

export function obj<T>(shape: Shape<T>): Check<T> {
  const entries = Object.entries(shape) as [string, Check<unknown>][]
  return (v, p) => {
    if (!isRecord(v)) return `${p} must be an object`
    for (const [key, check] of entries) {
      const err = check(v[key], `${p}.${key}`)
      if (err) return err
    }
    return null
  }
}

/**
 * Run `check`, then a cross-field rule on the (now well-shaped) value. `rule`
 * returns `null` or a message naming the path of the problem.
 */
export function refine<T>(check: Check<T>, rule: (value: T, path: string) => string | null): Check<T> {
  return (v, p) => check(v, p) ?? rule(v as T, p)
}

/** First repeated `id` among `items`, as a message naming its path. */
export function duplicateId(items: readonly { id: string }[], path: (index: number) => string): string | null {
  const seen = new Set<string>()
  for (const [i, item] of items.entries()) {
    if (seen.has(item.id)) return `${path(i)}.id duplicates "${item.id}"; ids must be unique`
    seen.add(item.id)
  }
  return null
}

/** List whose items have unique `id`s. */
export function uniqueList<T extends { id: string }>(check: Check<T>, bounds: ListBounds = {}): Check<T[]> {
  return refine(arrayOf(check, bounds), (items, p) => duplicateId(items, (i) => `${p}[${i}]`))
}
