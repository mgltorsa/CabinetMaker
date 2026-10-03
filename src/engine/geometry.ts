import type { Axis, Box3, Grain, Mm, Part, PartGroup } from '@/core/types'

export interface PartSpec {
  cabinetId: string
  role: string
  name: string
  group: PartGroup
  materialId: string
  thickness: Mm
  grain: Grain
  /** Cabinet-space bounds. */
  bounds: Box3
  /** Cabinet axis the part length runs along (grain direction). */
  lengthAxis: Axis
  thicknessAxis: Axis
}

const AXES: Axis[] = ['x', 'y', 'z']

export function box(x0: Mm, x1: Mm, y0: Mm, y1: Mm, z0: Mm, z1: Mm): Box3 {
  return { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } }
}

export function extent(b: Box3, axis: Axis): Mm {
  return b.max[axis] - b.min[axis]
}

/** Build a Part from its cabinet-space box; length/width come from the axes. */
export function makePart(spec: PartSpec): Part {
  const widthAxis = AXES.find((a) => a !== spec.lengthAxis && a !== spec.thicknessAxis)
  if (!widthAxis) throw new Error(`Invalid axes for ${spec.role}`)
  return {
    id: `${spec.cabinetId}:${spec.role}`,
    cabinetId: spec.cabinetId,
    name: spec.name,
    group: spec.group,
    role: spec.role,
    length: extent(spec.bounds, spec.lengthAxis),
    width: extent(spec.bounds, widthAxis),
    thickness: spec.thickness,
    materialId: spec.materialId,
    grain: spec.grain,
    bounds: spec.bounds,
    axes: { length: spec.lengthAxis, width: widthAxis, thickness: spec.thicknessAxis },
    ops: [],
  }
}
