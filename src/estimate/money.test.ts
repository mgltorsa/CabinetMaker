import { describe, expect, it } from 'vitest'
import { formatMoney, fromCents, roundMoney, sumMoney, toCents } from './money'

describe('toCents / fromCents', () => {
  it('rounds half away from binary noise (1.005 → 101 cents)', () => {
    expect(toCents(1.005)).toBe(101)
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it('rounds negative amounts symmetrically', () => {
    expect(toCents(-1.005)).toBe(-101)
    expect(toCents(-0.004)).toBe(0)
    expect(Object.is(toCents(-0.004), -0)).toBe(false)
  })

  it('treats non-finite amounts as zero', () => {
    expect(toCents(Number.NaN)).toBe(0)
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('converts cents back to an amount', () => {
    expect(fromCents(12345)).toBe(123.45)
  })
})

describe('roundMoney / sumMoney', () => {
  it('rounds to cents', () => {
    expect(roundMoney(23.456)).toBe(23.46)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
  })

  it('sums exactly in cents', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(sumMoney([])).toBe(0)
    expect(sumMoney([19.99, 0.01, 80])).toBe(100)
  })
})

describe('formatMoney', () => {
  it('formats a valid currency with Intl', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50')
    expect(formatMoney(-5, 'USD')).toBe('-$5.00')
  })

  it('honours a locale argument', () => {
    const text = formatMoney(1234.5, 'EUR', 'de-DE')
    expect(text).toMatch(/1\.234,50/)
    expect(text).toContain('€')
  })

  it('accepts a lower-case or padded currency code', () => {
    expect(formatMoney(2, ' usd ')).toBe('$2.00')
  })

  it('falls back to "amount CODE" for an invalid currency code', () => {
    expect(formatMoney(1234.5, 'US$')).toBe('1234.50 US$')
    expect(formatMoney(3, 'DOLLARS')).toBe('3.00 DOLLARS')
  })

  it('falls back to a plain amount when the currency is empty', () => {
    expect(formatMoney(7.1, '')).toBe('7.10')
  })

  it('falls back when the locale is invalid', () => {
    expect(formatMoney(7.1, 'USD', 'not a locale!')).toBe('7.10 USD')
  })

  it('renders non-finite amounts as a dash', () => {
    expect(formatMoney(Number.NaN, 'USD')).toBe('—')
  })
})
