/**
 * Hand-made fixtures for drawings tests. They do not use the engine, nest or
 * estimate modules so the drawings tests stay valid while those are rewritten.
 */
import { createProject, defaultCabinet } from '@/core/defaults'
import type {
  Axis,
  Bom,
  Cabinet,
  CabinetBuild,
  Estimate,
  Mm,
  NestResult,
  Op,
  Part,
  PartGroup,
  Placement,
  Project,
  ProjectBuild,
  Sheet,
} from '@/core/types'
import type { PipelineResult } from '@/pipeline'

interface PartInput {
  cabinetId?: string
  role: string
  name: string
  group: PartGroup
  /** Cabinet-space box [x0, x1, y0, y1, z0, z1]. */
  box: [Mm, Mm, Mm, Mm, Mm, Mm]
  length: Axis
  thickness: Axis
  materialId?: string
  ops?: Op[]
  grain?: Part['grain']
}

export function fixturePart(input: PartInput): Part {
  const [x0, x1, y0, y1, z0, z1] = input.box
  const bounds = { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } }
  const widthAxis = (['x', 'y', 'z'] as const).find((a) => a !== input.length && a !== input.thickness) ?? 'z'
  const ext = (a: Axis): Mm => bounds.max[a] - bounds.min[a]
  const cabinetId = input.cabinetId ?? 'cab_t'
  return {
    id: `${cabinetId}:${input.role}`,
    cabinetId,
    name: input.name,
    group: input.group,
    role: input.role,
    length: ext(input.length),
    width: ext(widthAxis),
    thickness: ext(input.thickness),
    materialId: input.materialId ?? 'ply-18',
    grain: input.grain ?? 'length',
    bounds,
    axes: { length: input.length, width: widthAxis, thickness: input.thickness },
    ops: input.ops ?? [],
  }
}

/** Shelf-pin rows (face A), back groove (face A), dowel bores (edge) and a domino (face B). */
function sideOps(): Op[] {
  const pins: Op[] = [0, 1, 2, 3, 4].flatMap((i) => [
    { id: `pin-f-${i}`, kind: 'hole', face: 'A', purpose: 'shelf-pin', x: 250 + i * 32, y: 37, diameter: 5, depth: 12 },
    { id: `pin-b-${i}`, kind: 'hole', face: 'A', purpose: 'shelf-pin', x: 250 + i * 32, y: 525, diameter: 5, depth: 12 },
  ])
  return [
    ...pins,
    { id: 'groove', kind: 'dado', face: 'A', purpose: 'back-groove', x1: 0, y1: 15, x2: 770, y2: 15, width: 6, depth: 6 },
    { id: 'dowel-1', kind: 'hole', face: 'edge-x0', purpose: 'dowel', x: 50, y: 9, diameter: 8, depth: 30 },
    { id: 'dom-1', kind: 'mortise', face: 'B', purpose: 'domino', x: 400, y: 280, length: 30, width: 5, depth: 12, axis: 'x' },
  ]
}

function doorOps(): Op[] {
  return [
    { id: 'cup-1', kind: 'hole', face: 'B', purpose: 'hinge-cup', x: 100, y: 21.5, diameter: 35, depth: 13 },
    { id: 'cup-2', kind: 'hole', face: 'B', purpose: 'hinge-cup', x: 470, y: 21.5, diameter: 35, depth: 13 },
  ]
}

/** 600 × 870 × 580 base cabinet: drawer over two doors, toe kick, one shelf. */
export function fixtureCabinet(): Cabinet {
  const cab = defaultCabinet('cab_t')
  return { ...cab, name: 'Base <cab> & "co"', sections: cab.sections.map((s, i) => ({ ...s, id: `sec_${i}` })) }
}

export function fixtureParts(): Part[] {
  const p = fixturePart
  return [
    p({ role: 'side-left', name: 'Left side', group: 'carcass', box: [0, 18, 100, 870, 0, 562], length: 'y', thickness: 'x', ops: sideOps() }),
    p({ role: 'side-right', name: 'Right side', group: 'carcass', box: [582, 600, 100, 870, 0, 562], length: 'y', thickness: 'x' }),
    p({ role: 'bottom', name: 'Bottom', group: 'carcass', box: [18, 582, 100, 118, 0, 562], length: 'x', thickness: 'y' }),
    p({ role: 'stretcher-front', name: 'Front stretcher', group: 'stretcher', box: [18, 582, 852, 870, 462, 562], length: 'x', thickness: 'y' }),
    p({ role: 'back', name: 'Back', group: 'back', box: [12, 588, 112, 858, 12, 18], length: 'y', thickness: 'z', materialId: 'ply-6' }),
    p({ role: 'shelf-1', name: 'Shelf 1', group: 'shelf', box: [19, 581, 400, 418, 18, 550], length: 'x', thickness: 'y' }),
    p({ role: 'toe-kick', name: 'Toe kick', group: 'toe-kick', box: [0, 600, 0, 100, 469, 487], length: 'x', thickness: 'z' }),
    p({
      role: 'drawer-front-1', name: 'Drawer front', group: 'front', box: [1.5, 598.5, 718.5, 868.5, 562, 580], length: 'x', thickness: 'z', materialId: 'mdf-18', grain: 'none',
      ops: [
        { id: 'pull-a', kind: 'hole', face: 'A', purpose: 'pull', x: 234.5, y: 75, diameter: 5, depth: 18 },
        { id: 'pull-b', kind: 'hole', face: 'A', purpose: 'pull', x: 362.5, y: 75, diameter: 5, depth: 18 },
      ],
    }),
    p({ role: 'door-1', name: 'Door 1', group: 'front', box: [1.5, 298.5, 101.5, 715.5, 562, 580], length: 'y', thickness: 'z', materialId: 'mdf-18', grain: 'none', ops: doorOps() }),
    p({ role: 'door-2', name: 'Door 2', group: 'front', box: [301.5, 598.5, 101.5, 715.5, 562, 580], length: 'y', thickness: 'z', materialId: 'mdf-18', grain: 'none' }),
    p({ role: 'drawer-side-l', name: 'Drawer side', group: 'drawer-box', box: [30, 42, 740, 840, 30, 530], length: 'z', thickness: 'x', materialId: 'bb-12' }),
  ]
}

export function fixtureCabinetBuild(): CabinetBuild {
  return { cabinetId: 'cab_t', parts: fixtureParts(), hardware: [], warnings: [] }
}

export function fixturePartsById(parts: readonly Part[] = fixtureParts()): ReadonlyMap<string, Part> {
  return new Map(parts.map((p) => [p.id, p]))
}

export function fixtureSheet(parts: readonly Part[] = fixtureParts(), materialId = 'ply-18', index = 1): Sheet {
  const kerf = 6.35
  const cursor = { x: 10, y: 10, rowHeight: 0 }
  const placements: Placement[] = parts
    .filter((part) => part.materialId === materialId)
    .map((part, i) => {
      const rotated = i === 3
      const sizeX = rotated ? part.width : part.length
      const sizeY = rotated ? part.length : part.width
      if (cursor.x + sizeX > 2430) {
        cursor.x = 10
        cursor.y += cursor.rowHeight + kerf
        cursor.rowHeight = 0
      }
      const placement: Placement = { partId: part.id, x: cursor.x, y: cursor.y, rotated, sizeX, sizeY }
      cursor.x += sizeX + kerf
      cursor.rowHeight = Math.max(cursor.rowHeight, sizeY)
      return placement
    })
  return { id: `${materialId}#${index}`, materialId, index, length: 2440, width: 1220, thickness: 18, placements, yield: 0.6234 }
}

function fixtureBom(parts: readonly Part[]): Bom {
  return {
    parts: parts.map((p) => ({
      partId: p.id,
      cabinetId: p.cabinetId,
      name: p.name,
      materialId: p.materialId,
      length: p.length,
      width: p.width,
      thickness: p.thickness,
      grain: p.grain,
      opCount: p.ops.length,
    })),
    lines: [
      { category: 'sheet', refId: 'ply-18', description: '18 mm plywood', qty: 1, unit: 'sheet', unitCost: 85, total: 85 },
      { category: 'hardware', refId: 'blum-cliptop-110', description: 'Concealed hinge 110°', manufacturer: 'Blum', sku: 'CLIP top 71B3550', qty: 4, unit: 'pcs', unitCost: 6.5, total: 26 },
    ],
  }
}

function fixtureEstimate(bom: Bom): Estimate {
  const hardware = bom.lines.filter((l) => l.category === 'hardware')
  const materials = bom.lines.filter((l) => l.category !== 'hardware')
  return {
    currency: 'USD',
    materials,
    hardware,
    labor: [
      { bucket: 'cutting', minutes: 20, cost: 21.67 },
      { bucket: 'assembly', minutes: 45, cost: 48.75 },
    ],
    materialCost: 85,
    hardwareCost: 26,
    laborCost: 70.42,
    subtotal: 181.42,
    marginAmount: 45.36,
    price: 226.78,
    extras: [],
    extrasCost: 0,
    materialMarkupAmount: 0,
    hardwareMarkupAmount: 0,
    markupAmount: 0,
    minimumChargeAdjustment: 0,
    taxRate: 0,
    tax: 0,
    total: 226.78,
  }
}

export function fixtureResult(parts: readonly Part[] = fixtureParts()): PipelineResult {
  const cabinets = [...new Set(parts.map((p) => p.cabinetId))].map((cabinetId) => ({
    cabinetId,
    parts: parts.filter((p) => p.cabinetId === cabinetId),
    hardware: [],
    warnings: [],
  }))
  const build: ProjectBuild = { cabinets, parts: [...parts], hardware: [], warnings: [] }
  const sheets = ['ply-18', 'mdf-18', 'bb-12', 'ply-6'].map((m, i) => fixtureSheet(parts, m, i + 1)).filter((s) => s.placements.length > 0)
  const nest: NestResult = { sheets, linearPartIds: [], unplaced: [], summary: [] }
  const bom = fixtureBom(parts)
  return { build, partsById: fixturePartsById(parts), nest, bom, estimate: fixtureEstimate(bom) }
}

export function fixtureProjectFor(cabinet: Cabinet = fixtureCabinet()): Project {
  return { ...createProject('Kitchen <Plan> & "Co" — Ω'), id: 'prj_t', cabinets: [cabinet] }
}

/** Many-part result for pagination tests: `count` shelves in one cabinet. */
export function manyPartsResult(count: number): PipelineResult {
  const shelves = Array.from({ length: count }, (_, i) =>
    fixturePart({ role: `shelf-${i + 1}`, name: `Shelf ${i + 1}`, group: 'shelf', box: [19, 581, 120 + i, 138 + i, 18, 550], length: 'x', thickness: 'y' }),
  )
  return fixtureResult([...fixtureParts(), ...shelves])
}
