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

describe('parseLength: shop-style input', () => {
  const metric = (t: string) => parseLength(t, 'metric')
  const imperial = (t: string) => parseLength(t, 'imperial')

  it('accepts metric unit suffixes and decimal commas', () => {
    expect(metric('600mm')).toBe(600)
    expect(metric('600 mm')).toBe(600)
    expect(metric('60cm')).toBe(600)
    expect(metric('0.6 m')).toBe(600)
    expect(metric('1,5')).toBe(1.5)
    expect(metric('.5')).toBe(0.5)
  })

  it('accepts inches, feet and fractions, in either unit system', () => {
    expect(imperial('.5')).toBeCloseTo(12.7, 6)
    expect(imperial('24in')).toBeCloseTo(609.6, 6)
    expect(imperial('24 in')).toBeCloseTo(609.6, 6)
    expect(imperial("2'")).toBeCloseTo(609.6, 6)
    expect(imperial(`2' 6"`)).toBeCloseTo(762, 6)
    expect(imperial(`2'-6 1/2"`)).toBeCloseTo(774.7, 6)
    expect(imperial('23-5/8"')).toBeCloseTo(600.075, 3)
    expect(metric('24"')).toBeCloseTo(609.6, 6)
    expect(metric('5/8"')).toBeCloseTo(15.875, 6)
    expect(imperial('600mm')).toBe(600)
  })

  it('rejects malformed input', () => {
    for (const bad of ['wide', '5/8/2', '3/0', '1..2', 'mm', '"', "'", '2 3', '--5']) {
      expect(parseLength(bad, 'imperial'), bad).toBeNull()
      expect(parseLength(bad, 'metric'), bad).toBeNull()
    }
    expect(metric('24')).toBe(24) // a bare number in metric mode is millimetres
  })

  it('never formats a tiny negative as "-0"', () => {
    expect(formatFractionalInches(-0.001)).toBe('0"')
    expect(formatFractionalInches(-0.5)).toBe('-1/2"')
  })
})
