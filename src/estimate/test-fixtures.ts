/**
 * Hand-built `ProjectBuild` / `NestResult` fixtures for estimate tests.
 * Deliberately independent of `src/engine` and `src/nest` so estimate tests
 * pin estimate behaviour only.
 */
import type {
  CabinetBuild,
  HardwareUsage,
  NestResult,
  Op,
  Part,
  PartGroup,
  Placement,
  ProjectBuild,
  Sheet,
} from '@/core/types'

export interface PartSpec {
  id: string
  cabinetId?: string
  name?: string
  group?: PartGroup
  materialId?: string
  length?: number
  width?: number
  thickness?: number
  grain?: Part['grain']
  ops?: Op[]
}

export function makePart(spec: PartSpec): Part {
  const length = spec.length ?? 500
  const width = spec.width ?? 300
  const thickness = spec.thickness ?? 18
  return {
    id: spec.id,
    cabinetId: spec.cabinetId ?? 'cab_1',
    name: spec.name ?? spec.id,
    group: spec.group ?? 'carcass',
    role: spec.id,
    length,
    width,
    thickness,
    materialId: spec.materialId ?? 'ply-18',
    grain: spec.grain ?? 'length',
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: length, y: width, z: thickness } },
    axes: { length: 'x', width: 'y', thickness: 'z' },
    ops: spec.ops ?? [],
  }
}

export function hole(id: string, purpose: Op['purpose']): Op {
  return { kind: 'hole', id, face: 'A', purpose, x: 10, y: 10, diameter: 5, depth: 10 }
}

export function dado(id: string): Op {
  return { kind: 'dado', id, face: 'A', purpose: 'dado', x1: 0, y1: 10, x2: 100, y2: 10, width: 18, depth: 6 }
}

export function mortise(id: string): Op {
  return { kind: 'mortise', id, face: 'edge-x0', purpose: 'domino', x: 10, y: 9, length: 30, width: 5, depth: 15, axis: 'x' }
}

export function usage(hardwareId: string, qty: number, cabinetId = 'cab_1'): HardwareUsage {
  return { hardwareId, cabinetId, qty, note: '' }
}

/** Group parts and hardware into cabinets (in first-appearance order of `cabinetIds`). */
export function makeBuild(parts: Part[], hardware: HardwareUsage[] = [], cabinetIds?: string[]): ProjectBuild {
  const ids = cabinetIds ?? [...new Set([...parts.map((p) => p.cabinetId), ...hardware.map((h) => h.cabinetId)])]
  const cabinets: CabinetBuild[] = ids.map((cabinetId) => ({
    cabinetId,
    parts: parts.filter((p) => p.cabinetId === cabinetId),
    hardware: hardware.filter((h) => h.cabinetId === cabinetId),
    warnings: [],
  }))
  return { cabinets, parts, hardware, warnings: [] }
}

export interface SheetSpec {
  materialId: string
  partIds: string[]
}

function placement(partId: string, i: number): Placement {
  return { partId, x: i * 10, y: 0, rotated: false, sizeX: 10, sizeY: 10 }
}

/** One `Sheet` per spec; per-material indices count from 0. Sizes are placeholders. */
export function makeNest(sheets: SheetSpec[], linearPartIds: string[] = []): NestResult {
  const counters = new Map<string, number>()
  const built: Sheet[] = sheets.map((s) => {
    const index = counters.get(s.materialId) ?? 0
    counters.set(s.materialId, index + 1)
    return {
      id: `${s.materialId}#${index}`,
      materialId: s.materialId,
      index,
      length: 2440,
      width: 1220,
      thickness: 18,
      placements: s.partIds.map(placement),
      yield: 0.5,
    }
  })
  return { sheets: built, linearPartIds, unplaced: [], summary: [] }
}

/** Deterministic pseudo-random generator (LCG) for invariant sweeps. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}
