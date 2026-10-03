import { describe, expect, it } from 'vitest'
import { formatFractionalInches, parseLength } from './units'

describe('units', () => {
  it('parses imperial fractions', () => {
    expect(parseLength('23 5/8', 'imperial')).toBeCloseTo(600.075, 3)
    expect(parseLength('5/8"', 'imperial')).toBeCloseTo(15.875, 3)
    expect(parseLength('abc', 'imperial')).toBeNull()
    expect(parseLength('1/0', 'imperial')).toBeNull()
  })
  it('parses metric', () => {
    expect(parseLength('600', 'metric')).toBe(600)
    expect(parseLength('', 'metric')).toBeNull()
  })
  it('formats fractional inches', () => {
    expect(formatFractionalInches(23.625)).toBe('23 5/8"')
    expect(formatFractionalInches(0.5)).toBe('1/2"')
    expect(formatFractionalInches(24)).toBe('24"')
  })
})
