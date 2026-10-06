/**
 * Pure, immutable Project edits for handle types (pull items with a
 * `HandleSpec`). Same contract as `costOps`: a new Project, or the same
 * reference when nothing changed; inputs are never mutated.
 */
import type { HandleSpec, HandleStyle, HardwareItem, Id, ModelFormat, ModelUnit, Project, Vec3 } from '@/core/types'
import { MM_PER_MODEL_UNIT } from '@/core/units'
import { canAddHardware } from './costOps'
import { guessModelUnit } from './models/units'
import { uniqueId, uniqueName } from './projectOps'

export const HANDLE_STYLE_LABEL: Readonly<Record<HandleStyle, string>> = {
  bar: 'Bar pull',
  knob: 'Knob',
  edge: 'Edge pull',
  cup: 'Cup pull',
  'j-profile': 'J-profile',
  custom: 'Custom model',
}

/** Hole centres a new handle of each style starts with (0: one hole or none). Typical 32 mm-system sizes. */
const NEW_HANDLE_CENTERS: Readonly<Record<HandleStyle, number>> = {
  bar: 128,
  knob: 0,
  edge: 128,
  cup: 96,
  'j-profile': 0,
  custom: 0,
}

const NEW_HANDLE_NAME: Readonly<Record<HandleStyle, string>> = {
  bar: 'New bar pull',
  knob: 'New knob',
  edge: 'New edge pull',
  cup: 'New cup pull',
  'j-profile': 'New J-profile',
  custom: 'New custom handle',
}

/** Patch for a handle; a key set to `undefined` removes that field (back to the style default). */
export type HandlePatch = Partial<HandleSpec>

/** An imported model file, as `modelImport` reads it. */
export interface HandleModelFile {
  name: string
  format: ModelFormat
  blobId: Id
  nativeSize: Vec3
}

/** Sizes a model's own size replaces when it becomes the handle. */
const MODEL_SIZED: readonly (keyof HandleSpec)[] = ['length', 'width', 'diameter', 'projection']

function withoutUndefined(spec: HandleSpec): HandleSpec {
  return Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined)) as unknown as HandleSpec
}

function appendPull(project: Project, name: string, centers: number, handle: HandleSpec): { project: Project; id: Id | null } {
  if (!canAddHardware(project)) return { project, id: null }
  const id = uniqueId('hw', new Set(project.hardware.map((h) => h.id)))
  const item: HardwareItem = {
    id,
    kind: 'pull',
    name: uniqueName(name, project.hardware.map((h) => h.name)),
    manufacturer: '',
    sku: '',
    unitCost: 0,
    props: { centers },
    handle,
  }
  return { project: { ...project, hardware: [...project.hardware, item] }, id }
}

/** A new handle type of `style` with the style's default sizes. */
export function addHandleItem(project: Project, style: HandleStyle): { project: Project; id: Id | null } {
  return appendPull(project, NEW_HANDLE_NAME[style], NEW_HANDLE_CENTERS[style], { style })
}

function modelFields(model: HandleModelFile, unit: ModelUnit): Pick<HandleSpec, 'blobId' | 'format' | 'unit' | 'nativeSize'> {
  return { blobId: model.blobId, format: model.format, unit, nativeSize: { ...model.nativeSize } }
}

/** A new custom handle showing an imported model (one centre hole until centres are set). */
export function addCustomHandle(project: Project, model: HandleModelFile, unit: ModelUnit): { project: Project; id: Id | null } {
  return appendPull(project, model.name, NEW_HANDLE_CENTERS.custom, { style: 'custom', ...modelFields(model, unit) })
}

function mapPull(project: Project, id: Id, fn: (item: HardwareItem) => HardwareItem): Project {
  if (!project.hardware.some((h) => h.id === id && h.kind === 'pull')) return project
  return { ...project, hardware: project.hardware.map((h) => (h.id === id ? fn(h) : h)) }
}

/** Edit a pull's handle; a pull without one is a bar. Not a pull: same project. */
export function updateHandle(project: Project, id: Id, patch: HandlePatch): Project {
  return mapPull(project, id, (h) => ({ ...h, handle: withoutUndefined({ ...(h.handle ?? { style: 'bar' }), ...patch }) }))
}

/** Show an imported model on a pull: it becomes a custom handle sized by the model (colour kept). */
export function setHandleModel(project: Project, id: Id, model: HandleModelFile, unit: ModelUnit): Project {
  return mapPull(project, id, (h) => {
    const kept = Object.fromEntries(Object.entries(h.handle ?? {}).filter(([k]) => !MODEL_SIZED.includes(k as keyof HandleSpec)))
    return { ...h, handle: withoutUndefined({ ...kept, style: 'custom', ...modelFields(model, unit) }) }
  })
}

/** Handles are a few centimetres to half a metre long (mm). */
const PLAUSIBLE_HANDLE_MM = { min: 8, max: 600 }
const UNIT_ORDER: readonly ModelUnit[] = ['m', 'cm', 'mm', 'in']

/**
 * Unit to read a handle model in: the usual model guess when that gives a
 * handle-sized object, else the first unit that does (a 1-unit glTF cube is
 * 10 mm, not 1 m). Falls back to millimetres.
 */
export function guessHandleUnit(format: ModelFormat, nativeSize: Vec3): ModelUnit {
  const largest = Math.max(nativeSize.x, nativeSize.y, nativeSize.z)
  if (!Number.isFinite(largest) || largest <= 0) return 'mm'
  const fits = (u: ModelUnit): boolean => {
    const mm = largest * MM_PER_MODEL_UNIT[u]
    return mm >= PLAUSIBLE_HANDLE_MM.min && mm <= PLAUSIBLE_HANDLE_MM.max
  }
  const preferred = guessModelUnit(format, nativeSize)
  return fits(preferred) ? preferred : (UNIT_ORDER.find(fits) ?? 'mm')
}
