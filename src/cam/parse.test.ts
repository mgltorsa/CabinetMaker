import { describe, expect, it } from 'vitest'
import { parseGcode } from './parse'

describe('parseGcode', () => {
  it('splits G1 runs at rapids and returns absolute points', () => {
    const program = parseGcode(['%', 'G21 G90', 'G0 X10 Y20 Z5', 'G1 Z-1 F500', 'X30', 'Y40 Z-2', 'G0 Z5', 'G1 X0 Y0 Z-1', '%'].join('\n'))
    expect(program.polylines).toEqual([
      {
        tool: null,
        points: [
          { x: 10, y: 20, z: -1 },
          { x: 30, y: 20, z: -1 },
          { x: 30, y: 40, z: -2 },
        ],
      },
      { tool: null, points: [{ x: 0, y: 0, z: -1 }] },
    ])
    expect(program.warnings).toEqual([])
  })

  it('ignores comments, line numbers and case, and reads packed words', () => {
    const program = parseGcode(['(header (sic)', 'n10 g0 x1y2z3 ; trailing', 'N20 G1Z-1(cut)', '; whole-line comment'].join('\n'))
    expect(program.polylines).toEqual([{ tool: null, points: [{ x: 1, y: 2, z: -1 }] }])
  })

  it('records tool changes and tags polylines with the active tool', () => {
    const program = parseGcode(['G0 X0 Y0 Z5', 'T2 M6', 'S18000 M3', 'G1 Z-1', 'G0 Z5', 'T5', 'M6', 'G1 Z-2'].join('\n'))
    expect(program.toolChanges).toEqual([
      { tool: 2, line: 2 },
      { tool: 5, line: 7 },
    ])
    expect(program.polylines.map((p) => p.tool)).toEqual([2, 5])
  })

  it('ends a polyline at a tool change', () => {
    const program = parseGcode(['G0 X0 Y0 Z0', 'G1 Z-1', 'T1 M6', 'G1 Z-2'].join('\n'))
    expect(program.polylines).toHaveLength(2)
  })

  it('handles incremental moves and inch units', () => {
    const program = parseGcode(['G0 X0 Y0 Z0', 'G91', 'G1 X1 Y1', 'X1', 'G90 G20', 'G1 X1 Y0 Z0'].join('\n'))
    expect(program.polylines[0]?.points).toEqual([
      { x: 1, y: 1, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 25.4, y: 0, z: 0 },
    ])
  })

  it('warns about arcs and treats them as straight feeds', () => {
    const program = parseGcode(['G0 X0 Y0 Z0', 'G2 X10 Y0 I5 J0'].join('\n'))
    expect(program.polylines[0]?.points).toEqual([{ x: 10, y: 0, z: 0 }])
    expect(program.warnings).toEqual([expect.stringMatching(/line 2: arc G2/)])
  })

  it('warns about feeds from an unknown position, motion without a mode and bad input', () => {
    const program = parseGcode(['X5', 'G1 X1', 'M6', 'G1 X$', 'G43 H1'].join('\n'))
    expect(program.warnings).toEqual([
      expect.stringMatching(/line 1: motion without/),
      expect.stringMatching(/line 2: .*unknown/),
      expect.stringMatching(/line 3: M6 without/),
      expect.stringMatching(/line 4: cannot parse/),
      expect.stringMatching(/line 5: unsupported G43/),
    ])
  })

  it('stops the polyline at program end', () => {
    const program = parseGcode(['G0 X0 Y0 Z0', 'G1 Z-1', 'M30', 'G1 Z-2'].join('\n'))
    expect(program.polylines).toHaveLength(2)
  })
})
