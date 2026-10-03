import { describe, expect, it } from 'vitest'
import { formatForMessage, formatNumber, sanitizeComment } from './format'

describe('formatNumber', () => {
  it('writes up to 3 decimals with no trailing zeros', () => {
    expect(formatNumber(10)).toBe('10')
    expect(formatNumber(6.35)).toBe('6.35')
    expect(formatNumber(-18.3)).toBe('-18.3')
    expect(formatNumber(1.23456)).toBe('1.235')
    expect(formatNumber(2.5e-7)).toBe('0')
    expect(formatNumber(-0.0001)).toBe('0')
    expect(formatNumber(1e7)).toBe('10000000')
  })

  it('refuses non-finite numbers', () => {
    expect(() => formatNumber(Number.NaN)).toThrow(/non-finite/)
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(/non-finite/)
  })
})

describe('formatForMessage', () => {
  it('formats like formatNumber but prints non-finite values', () => {
    expect(formatForMessage(6.3500001)).toBe('6.35')
    expect(formatForMessage(Number.NaN)).toBe('NaN')
  })
})

describe('sanitizeComment', () => {
  it('keeps comments to one line of printable ASCII without parentheses', () => {
    expect(sanitizeComment('Maple 19 × 63 mm (face frames)\nM30')).toBe('Maple 19 x 63 mm [face frames] M30')
    expect(sanitizeComment('PREVIEW — simulate')).toBe('PREVIEW - simulate')
    expect(sanitizeComment('naïve')).toBe('na?ve')
  })
})
