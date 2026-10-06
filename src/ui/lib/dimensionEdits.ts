/**
 * What each editable dimension in the 3D view and the elevations changes:
 * one `DimensionEdit` per `DrawingDimId`, with the current value, the same
 * bounds the sidebar inputs use, and a commit that goes through the store.
 */
import type { Cabinet, CabinetBuild, DrawingDimId, Mm, Project, UnitSystem } from '@/core/types'
import { frontDimId, frontRefOf } from '@/drawings'
import { bayHeightsForFront } from '@/engine'
import type { DesignerActions } from '../store'
import { CABINET_DIMENSION, FLOOR_HEIGHT, MAX_LENGTH, SECTION_SIZE } from './limits'

export interface DimensionEdit {
  /** What the value is, for labels and screen readers ("Width", "Drawer 1.1 front height"). */
  name: string
  /** Current value, mm. */
  value: Mm
  /** Project units: what the input shows and parses. */
  units: UnitSystem
  min: number
  max: number
  /** Apply a parsed, in-range value; returns why it could not be applied, or null. */
  onCommit: (mm: Mm) => string | null
}

export type DimensionEdits = Readonly<Partial<Record<DrawingDimId, DimensionEdit>>>

export type DimensionEditActions = Pick<DesignerActions, 'updateCabinet' | 'updateConstruction' | 'updateBayHeights'>

type Field = Omit<DimensionEdit, 'units' | 'onCommit'> & { apply: (mm: Mm) => string | null }

function edit(units: UnitSystem, { apply, ...field }: Field): DimensionEdit {
  return { ...field, units, onCommit: (mm) => (mm === field.value ? null : apply(mm)) }
}

/** Height of each engine front, keyed by its dimension id (the first front of a door pair). */
function frontHeights(build: CabinetBuild): Map<DrawingDimId, Mm> {
  const out = new Map<DrawingDimId, Mm>()
  for (const part of build.parts) {
    const ref = frontRefOf(part)
    const id = ref && frontDimId(ref.section, ref.bay)
    if (id && !out.has(id)) out.set(id, part.bounds.max.y - part.bounds.min.y)
  }
  return out
}

function frontEdits(project: Project, cabinet: Cabinet, build: CabinetBuild, actions: DimensionEditActions): [DrawingDimId, DimensionEdit][] {
  const heights = frontHeights(build)
  const engine = { materials: project.materials, hardware: project.hardware }
  return cabinet.sections.flatMap((section, s) =>
    // A lone front's height follows the cabinet height: nothing to map it to.
    section.bays.length < 2
      ? []
      : section.bays.flatMap((bay, b): [DrawingDimId, DimensionEdit][] => {
          const id = frontDimId(s, b)
          const value = heights.get(id)
          if (value === undefined || bay.kind === 'open') return []
          const name = `${bay.kind === 'drawer' ? 'Drawer' : 'Door'} ${s + 1}.${b + 1} front height`
          const apply = (mm: Mm): string | null => {
            const result = bayHeightsForFront(cabinet, engine, s, b, mm)
            if (!result.ok) return result.error
            actions.updateBayHeights(cabinet.id, section.id, result.heights)
            return null
          }
          return [[id, edit(project.units, { name, value, ...SECTION_SIZE, apply })]]
        }),
  )
}

/** Every editable dimension of `cabinet` (built as `build`); views show the ones they draw. */
export function cabinetDimensionEdits(project: Project, cabinet: Cabinet, build: CabinetBuild, actions: DimensionEditActions): DimensionEdits {
  const units = project.units
  const setCabinet = (key: 'width' | 'height' | 'depth' | 'floorHeight') => (mm: Mm): null => {
    actions.updateCabinet(cabinet.id, { [key]: mm })
    return null
  }
  const kick = cabinet.construction.toeKick
  return {
    width: edit(units, { name: 'Width', value: cabinet.width, ...CABINET_DIMENSION, apply: setCabinet('width') }),
    height: edit(units, { name: 'Height', value: cabinet.height, ...CABINET_DIMENSION, apply: setCabinet('height') }),
    depth: edit(units, { name: 'Depth', value: cabinet.depth, ...CABINET_DIMENSION, apply: setCabinet('depth') }),
    'floor-height': edit(units, { name: 'Floor height', value: cabinet.floorHeight, ...FLOOR_HEIGHT, apply: setCabinet('floorHeight') }),
    'toe-kick': edit(units, {
      name: 'Toe kick height',
      value: kick.height,
      min: 0,
      max: MAX_LENGTH,
      apply: (height) => {
        actions.updateConstruction(cabinet.id, { toeKick: { ...kick, height } })
        return null
      },
    }),
    ...Object.fromEntries(frontEdits(project, cabinet, build, actions)),
  }
}
