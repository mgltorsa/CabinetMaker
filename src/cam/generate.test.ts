import { describe, expect, it } from 'vitest'
import type { Part } from '@/core/types'
import { generateToolpaths } from './index'
import { allPoints, dado, hole, makeInput, makeMachine, makePart, makeSheet, makeTools, mortise, placeAt } from './testing/fixtures'

function sidePanel(): Part {
  return makePart({
    id: 'cab_1:side-left',
    length: 700,
    width: 560,
    ops: [
      hole('pin-1', 37, 100, 5, 12),
      hole('pin-2', 37, 132, 5, 12),
      dado('back-groove', [0, 540], [700, 540], 6, 6),
      hole('cup', 100, 300, 35, 13),
      { ...hole('edge-bore', 9, 50, 8, 30), face: 'edge-x0' },
      { ...hole('face-b', 100, 100, 5, 10), face: 'B' },
      mortise('domino', 300, 300, 30, 5, 12),
    ],
  })
}

function shelf(): Part {
  return makePart({ id: 'cab_1:shelf-1', role: 'shelf-1', length: 300, width: 200, ops: [hole('h', 50, 50, 5, 8)] })
}

describe('generateToolpaths', () => {
  it('machines face-A ops, profiles every part and reports the rest as manual ops', () => {
    const side = sidePanel()
    const small = shelf()
    const result = generateToolpaths(makeInput([side, small], [placeAt(side, 20, 20), placeAt(small, 800, 20)]))
    expect(result.sheetId).toBe('ply-18#1')
    expect(result.manualOps).toEqual([
      { partId: side.id, opId: 'edge-bore', reason: expect.stringMatching(/edge-x0/) },
      { partId: side.id, opId: 'face-b', reason: expect.stringMatching(/face B/) },
    ])
    const machinedOps = result.toolpaths.filter((t) => t.kind !== 'profile').map((t) => t.id.split(':').at(-1))
    expect(machinedOps.sort()).toEqual(['back-groove', 'cup', 'domino', 'h', 'pin-1', 'pin-2'])
    expect(result.toolpaths.filter((t) => t.kind === 'profile').map((t) => t.partId)).toEqual([small.id, side.id])
    expect(result.warnings).toEqual([])
  })

  it('accounts for every op exactly once (machined or manual)', () => {
    const side = sidePanel()
    const result = generateToolpaths(makeInput([side], [placeAt(side, 20, 20)]))
    const machined = result.toolpaths.filter((t) => t.kind !== 'profile').length
    expect(machined + result.manualOps.length).toBe(side.ops.length)
  })

  it('orders drills, then grooves/pockets, then profiles smallest first, grouped by tool', () => {
    const side = sidePanel()
    const small = shelf()
    const result = generateToolpaths(makeInput([side, small], [placeAt(side, 20, 20), placeAt(small, 800, 20)]))
    expect(result.toolpaths.map((t) => `${t.kind}:${t.toolId}`)).toEqual([
      'drill:t3',
      'drill:t3',
      'drill:t3',
      'dado:t2',
      'pocket:t2',
      'pocket:t1',
      'profile:t1',
      'profile:t1',
    ])
  })

  it('emits toolpaths in sheet space with the tool envelope inside the sheet', () => {
    const side = sidePanel()
    const result = generateToolpaths(makeInput([side], [placeAt(side, 20, 20, true)]))
    const pts = allPoints(result.toolpaths)
    expect(Math.min(...pts.map((p) => p.x))).toBeGreaterThanOrEqual(20 - 6.35 / 2)
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThanOrEqual(20 + 700 + 6.35 / 2)
  })

  it('warns about toolpaths outside the sheet and the table', () => {
    const part = makePart()
    const input = makeInput([part], [placeAt(part, 0, 0)], { machine: makeMachine({ tableX: 300 }) })
    const codes = generateToolpaths(input).warnings.map((w) => w.code)
    expect(codes).toContain('cam/outside-sheet')
    expect(codes).toContain('cam/outside-table')
    expect(codes).toContain('cam/sheet-exceeds-table')
  })

  it('reports placements whose part is unknown, duplicated or mismatched', () => {
    const part = makePart({ thickness: 12, materialId: 'bb-12' })
    const other = makePart({ id: 'cab_1:other' })
    const input = makeInput(
      [part, other],
      [
        placeAt(part, 20, 20),
        placeAt(part, 600, 20),
        { partId: 'ghost', x: 10, y: 600, rotated: false, sizeX: 10, sizeY: 10 },
        { ...placeAt(other, 20, 600), sizeX: 123 },
      ],
    )
    const codes = generateToolpaths(input).warnings.map((w) => w.code)
    expect(codes).toEqual(
      expect.arrayContaining([
        'cam/part-missing',
        'cam/duplicate-placement',
        'cam/placement-size-mismatch',
        'cam/thickness-mismatch',
        'cam/material-mismatch',
      ]),
    )
    expect(generateToolpaths(input).toolpaths.filter((t) => t.kind === 'profile')).toHaveLength(2)
  })

  it('passes tool warnings through and still reports every op', () => {
    const part = makePart({ ops: [hole('h', 50, 50, 5, 8)] })
    const input = makeInput([part], [placeAt(part, 20, 20)], { tools: [] })
    const result = generateToolpaths(input)
    expect(result.toolpaths).toEqual([])
    expect(result.manualOps).toEqual([{ partId: part.id, opId: 'h', reason: expect.stringMatching(/no tool/) }])
    expect(result.warnings.map((w) => w.code)).toEqual([
      'cam/tool-missing',
      'cam/tool-missing',
      'cam/tool-missing',
      'cam/profile-skipped',
    ])
  })

  it('warns about unsafe machine heights and inch units', () => {
    const machine = makeMachine({
      safeZ: 0,
      programSafeZ: -1,
      rapidClearance: 20,
      throughCutExtra: -1,
      onionSkin: -1,
      units: 'G20',
    })
    const warnings = generateToolpaths(makeInput([], [], { machine, sheet: makeSheet([]) })).warnings
    expect(warnings.map((w) => w.code)).toEqual([...Array<string>(5).fill('cam/machine-invalid'), 'cam/units-inch'])
    expect(warnings.map((w) => w.message).join('\n')).toMatch(/Safe Z[\s\S]*Program safe Z[\s\S]*Rapid clearance[\s\S]*Through-cut[\s\S]*Onion skin/)
  })

  it('reports NaN machine settings instead of throwing', () => {
    const machine = makeMachine({ safeZ: Number.NaN, tabs: { enabled: true, spacing: Number.NaN, width: 10, thickness: 3 } })
    const part = makePart()
    const result = generateToolpaths(makeInput([part], [placeAt(part, 20, 20)], { machine }))
    expect(result.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['cam/machine-invalid', 'cam/tabs-invalid']))
    expect(result.warnings.find((w) => w.code === 'cam/machine-invalid')?.message).toContain('NaN')
  })

  it('reports every op of a part with an invalid placement as manual', () => {
    const part = makePart({ ops: [hole('h', 50, 50, 5, 8)] })
    const result = generateToolpaths(makeInput([part], [{ ...placeAt(part, 20, 20), x: Number.NaN }]))
    expect(result.toolpaths).toEqual([])
    expect(result.manualOps).toEqual([{ partId: part.id, opId: 'h', reason: expect.stringMatching(/invalid placement/) }])
    expect(result.warnings.map((w) => w.code)).toEqual(['cam/placement-invalid'])
  })

  it('does not profile with a drill: error, no profile toolpaths', () => {
    const part = makePart({ ops: [hole('h', 50, 50, 5, 8)] })
    const result = generateToolpaths(makeInput([part], [placeAt(part, 20, 20)], { machine: makeMachine({ profileToolId: 't3' }) }))
    expect(result.toolpaths.filter((t) => t.kind === 'profile')).toEqual([])
    expect(result.warnings.map((w) => [w.level, w.code])).toEqual([
      ['error', 'cam/tool-kind'],
      ['error', 'cam/profile-skipped'],
    ])
  })

  it('does not cut dados with a drill: error, dado ops reported as manual', () => {
    const part = makePart({ ops: [dado('d', [0, 150], [400, 150], 6, 6), mortise('m', 200, 100, 30, 5, 12)] })
    const result = generateToolpaths(makeInput([part], [placeAt(part, 20, 20)], { machine: makeMachine({ dadoToolId: 't3' }) }))
    expect(result.toolpaths.map((t) => t.kind)).toEqual(['profile'])
    expect(result.manualOps.map((m) => m.opId)).toEqual(['d', 'm'])
    expect(result.warnings).toEqual([expect.objectContaining({ level: 'error', code: 'cam/tool-kind' })])
  })
})

describe('generateToolpaths: neighbouring parts', () => {
  const a = makePart({ id: 'cab_1:a', length: 400, width: 300 })
  const b = makePart({ id: 'cab_1:b', length: 400, width: 300 })
  const codes = (input: ReturnType<typeof makeInput>): string[] =>
    generateToolpaths(input).warnings.filter((w) => w.level === 'error').map((w) => w.code)

  it('accepts parts spaced exactly one profile tool diameter apart', () => {
    expect(codes(makeInput([a, b], [placeAt(a, 20, 20), placeAt(b, 420 + 6.35, 20)]))).toEqual([])
  })

  it('errors when two parts are closer than the profile tool diameter', () => {
    const tools = makeTools().map((t) => (t.id === 't1' ? { ...t, diameter: 12.7 } : t))
    const result = generateToolpaths(makeInput([a, b], [placeAt(a, 20, 20), placeAt(b, 420 + 6.35, 20)], { tools }))
    const close = result.warnings.filter((w) => w.code === 'cam/parts-too-close')
    expect(close).toEqual([expect.objectContaining({ level: 'error' })])
    expect(close[0]?.message).toMatch(/cab_1:a.*cab_1:b.*6\.35 mm.*12\.7 mm/)
  })

  it('measures diagonal neighbours by their corner distance', () => {
    // 5 mm apart in X and Y: corner distance 7.07 mm ≥ 6.35 mm tool
    expect(codes(makeInput([a, b], [placeAt(a, 20, 20), placeAt(b, 425, 325)]))).toEqual([])
    // 3 mm apart in X and Y: corner distance 4.24 mm < 6.35 mm tool
    expect(codes(makeInput([a, b], [placeAt(a, 20, 20), placeAt(b, 423, 323)]))).toEqual(['cam/parts-too-close'])
  })

  it('errors when a through dado overruns into the neighbouring part', () => {
    const grooved = makePart({ id: 'cab_1:a', length: 400, width: 300, ops: [dado('d', [0, 150], [400, 150], 10, 6)] })
    const tools = makeTools().map((t) => (t.id === 't2' ? { ...t, diameter: 10 } : t.id === 't1' ? { ...t, diameter: 3 } : t))
    const placements = [placeAt(grooved, 20, 20), placeAt(b, 424, 20)]
    const result = generateToolpaths(makeInput([grooved, b], placements, { tools }))
    expect(result.warnings.filter((w) => w.level === 'error').map((w) => w.code)).toEqual(['cam/cut-reaches-neighbour'])
    expect(result.warnings.find((w) => w.code === 'cam/cut-reaches-neighbour')?.message).toMatch(/:d .*cab_1:b/)
    // 5 mm clear is enough for the 5 mm overrun
    const spaced = generateToolpaths(makeInput([grooved, b], [placements[0] ?? placeAt(grooved, 20, 20), placeAt(b, 425, 20)], { tools }))
    expect(spaced.warnings).toEqual([])
  })

  it('does not compare a duplicated placement with itself', () => {
    expect(codes(makeInput([a], [placeAt(a, 20, 20), placeAt(a, 20, 20)]))).toEqual(['cam/duplicate-placement'])
  })
})

describe('generateToolpaths: input handling', () => {
  it('does not mutate its input', () => {
    const side = sidePanel()
    const input = makeInput([side], [placeAt(side, 20, 20)])
    const before = JSON.stringify({ sheet: input.sheet, parts: [...input.parts.values()], machine: input.machine })
    generateToolpaths(input)
    expect(JSON.stringify({ sheet: input.sheet, parts: [...input.parts.values()], machine: input.machine })).toBe(before)
  })
})
