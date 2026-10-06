import { describe, expect, it } from 'vitest'
import type { Toolpath } from '@/core/types'
import { emitGcode, generateToolpaths, parseGcode } from './index'
import { downwardFeedViolations } from './testing/feeds'
import { dado, hole, makeInput, makeMachine, makePart, makeTools, placeAt } from './testing/fixtures'

function sheetProgram(): { toolpaths: Toolpath[]; gcode: string } {
  const part = makePart({
    length: 400,
    width: 300,
    ops: [hole('pin-1', 37, 100, 5, 12), hole('pin-2', 37, 132, 5, 12), dado('d1', [0, 150], [400, 150], 6, 6)],
  })
  const input = makeInput([part], [placeAt(part, 20, 20)])
  const { toolpaths } = generateToolpaths(input)
  const gcode = emitGcode(toolpaths, input.machine, input.tools, { programName: 'test-sheet-1', material: '18 mm plywood' })
  return { toolpaths, gcode }
}

const lines = (gcode: string): string[] => gcode.trimEnd().split('\n')

describe('emitGcode structure', () => {
  const { gcode } = sheetProgram()
  const l = lines(gcode)

  it('is wrapped in % and starts with the preview banner', () => {
    expect(l[0]).toBe('%')
    expect(l.at(-1)).toBe('%')
    expect(l[1]).toBe('(PREVIEW - simulate before running; not validated for any specific machine)')
    expect(gcode).toContain('(Program: test-sheet-1)')
    expect(gcode).toContain('(Sheet: ply-18#1)')
    expect(gcode).toContain('(Material: 18 mm plywood)')
    expect(gcode).toContain('(T3 D5 5 mm brad-point drill)')
  })

  it('sets metric, absolute, XY plane before any motion', () => {
    const firstMotion = l.findIndex((s) => /^G[01] /.test(s))
    expect(l.slice(0, firstMotion)).toEqual(expect.arrayContaining(['G21', 'G90', 'G17']))
  })

  it('changes tools: retract, tool-change position, M5, Tn M6, M0 pause (manual), spindle on', () => {
    const at = l.indexOf('T3 M6')
    expect(l.slice(at - 4, at + 3)).toEqual([
      'G0 Z25',
      'G0 X0 Y0',
      'G0 Z50',
      'M5',
      'T3 M6',
      'M0 (Manual tool change: install T3 5 mm brad-point drill, then resume)',
      'S6000 M3',
    ])
  })

  it('omits the M0 pause with an automatic tool changer', () => {
    const part = makePart({ ops: [hole('h', 50, 50, 5, 5)] })
    const machine = makeMachine({ toolChange: { x: 0, y: 0, z: 50, mode: 'auto' } })
    const input = makeInput([part], [placeAt(part, 20, 20)], { machine })
    const out = emitGcode(generateToolpaths(input).toolpaths, machine, input.tools, { programName: 'p' })
    expect(out).not.toMatch(/^M0/m)
  })

  it('uses only G0/G1 moves (no arcs) and plunges at the plunge feed', () => {
    expect(gcode).not.toMatch(/^G[23]\b/m)
    const at = l.indexOf('G0 X57 Y120')
    expect(l.slice(at, at + 5)).toEqual(['G0 X57 Y120', 'G0 Z3', 'G1 Z0 F600', 'G1 Z-4', 'G0 Z10'])
  })

  it('ends with spindle stop, retract, park and M30', () => {
    expect(l.slice(-6)).toEqual(['M5', 'G0 Z25', 'G0 X0 Y1200', 'G0 Z50', 'M30', '%'])
  })

  it('writes numbers with at most 3 decimals and no trailing zeros', () => {
    const numbers = gcode
      .replace(/\([^)]*\)/g, '')
      .match(/[XYZFS]-?\d+(\.\d+)?/g) ?? []
    expect(numbers.length).toBeGreaterThan(10)
    numbers.forEach((n) => expect(n).toMatch(/^[XYZFS]-?\d+(\.\d{0,2}[1-9])?$/))
  })
})

describe('emitGcode options and failures', () => {
  it('warns in a comment and still writes G21 when the machine is set to G20', () => {
    const machine = makeMachine({ units: 'G20' })
    const out = emitGcode([], machine, makeTools(), { programName: 'p' })
    expect(out).toMatch(/\(WARNING: inch output \[G20\] is coming soon; this program is in millimetres \[G21\]\)/)
    expect(out).toMatch(/^G21$/m)
    expect(out).not.toMatch(/^G20$/m)
  })

  it('sanitises user text in comments', () => {
    const out = emitGcode([], makeMachine(), makeTools(), { programName: 'evil)\nM30 (', material: 'x' })
    expect(out).toContain('(Program: evil] M30 [)')
    expect(out).not.toMatch(/^M30 \($/m)
  })

  it('throws for a toolpath whose tool is not in the tool table', () => {
    const tp: Toolpath = { id: 'x', sheetId: 's', partId: null, kind: 'drill', toolId: 'missing', passes: [] }
    expect(() => emitGcode([tp], makeMachine(), makeTools(), { programName: 'p' })).toThrow(/missing/)
  })

  it('throws when safe Z is not above the stock', () => {
    expect(() => emitGcode([], makeMachine({ safeZ: 0 }), makeTools(), { programName: 'p' })).toThrow(/safe Z/i)
  })

  it('throws for a pass point above safe Z (it would be cut as a rapid)', () => {
    const tp: Toolpath = { id: 'x', sheetId: 's', partId: null, kind: 'drill', toolId: 't3', passes: [[{ x: 0, y: 0, z: 20 }]] }
    expect(() => emitGcode([tp], makeMachine(), makeTools(), { programName: 'p' })).toThrow(/above/)
  })

  it('plunges from safe Z when the rapid clearance is unusable', () => {
    const machine = makeMachine({ rapidClearance: 0 })
    const tp: Toolpath = {
      id: 'x',
      sheetId: 's',
      partId: null,
      kind: 'drill',
      toolId: 't3',
      passes: [[{ x: 5, y: 5, z: 0 }, { x: 5, y: 5, z: -3 }]],
    }
    const out = lines(emitGcode([tp], machine, makeTools(), { programName: 'p' }))
    const at = out.indexOf('G0 X5 Y5')
    expect(out[at + 1]).toBe('G1 Z0 F600')
  })
})

describe('emitGcode feeds on downward moves', () => {
  it('never feeds down faster than the plunge feed (helical pocket entries)', () => {
    const part = makePart({ ops: [hole('cup', 100, 100, 35, 13), hole('small', 250, 100, 8, 10)] })
    const input = makeInput([part], [placeAt(part, 20, 20)])
    const gcode = emitGcode(generateToolpaths(input).toolpaths, input.machine, input.tools, { programName: 'p' })
    expect(gcode).toMatch(/\(pocket /)
    expect(downwardFeedViolations(gcode, input.tools)).toEqual([])
  })

  it('slows a steep ramp so its vertical rate equals the plunge feed', () => {
    const tp: Toolpath = {
      id: 'ramp',
      sheetId: 's',
      partId: null,
      kind: 'pocket',
      toolId: 't1',
      passes: [[{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: -5 }]],
    }
    const out = lines(emitGcode([tp], makeMachine(), makeTools(), { programName: 'p' }))
    // length √50 = 7.071; plunge 1000 × 7.071 / 5 = 1414.213 (rounded down), below the 4000 cut feed
    expect(out).toContain('G1 X3 Y4 Z-5 F1414.213')
  })

  it('keeps the cut feed on a shallow ramp and on level or rising moves', () => {
    const tp: Toolpath = {
      id: 'shallow',
      sheetId: 's',
      partId: null,
      kind: 'pocket',
      toolId: 't1',
      passes: [[{ x: 0, y: 0, z: -1 }, { x: 100, y: 0, z: -2 }, { x: 200, y: 0, z: -2 }, { x: 200, y: 0, z: -1 }]],
    }
    const out = lines(emitGcode([tp], makeMachine(), makeTools(), { programName: 'p' }))
    expect(out).toContain('G1 X100 Z-2 F4000')
    expect(out).toContain('G1 X200')
    expect(out).toContain('G1 Z-1 F1000')
  })
})

describe('emitGcode tool numbers', () => {
  it('throws when two used tools share a tool number', () => {
    const tools = makeTools().map((t) => (t.id === 't2' ? { ...t, number: 1 } : t))
    const paths: Toolpath[] = ['t1', 't2'].map((toolId) => ({
      id: toolId,
      sheetId: 's',
      partId: null,
      kind: 'dado',
      toolId,
      passes: [[{ x: 10, y: 10, z: -1 }, { x: 20, y: 10, z: -1 }]],
    }))
    expect(() => emitGcode(paths, makeMachine(), tools, { programName: 'p' })).toThrow(/T1/)
  })

  it('allows duplicate numbers on tools the program does not use', () => {
    const tools = makeTools().map((t) => (t.id === 't2' ? { ...t, number: 1 } : t))
    const tp: Toolpath = { id: 'x', sheetId: 's', partId: null, kind: 'drill', toolId: 't3', passes: [[{ x: 5, y: 5, z: -3 }]] }
    expect(() => emitGcode([tp], makeMachine(), tools, { programName: 'p' })).not.toThrow()
  })
})

describe('emitGcode banner', () => {
  it('names the material and its thickness when given', () => {
    const out = emitGcode([], makeMachine(), makeTools(), { programName: 'p', material: 'Baltic birch 18', thickness: 18 })
    expect(out).toContain('(Material: Baltic birch 18, 18 mm thick)')
  })

  it('names the thickness alone when no material is given', () => {
    const out = emitGcode([], makeMachine(), makeTools(), { programName: 'p', thickness: 12.5 })
    expect(out).toContain('(Stock thickness: 12.5 mm)')
  })
})

describe('round trip: parseGcode(emitGcode(toolpaths)) equals the preview', () => {
  it('reproduces every pass of a sheet with drills, a dado and a tabbed profile', () => {
    const { toolpaths, gcode } = sheetProgram()
    expect(toolpaths.map((t) => t.kind)).toEqual(['drill', 'drill', 'dado', 'profile'])
    const parsed = parseGcode(gcode)
    const expected = toolpaths.flatMap((t) => t.passes)
    expect(parsed.polylines).toHaveLength(expected.length)
    parsed.polylines.forEach((poly, i) => {
      const pass = expected[i] ?? []
      expect(poly.points).toHaveLength(pass.length)
      poly.points.forEach((p, j) => {
        const q = pass[j]
        if (!q) throw new Error('missing point')
        expect(Math.abs(p.x - q.x)).toBeLessThanOrEqual(0.001)
        expect(Math.abs(p.y - q.y)).toBeLessThanOrEqual(0.001)
        expect(Math.abs(p.z - q.z)).toBeLessThanOrEqual(0.001)
      })
    })
    expect(parsed.toolChanges.map((t) => t.tool)).toEqual([3, 2, 1])
    expect(parsed.warnings).toEqual([])
  })

  it('reproduces a multi-turn helical pocket entry point for point', () => {
    const part = makePart({ ops: [hole('cup', 100, 100, 35, 13)] })
    const input = makeInput([part], [placeAt(part, 20, 20)])
    const pocket = generateToolpaths(input).toolpaths.filter((t) => t.kind === 'pocket')
    const parsed = parseGcode(emitGcode(pocket, input.machine, input.tools, { programName: 'p' }))
    expect(parsed.polylines.map((p) => p.points)).toEqual(pocket.flatMap((t) => t.passes))
    expect(parsed.warnings).toEqual([])
  })

  it('tags each polyline with the active tool', () => {
    const { toolpaths, gcode } = sheetProgram()
    const tools = makeTools()
    const expected = toolpaths.flatMap((t) => t.passes.map(() => tools.find((x) => x.id === t.toolId)?.number))
    expect(parseGcode(gcode).polylines.map((p) => p.tool)).toEqual(expected)
  })
})

describe('snapshot', () => {
  it('emits a stable program for a small part', () => {
    const part = makePart({ id: 'cab_1:shelf-1', length: 60, width: 40, ops: [hole('pin', 20, 20, 5, 6)] })
    const machine = makeMachine({ tabs: { enabled: false, spacing: 400, width: 10, thickness: 3 } })
    const input = makeInput([part], [placeAt(part, 20, 20)], { machine })
    const { toolpaths } = generateToolpaths(input)
    expect(emitGcode(toolpaths, machine, input.tools, { programName: 'small', material: '18 mm plywood' })).toMatchSnapshot()
  })
})
