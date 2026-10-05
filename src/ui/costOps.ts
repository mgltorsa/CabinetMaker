/**
 * Pure, immutable Project edits for the cost drivers: the hardware catalog
 * (02·5) and the estimate's extra charges (03·3). Same contract as
 * `projectOps`: each returns a new Project, or the same reference when nothing
 * changed, and never mutates its input.
 *
 * Catalog edits never leave a cabinet pointing at a missing item or an item of
 * the wrong kind: an item a cabinet uses cannot be deleted or change kind; it
 * can only be replaced by another item of its kind (or by no pull).
 */
import type { Cabinet, ExtraCharge, HardwareItem, HardwareKind, Id, Project } from '@/core/types'
import { MAX_CATALOG_ITEMS, MAX_EXTRA_CHARGES } from './lib/limits'
import { uniqueId, uniqueName } from './projectOps'

// ─── Hardware catalog ───────────────────────────────────────────────────────

/** Cabinet fields that reference catalog hardware, and the kind each expects. */
export type HardwareSlot = keyof Cabinet['hardware']

export const SLOT_KIND: Readonly<Record<HardwareSlot, HardwareKind>> = {
  hingeId: 'hinge',
  slideId: 'slide',
  pullId: 'pull',
  shelfPinId: 'shelf-pin',
}

const SLOTS = Object.keys(SLOT_KIND) as HardwareSlot[]

/**
 * Props a new item of each kind starts with (mirrors the default catalog; see
 * `core/defaults`). Slide `mount`: 0 undermount, 1 side mount.
 */
export const DEFAULT_HARDWARE_PROPS: Readonly<Record<HardwareKind, Readonly<Record<string, number>>>> = {
  hinge: { openingAngle: 110, cupDiameter: 35 },
  'hinge-plate': { height: 0 },
  slide: { length: 457, mount: 0 },
  pull: { centers: 128 },
  'shelf-pin': { diameter: 5 },
  dowel: { diameter: 8, length: 30 },
  domino: { thickness: 5, length: 30 },
  leg: {},
  screw: {},
  other: {},
  'rod-support': { diameter: 25 },
}

export const HARDWARE_KIND_LABEL: Readonly<Record<HardwareKind, string>> = {
  hinge: 'Hinge',
  'hinge-plate': 'Hinge plate',
  slide: 'Drawer slide',
  pull: 'Pull',
  'shelf-pin': 'Shelf pin',
  dowel: 'Dowel',
  domino: 'Domino tenon',
  leg: 'Leg',
  screw: 'Screw',
  other: 'Other',
  'rod-support': 'Rod support',
}

export interface HardwareUse {
  cabinetId: Id
  cabinetName: string
  slot: HardwareSlot
}

/** Every cabinet slot that references `hardwareId`, in cabinet order. */
export function hardwareUses(project: Project, hardwareId: Id): HardwareUse[] {
  return project.cabinets.flatMap((c) =>
    SLOTS.filter((slot) => c.hardware[slot] === hardwareId).map((slot) => ({ cabinetId: c.id, cabinetName: c.name, slot })),
  )
}

export type HardwarePatch = Partial<Omit<HardwareItem, 'id' | 'props'>>

function findItem(project: Project, id: Id): HardwareItem | undefined {
  return project.hardware.find((h) => h.id === id)
}

function mapItem(project: Project, id: Id, fn: (item: HardwareItem) => HardwareItem): Project {
  if (!findItem(project, id)) return project
  return { ...project, hardware: project.hardware.map((h) => (h.id === id ? fn(h) : h)) }
}

export function canAddHardware(project: Project): boolean {
  return project.hardware.length < MAX_CATALOG_ITEMS
}

function freshHardwareId(project: Project): Id {
  return uniqueId('hw', new Set(project.hardware.map((h) => h.id)))
}

export function addHardwareItem(project: Project, kind: HardwareKind): { project: Project; id: Id | null } {
  if (!canAddHardware(project)) return { project, id: null }
  const id = freshHardwareId(project)
  const item: HardwareItem = {
    id,
    kind,
    name: uniqueName(`New ${HARDWARE_KIND_LABEL[kind].toLowerCase()}`, project.hardware.map((h) => h.name)),
    manufacturer: '',
    sku: '',
    unitCost: 0,
    props: { ...DEFAULT_HARDWARE_PROPS[kind] },
  }
  return { project: { ...project, hardware: [...project.hardware, item] }, id }
}

/**
 * Edit catalog fields. A kind change resets props to the new kind's defaults
 * and is refused (same project returned) while a cabinet uses the item.
 */
export function updateHardwareItem(project: Project, id: Id, patch: HardwarePatch): Project {
  const item = findItem(project, id)
  if (!item) return project
  const changesKind = patch.kind !== undefined && patch.kind !== item.kind
  if (changesKind && hardwareUses(project, id).length > 0) return project
  return mapItem(project, id, (h) => ({ ...h, ...patch, props: changesKind && patch.kind ? { ...DEFAULT_HARDWARE_PROPS[patch.kind] } : h.props }))
}

export function setHardwareProp(project: Project, id: Id, key: string, value: number): Project {
  return mapItem(project, id, (h) => ({ ...h, props: { ...h.props, [key]: value } }))
}

/** Copy with a fresh id and name, inserted after the source. */
export function duplicateHardwareItem(project: Project, id: Id): { project: Project; copyId: Id | null } {
  const index = project.hardware.findIndex((h) => h.id === id)
  const source = project.hardware[index]
  if (!source || !canAddHardware(project)) return { project, copyId: null }
  const copyId = freshHardwareId(project)
  const copy: HardwareItem = {
    ...source,
    id: copyId,
    name: uniqueName(`${source.name} copy`, project.hardware.map((h) => h.name)),
    props: { ...source.props },
  }
  const hardware = [...project.hardware.slice(0, index + 1), copy, ...project.hardware.slice(index + 1)]
  return { project: { ...project, hardware }, copyId }
}

/** Remove an unused item; an item a cabinet uses must be replaced instead. */
export function deleteHardwareItem(project: Project, id: Id): Project {
  if (!findItem(project, id) || hardwareUses(project, id).length > 0) return project
  return { ...project, hardware: project.hardware.filter((h) => h.id !== id) }
}

/** Items that can take over from `id`: the other catalog items of its kind. */
export function replacementCandidates(project: Project, id: Id): HardwareItem[] {
  const item = findItem(project, id)
  if (!item) return []
  return project.hardware.filter((h) => h.kind === item.kind && h.id !== id)
}

/**
 * Point every cabinet that uses `id` at `replacementId`, then delete `id`.
 * The replacement must be another item of the same kind; `null` (no pull) is
 * accepted for pulls only. Anything else returns the same project.
 */
export function replaceHardwareItem(project: Project, id: Id, replacementId: Id | null): Project {
  const item = findItem(project, id)
  if (!item) return project
  const isValid =
    replacementId === null
      ? // Only the pull slot may be empty; a (mis)use in any other slot needs a real item.
        item.kind === 'pull' && hardwareUses(project, id).every((u) => u.slot === 'pullId')
      : replacementCandidates(project, id).some((h) => h.id === replacementId)
  if (!isValid) return project
  const swap = (current: Id): Id => (current === id && replacementId !== null ? replacementId : current)
  const reassign = (cab: Cabinet): Cabinet => {
    if (!SLOTS.some((slot) => cab.hardware[slot] === id)) return cab
    const hw = cab.hardware
    return {
      ...cab,
      hardware: { hingeId: swap(hw.hingeId), slideId: swap(hw.slideId), shelfPinId: swap(hw.shelfPinId), pullId: hw.pullId === id ? replacementId : hw.pullId },
    }
  }
  return { ...project, cabinets: project.cabinets.map(reassign), hardware: project.hardware.filter((h) => h.id !== id) }
}

// ─── Extra charges ──────────────────────────────────────────────────────────

const NEW_EXTRA_LABEL = 'Extra charge'

export type ExtraChargePatch = Partial<Omit<ExtraCharge, 'id'>>

function extrasOf(project: Project): ExtraCharge[] {
  return project.estimate.extras ?? []
}

function withExtras(project: Project, extras: ExtraCharge[]): Project {
  return { ...project, estimate: { ...project.estimate, extras } }
}

export function canAddExtraCharge(project: Project): boolean {
  return extrasOf(project).length < MAX_EXTRA_CHARGES
}

/** Append a one-off (`1 job × 0`) line with a unique label. */
export function addExtraCharge(project: Project): { project: Project; id: Id | null } {
  if (!canAddExtraCharge(project)) return { project, id: null }
  const extras = extrasOf(project)
  const id = uniqueId('xc', new Set(extras.map((x) => x.id)))
  const label = uniqueName(NEW_EXTRA_LABEL, extras.map((x) => x.label))
  return { project: withExtras(project, [...extras, { id, label, qty: 1, unit: 'job', unitCost: 0 }]), id }
}

export function updateExtraCharge(project: Project, id: Id, patch: ExtraChargePatch): Project {
  const extras = extrasOf(project)
  if (!extras.some((x) => x.id === id)) return project
  return withExtras(project, extras.map((x) => (x.id === id ? { ...x, ...patch } : x)))
}

export function removeExtraCharge(project: Project, id: Id): Project {
  const extras = extrasOf(project)
  const next = extras.filter((x) => x.id !== id)
  return next.length === extras.length ? project : withExtras(project, next)
}
