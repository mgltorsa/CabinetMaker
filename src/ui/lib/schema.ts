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

export function arrayOf<T>(check: Check<T>): Check<T[]> {
  return (v, p) => {
    if (!Array.isArray(v)) return `${p} must be a list`
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
