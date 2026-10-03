/**
 * Pure, immutable Project edits used by the store. Each returns a new Project
 * (or the same reference when nothing changed) and never mutates its input.
 * Count limits (`lib/limits`) are enforced here so the editor can never build
 * a project the validator would reject on reload.
 */
import { newBay, newSection } from '@/core/defaults'
import { newId } from '@/core/ids'
import type {
  Bay,
  BayKind,
  Cabinet,
  ConstructionMethod,
  EstimateSettings,
  Id,
  Machine,
  NestSettings,
  Project,
  Section,
  SlideMount,
  Tool,
} from '@/core/types'
import { MAX_BAYS, MAX_CABINETS, MAX_SECTIONS } from './lib/limits'
import { slideForMount } from './lib/slides'

export type CabinetPatch = Partial<Pick<Cabinet, 'name' | 'type' | 'width' | 'height' | 'depth' | 'floorHeight'>>
export type BayPatch = Partial<Omit<Bay, 'id'>>
export type SectionPatch = Partial<Pick<Section, 'width'>>

export function mapCabinet(project: Project, cabinetId: Id, fn: (cab: Cabinet) => Cabinet): Project {
  let changed = false
  const cabinets = project.cabinets.map((cab) => {
    if (cab.id !== cabinetId) return cab
    const next = fn(cab)
    changed = changed || next !== cab
    return next
  })
  return changed ? { ...project, cabinets } : project
}

function mapSection(project: Project, cabinetId: Id, sectionId: Id, fn: (s: Section) => Section): Project {
  return mapCabinet(project, cabinetId, (cab) => ({
    ...cab,
    sections: cab.sections.map((s) => (s.id === sectionId ? fn(s) : s)),
  }))
}

/** Move the item with `id` by `delta` positions; out-of-range moves are no-ops. */
export function moveById<T extends { id: Id }>(items: readonly T[], id: Id, delta: number): T[] {
  const from = items.findIndex((it) => it.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= items.length) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item) next.splice(to, 0, item)
  return next
}

/** A fresh id with `prefix` that is not in `taken`. */
export function uniqueId(prefix: string, taken: ReadonlySet<Id>): Id {
  let id = newId(prefix)
  while (taken.has(id)) id = newId(prefix)
  return id
}

/** `base`, or `base 2`, `base 3`… so names stay distinguishable in the list. */
export function uniqueName(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base} ${n}`)) n++
  return `${base} ${n}`
}

export function updateCabinet(project: Project, cabinetId: Id, patch: CabinetPatch): Project {
  return mapCabinet(project, cabinetId, (cab) => ({ ...cab, ...patch }))
}

export function updateConstruction(project: Project, cabinetId: Id, patch: Partial<ConstructionMethod>): Project {
  return mapCabinet(project, cabinetId, (cab) => ({ ...cab, construction: { ...cab.construction, ...patch } }))
}

export function updateCabinetHardware(project: Project, cabinetId: Id, patch: Partial<Cabinet['hardware']>): Project {
  return mapCabinet(project, cabinetId, (cab) => ({ ...cab, hardware: { ...cab.hardware, ...patch } }))
}

export function updateCabinetTop(project: Project, cabinetId: Id, patch: Partial<Cabinet['top']>): Project {
  return mapCabinet(project, cabinetId, (cab) => ({ ...cab, top: { ...cab.top, ...patch } }))
}

/** Change the drawer slide mount, moving the cabinet onto a slide of that mount when one exists. */
export function setSlideMount(project: Project, cabinetId: Id, mount: SlideMount): Project {
  return mapCabinet(project, cabinetId, (cab) => ({
    ...cab,
    construction: { ...cab.construction, drawer: { ...cab.construction.drawer, slideMount: mount } },
    hardware: { ...cab.hardware, slideId: slideForMount(project.hardware, mount, cab.hardware.slideId) },
  }))
}

export function canAddCabinet(project: Project): boolean {
  return project.cabinets.length < MAX_CABINETS
}

export function addCabinet(project: Project, cabinet: Cabinet): Project {
  if (!canAddCabinet(project)) return project
  const taken = new Set(project.cabinets.map((c) => c.id))
  const id = taken.has(cabinet.id) ? uniqueId('cab', taken) : cabinet.id
  const name = uniqueName(cabinet.name, project.cabinets.map((c) => c.name))
  return { ...project, cabinets: [...project.cabinets, { ...cabinet, id, name }] }
}

/** Deep copy with fresh cabinet/section/bay ids, inserted after the source. */
export function duplicateCabinet(project: Project, cabinetId: Id): { project: Project; copyId: Id | null } {
  const index = project.cabinets.findIndex((c) => c.id === cabinetId)
  const source = project.cabinets[index]
  if (!source || !canAddCabinet(project)) return { project, copyId: null }
  const id = uniqueId('cab', new Set(project.cabinets.map((c) => c.id)))
  const copy: Cabinet = {
    ...structuredClone(source),
    id,
    name: uniqueName(`${source.name} copy`, project.cabinets.map((c) => c.name)),
    sections: source.sections.map((s) => ({
      ...structuredClone(s),
      id: newId('sec'),
      bays: s.bays.map((b) => ({ ...b, id: newId('bay') })),
    })),
  }
  const cabinets = [...project.cabinets.slice(0, index + 1), copy, ...project.cabinets.slice(index + 1)]
  return { project: { ...project, cabinets }, copyId: id }
}

export function deleteCabinet(project: Project, cabinetId: Id): Project {
  const cabinets = project.cabinets.filter((c) => c.id !== cabinetId)
  return cabinets.length === project.cabinets.length ? project : { ...project, cabinets }
}

// ─── Sections & bays ────────────────────────────────────────────────────────

export function addSection(project: Project, cabinetId: Id): Project {
  return mapCabinet(project, cabinetId, (cab) =>
    cab.sections.length >= MAX_SECTIONS ? cab : { ...cab, sections: [...cab.sections, newSection([newBay('door', null, 1)])] },
  )
}

/** A cabinet always keeps at least one section. */
export function removeSection(project: Project, cabinetId: Id, sectionId: Id): Project {
  return mapCabinet(project, cabinetId, (cab) =>
    cab.sections.length <= 1 ? cab : { ...cab, sections: cab.sections.filter((s) => s.id !== sectionId) },
  )
}

export function moveSection(project: Project, cabinetId: Id, sectionId: Id, delta: number): Project {
  return mapCabinet(project, cabinetId, (cab) => ({ ...cab, sections: moveById(cab.sections, sectionId, delta) }))
}

export function updateSection(project: Project, cabinetId: Id, sectionId: Id, patch: SectionPatch): Project {
  return mapSection(project, cabinetId, sectionId, (s) => ({ ...s, ...patch }))
}

export function addBay(project: Project, cabinetId: Id, sectionId: Id, kind: BayKind): Project {
  return mapSection(project, cabinetId, sectionId, (s) => (s.bays.length >= MAX_BAYS ? s : { ...s, bays: [...s.bays, newBay(kind)] }))
}

/** A section always keeps at least one bay. */
export function removeBay(project: Project, cabinetId: Id, sectionId: Id, bayId: Id): Project {
  return mapSection(project, cabinetId, sectionId, (s) =>
    s.bays.length <= 1 ? s : { ...s, bays: s.bays.filter((b) => b.id !== bayId) },
  )
}

export function moveBay(project: Project, cabinetId: Id, sectionId: Id, bayId: Id, delta: number): Project {
  return mapSection(project, cabinetId, sectionId, (s) => ({ ...s, bays: moveById(s.bays, bayId, delta) }))
}

export function updateBay(project: Project, cabinetId: Id, sectionId: Id, bayId: Id, patch: BayPatch): Project {
  return mapSection(project, cabinetId, sectionId, (s) => ({
    ...s,
    bays: s.bays.map((b) => (b.id === bayId ? { ...b, ...patch } : b)),
  }))
}

// ─── Project-level settings ─────────────────────────────────────────────────

export function updateMachine(project: Project, patch: Partial<Machine>): Project {
  return { ...project, machine: { ...project.machine, ...patch } }
}

export function updateTool(project: Project, toolId: Id, patch: Partial<Omit<Tool, 'id'>>): Project {
  return { ...project, tools: project.tools.map((t) => (t.id === toolId ? { ...t, ...patch } : t)) }
}

export function updateNest(project: Project, patch: Partial<NestSettings>): Project {
  return { ...project, nest: { ...project.nest, ...patch } }
}

export function updateEstimate(project: Project, patch: Partial<Omit<EstimateSettings, 'labor'>>): Project {
  return { ...project, estimate: { ...project.estimate, ...patch } }
}

export function updateLabor(project: Project, patch: Partial<EstimateSettings['labor']>): Project {
  return { ...project, estimate: { ...project.estimate, labor: { ...project.estimate.labor, ...patch } } }
}

// ─── Quick edits (simple sidebar cards) ─────────────────────────────────────

/**
 * Set the number of drawers in a section. New drawers go right after the last
 * existing drawer (or at the top); removing takes the lowest drawers first. A
 * section never ends up empty: removing its only bays leaves one open bay.
 */
export function setDrawerCount(project: Project, cabinetId: Id, sectionId: Id, count: number): Project {
  return mapSection(project, cabinetId, sectionId, (s) => {
    const drawers = s.bays.filter((b) => b.kind === 'drawer')
    const target = Math.max(0, Math.min(Math.floor(count), MAX_BAYS - (s.bays.length - drawers.length)))
    if (target === drawers.length) return s
    if (target > drawers.length) {
      const lastDrawer = s.bays.map((b) => b.kind).lastIndexOf('drawer')
      const added = Array.from({ length: target - drawers.length }, () => newBay('drawer'))
      const at = lastDrawer + 1
      return { ...s, bays: [...s.bays.slice(0, at), ...added, ...s.bays.slice(at)] }
    }
    const remove = new Set(drawers.slice(target).map((b) => b.id))
    const bays = s.bays.filter((b) => !remove.has(b.id))
    return { ...s, bays: bays.length > 0 ? bays : [newBay('open', null, 1)] }
  })
}
