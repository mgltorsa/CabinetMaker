/**
 * Test fixtures for the CAM module. Built by hand so CAM tests do not depend
 * on the engine or nest implementations.
 */
import { DEFAULT_MACHINE, DEFAULT_TOOLS } from '@/core/defaults'
import type { DadoOp, HoleOp, Machine, MortiseOp, Part, Placement, Sheet, Tool, Toolpath, Vec3 } from '@/core/types'
import { makePartContext, type PartContext } from '../context'
import { resolveTools } from '../tools'
import type { CamInput } from '../types'

export function makeTools(): Tool[] {
  return DEFAULT_TOOLS.map((t) => ({ ...t }))
}

export function makeMachine(overrides: Partial<Machine> = {}): Machine {
  return { ...structuredClone(DEFAULT_MACHINE), ...overrides }
}

export function makePart(overrides: Partial<Part> = {}): Part {
  const length = overrides.length ?? 400
  const width = overrides.width ?? 300
  const thickness = overrides.thickness ?? 18
  return {
    id: 'cab_1:side-left',
    cabinetId: 'cab_1',
    name: 'Left side',
    group: 'carcass',
    role: 'side-left',
    materialId: 'ply-18',
    grain: 'length',
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: thickness, y: length, z: width } },
    axes: { length: 'y', width: 'z', thickness: 'x' },
    ops: [],
    ...overrides,
    length,
    width,
    thickness,
  }
}

export function placeAt(part: Part, x: number, y: number, rotated = false): Placement {
  return {
    partId: part.id,
    x,
    y,
    rotated,
    sizeX: rotated ? part.width : part.length,
    sizeY: rotated ? part.length : part.width,
  }
}

export function makeSheet(placements: Placement[], overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 'ply-18#1',
    materialId: 'ply-18',
    index: 1,
    length: 2440,
    width: 1220,
    thickness: 18,
    placements,
    yield: 0.5,
    ...overrides,
  }
}

export function makeInput(parts: Part[], placements: Placement[], overrides: Partial<CamInput> = {}): CamInput {
  return {
    sheet: makeSheet(placements),
    parts: new Map(parts.map((p) => [p.id, p])),
    machine: makeMachine(),
    tools: makeTools(),
    ...overrides,
  }
}

export function hole(id: string, x: number, y: number, diameter: number, depth: number, face: HoleOp['face'] = 'A'): HoleOp {
  return { id, kind: 'hole', face, purpose: 'shelf-pin', x, y, diameter, depth }
}

export function dado(id: string, from: [number, number], to: [number, number], width: number, depth: number): DadoOp {
  return { id, kind: 'dado', face: 'A', purpose: 'dado', x1: from[0], y1: from[1], x2: to[0], y2: to[1], width, depth }
}

export function mortise(
  id: string,
  x: number,
  y: number,
  length: number,
  width: number,
  depth: number,
  axis: 'x' | 'y' = 'x',
): MortiseOp {
  return { id, kind: 'mortise', face: 'A', purpose: 'domino', x, y, length, width, depth, axis }
}

export function allPoints(toolpaths: readonly Toolpath[]): Vec3[] {
  return toolpaths.flatMap((tp) => tp.passes.flat())
}

interface ContextOptions {
  placement?: Placement
  machine?: Machine
  tools?: Tool[]
  sheet?: Sheet
}

/** Part context for planner unit tests (part placed unrotated at 100, 50 by default). */
export function makeContext(part: Part, options: ContextOptions = {}): PartContext {
  const placement = options.placement ?? placeAt(part, 100, 50)
  const machine = options.machine ?? makeMachine()
  const sheet = options.sheet ?? makeSheet([placement])
  const { tools } = resolveTools(machine, options.tools ?? makeTools())
  return makePartContext(sheet, part, placement, machine, tools)
}
