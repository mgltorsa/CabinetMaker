import { describe, expect, it } from 'vitest'
import { guessModelUnit, modelSizeMm, MM_PER_MODEL_UNIT, metresPerModelUnit, sizeLabel } from './units'

describe('model unit scale', () => {
  it('converts each unit to millimetres', () => {
    expect(MM_PER_MODEL_UNIT).toEqual({ m: 1000, cm: 10, mm: 1, in: 25.4 })
  })

  it('maps one model unit to metres for the 3D scene', () => {
    expect(metresPerModelUnit('m')).toBe(1)
    expect(metresPerModelUnit('mm')).toBe(0.001)
    expect(metresPerModelUnit('in')).toBeCloseTo(0.0254, 10)
  })

  it('sizes a model in mm from its native size, unit and uniform scale', () => {
    const cube = { x: 1, y: 2, z: 0.5 }
    expect(modelSizeMm(cube, 'm', 1)).toEqual({ x: 1000, y: 2000, z: 500 })
    expect(modelSizeMm(cube, 'cm', 2)).toEqual({ x: 20, y: 40, z: 10 })
    expect(modelSizeMm({ x: 10, y: 10, z: 10 }, 'in', 1).x).toBeCloseTo(254, 10)
  })
})

describe('guessModelUnit', () => {
  it('trusts the glTF spec: metres', () => {
    expect(guessModelUnit('glb', { x: 900, y: 900, z: 900 })).toBe('m')
    expect(guessModelUnit('gltf', { x: 0.5, y: 0.5, z: 0.5 })).toBe('m')
  })

  it('guesses OBJ / STL units from the largest extent', () => {
    expect(guessModelUnit('obj', { x: 1, y: 0.9, z: 0.6 })).toBe('m') // a 1 m cabinet in metres
    expect(guessModelUnit('obj', { x: 60, y: 90, z: 58 })).toBe('cm') // the same in cm
    expect(guessModelUnit('obj', { x: 600, y: 900, z: 580 })).toBe('mm') // the same in mm
    expect(guessModelUnit('stl', { x: 1, y: 0.9, z: 0.6 })).toBe('m')
  })

  it('reads mid-sized STL as millimetres (the 3D-printing convention)', () => {
    expect(guessModelUnit('stl', { x: 60, y: 90, z: 58 })).toBe('mm')
  })

  it('falls back to millimetres for empty or degenerate sizes', () => {
    expect(guessModelUnit('obj', { x: 0, y: 0, z: 0 })).toBe('mm')
    expect(guessModelUnit('obj', { x: Number.NaN, y: 1, z: 1 })).toBe('mm')
  })
})

describe('sizeLabel', () => {
  it('formats W × H × D in project units', () => {
    expect(sizeLabel({ x: 1000, y: 500, z: 250 }, 'metric')).toBe('1000 × 500 × 250 mm')
    expect(sizeLabel({ x: 25.4, y: 50.8, z: 12.7 }, 'imperial')).toBe('1" × 2" × 1/2"')
  })
})
