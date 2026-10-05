/**
 * Pure, immutable Project edits used by the store. Each returns a new Project
 * (or the same reference when nothing changed) and never mutates its input.
 * Count limits (`lib/limits`) are enforced here so the editor can never build
 * a project the validator would reject on reload.
 */
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS, DEFAULT_ROD_MATERIAL_ID, newBay, newSection } from '@/core/defaults'
import { newId } from '@/core/ids'
import type {
  Bay,
  BayKind,
  Cabinet,
  ConstructionMethod,
  EstimateSettings,
  HangingRod,
  Id,
  LinearMaterial,
  Machine,
  Material,
  NestSettings,
  Project,
  Section,
  SheetMaterial,
  SlideMount,
  Tool,
} from '@/core/types'
import { MAX_BAYS, MAX_CABINETS, MAX_CATALOG_ITEMS, MAX_SECTIONS } from './lib/limits'
import { type MaterialUseField, nextMaterialColor } from './lib/materials'
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
  return { ...project, cabinets: [...project.cabinets, { ...withKnownMaterials(project, cabinet), id, name }] }
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

// ─── Material library ───────────────────────────────────────────────────────

export type MaterialPatch = Partial<Omit<SheetMaterial, 'id' | 'kind'>> | Partial<Omit<LinearMaterial, 'id' | 'kind'>>

/** Editable keys per kind; anything else in a patch is ignored so a material never gains foreign fields. */
const MATERIAL_KEYS: { sheet: readonly (keyof SheetMaterial)[]; linear: readonly (keyof LinearMaterial)[] } = {
  sheet: ['name', 'thickness', 'sheetLength', 'sheetWidth', 'grained', 'costPerSheet', 'color'],
  linear: ['name', 'thickness', 'width', 'stockLength', 'costPerMetre', 'color'],
}

type ConstructionMaterialKey = 'carcassMaterialId' | 'backMaterialId' | 'frontMaterialId' | 'drawerBoxMaterialId' | 'drawerBottomMaterialId' | 'faceFrameMaterialId'

/** Construction fields that hold a material id, in the order uses are listed. */
const CONSTRUCTION_MATERIAL_FIELDS: readonly [Exclude<MaterialUseField, 'top'>, ConstructionMaterialKey][] = [
  ['carcass', 'carcassMaterialId'],
  ['back', 'backMaterialId'],
  ['fronts', 'frontMaterialId'],
  ['drawerBox', 'drawerBoxMaterialId'],
  ['drawerBottom', 'drawerBottomMaterialId'],
  ['faceFrame', 'faceFrameMaterialId'],
]

/** Kind a construction field expects (face frames are cut from linear stock). */
const fieldKind = (key: ConstructionMaterialKey): Material['kind'] => (key === 'faceFrameMaterialId' ? 'linear' : 'sheet')

const NEW_MATERIAL_NAME: Record<Material['kind'], string> = { sheet: 'New sheet material', linear: 'New linear stock' }
/** Starting stock for a new material: a 4×8 (2440 × 1220) 18 mm sheet and 19 × 63 mm boards, like the default catalog. */
const NEW_SHEET = { thickness: 18, sheetLength: 2440, sheetWidth: 1220, grained: true, costPerSheet: 0 } as const
const NEW_LINEAR = { thickness: 19, width: 63, stockLength: 2440, costPerMetre: 0 } as const
/** Longest slug part of a material id, so ids stay readable in sheet labels and G-code comments. */
const MAX_SLUG_LENGTH = 24

/** Lowercase ascii words joined by dashes, e.g. "Walnut ply 19" → "walnut-ply-19". */
export function materialSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '')
  return slug === '' ? 'material' : slug
}

/** Slug of `name` plus a short random suffix, never one of `taken`. */
export function newMaterialId(name: string, taken: ReadonlySet<Id>): Id {
  return uniqueId(materialSlug(name), taken)
}

function canAddMaterial(project: Project): boolean {
  return project.materials.length < MAX_CATALOG_ITEMS
}

/** A new material of `kind` with defaults that fit the machine table and a fresh palette colour. */
function newMaterial(project: Project, kind: Material['kind']): Material {
  const name = uniqueName(NEW_MATERIAL_NAME[kind], project.materials.map((m) => m.name))
  const id = newMaterialId(name, new Set(project.materials.map((m) => m.id)))
  const color = nextMaterialColor(project.materials)
  if (kind === 'linear') return { kind, id, name, ...NEW_LINEAR, color }
  const { tableX, tableY } = project.machine
  // Shrink to the machine table so a new sheet never starts with a CAM warning.
  return { kind, id, name, ...NEW_SHEET, sheetLength: Math.min(NEW_SHEET.sheetLength, tableX), sheetWidth: Math.min(NEW_SHEET.sheetWidth, tableY), color }
}

export function addMaterial(project: Project, kind: Material['kind']): { project: Project; materialId: Id | null } {
  if (!canAddMaterial(project)) return { project, materialId: null }
  const material = newMaterial(project, kind)
  return { project: { ...project, materials: [...project.materials, material] }, materialId: material.id }
}

/** Patch a material's own fields; `color: undefined` removes the colour (back to the finish colour). */
export function updateMaterial(project: Project, materialId: Id, patch: MaterialPatch): Project {
  const source = project.materials.find((m) => m.id === materialId)
  if (!source) return project
  const allowed: readonly string[] = MATERIAL_KEYS[source.kind]
  const picked = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)))
  // Safe: `picked` holds only keys of `source.kind`, typed by MaterialPatch.
  const { color, ...rest } = { ...source, ...picked } as Material
  const next = (color === undefined ? rest : { ...rest, color }) as Material
  return { ...project, materials: project.materials.map((m) => (m.id === materialId ? next : m)) }
}

/** Copy with a fresh id, name and colour, inserted after the source. */
export function duplicateMaterial(project: Project, materialId: Id): { project: Project; copyId: Id | null } {
  const index = project.materials.findIndex((m) => m.id === materialId)
  const source = project.materials[index]
  if (!source || !canAddMaterial(project)) return { project, copyId: null }
  const name = uniqueName(`${source.name} copy`, project.materials.map((m) => m.name))
  const copy: Material = { ...source, id: newMaterialId(name, new Set(project.materials.map((m) => m.id))), name, color: nextMaterialColor(project.materials) }
  const materials = [...project.materials.slice(0, index + 1), copy, ...project.materials.slice(index + 1)]
  return { project: { ...project, materials }, copyId: copy.id }
}

export interface MaterialUse {
  cabinetId: Id
  cabinetName: string
  fields: MaterialUseField[]
}

/** Every cabinet that references `materialId`, with the fields that do. */
export function materialUses(project: Project, materialId: Id): MaterialUse[] {
  return project.cabinets.flatMap((cab) => {
    const fields: MaterialUseField[] = CONSTRUCTION_MATERIAL_FIELDS.filter(([, key]) => cab.construction[key] === materialId).map(([field]) => field)
    if (cab.top.materialId === materialId) fields.push('top')
    return fields.length > 0 ? [{ cabinetId: cab.id, cabinetName: cab.name, fields }] : []
  })
}

/** Point every use of `fromId` at `toId`. No-op unless both exist, differ and are the same kind. */
export function replaceMaterialUses(project: Project, fromId: Id, toId: Id): Project {
  const from = project.materials.find((m) => m.id === fromId)
  const to = project.materials.find((m) => m.id === toId)
  if (!from || !to || from.id === to.id || from.kind !== to.kind) return project
  if (materialUses(project, fromId).length === 0) return project
  const swap = (id: Id): Id => (id === fromId ? toId : id)
  const cabinets = project.cabinets.map((cab) => {
    const construction = { ...cab.construction }
    for (const [, key] of CONSTRUCTION_MATERIAL_FIELDS) construction[key] = swap(construction[key])
    const top = cab.top.materialId === null ? cab.top : { ...cab.top, materialId: swap(cab.top.materialId) }
    return { ...cab, construction, top }
  })
  return { ...project, cabinets }
}

/** Why a material cannot be deleted. */
export type MaterialDeleteBlock = 'missing' | 'last-of-kind' | 'in-use'

/** The reason `materialId` cannot be deleted, or null when it can. */
export function materialDeleteBlock(project: Project, materialId: Id): MaterialDeleteBlock | null {
  const material = project.materials.find((m) => m.id === materialId)
  if (!material) return 'missing'
  // New cabinets fall back to the first material of a kind, so one must remain.
  if (!project.materials.some((m) => m.id !== materialId && m.kind === material.kind)) return 'last-of-kind'
  return materialUses(project, materialId).length > 0 ? 'in-use' : null
}

/**
 * Delete a material. With `replacementId`, every use first moves to that
 * material (same kind). Blocked (same project returned) while anything still
 * uses it, so no cabinet is ever left with a dangling material id.
 */
export function deleteMaterial(project: Project, materialId: Id, replacementId?: Id): Project {
  const replaced = replacementId === undefined ? project : replaceMaterialUses(project, materialId, replacementId)
  if (materialDeleteBlock(replaced, materialId) !== null) return project
  return { ...replaced, materials: replaced.materials.filter((m) => m.id !== materialId) }
}

/** The cabinet with unknown material ids moved to the project's first material of the expected kind. */
function withKnownMaterials(project: Project, cabinet: Cabinet): Cabinet {
  const known = new Set(project.materials.map((m) => m.id))
  const firstOf = (kind: Material['kind']): Id | undefined => project.materials.find((m) => m.kind === kind)?.id
  const resolve = (id: Id, kind: Material['kind']): Id => (known.has(id) ? id : (firstOf(kind) ?? firstOf('sheet') ?? id))
  const construction = { ...cabinet.construction }
  for (const [, key] of CONSTRUCTION_MATERIAL_FIELDS) construction[key] = resolve(construction[key], fieldKind(key))
  const topId = cabinet.top.materialId
  const top = topId === null || known.has(topId) ? cabinet.top : { ...cabinet.top, materialId: null }
  return { ...cabinet, construction, top }
}

// ─── Hanging rods ───────────────────────────────────────────────────────────

function withRod(bay: Bay, rod: HangingRod | null): Bay {
  if (rod !== null) return { ...bay, rod: { ...rod } }
  const copy: Bay = { ...bay }
  delete copy.rod
  return copy
}

/** Give a door/open bay a hanging rod, or remove it (`null` drops the key entirely). */
export function setBayRod(project: Project, cabinetId: Id, sectionId: Id, bayId: Id, rod: HangingRod | null): Project {
  return mapSection(project, cabinetId, sectionId, (s) => ({ ...s, bays: s.bays.map((b) => (b.id === bayId ? withRod(b, rod) : b)) }))
}

function usesRods(cabinet: Cabinet): boolean {
  return cabinet.sections.some((s) => s.bays.some((b) => b.kind !== 'drawer' && b.rod !== undefined))
}

/**
 * Projects saved before rods existed have no rod stock or rod supports. When a
 * cabinet uses rods, add the defaults that are missing (the default rod
 * material only when it is the one referenced), so the estimate can bill them.
 * Returns the same reference when nothing is missing.
 */
export function ensureRodCatalog(project: Project): Project {
  const rodCabinets = project.cabinets.filter(usesRods)
  if (rodCabinets.length === 0) return project
  const needsDefaultRod =
    rodCabinets.some((c) => (c.construction.rodMaterialId ?? DEFAULT_ROD_MATERIAL_ID) === DEFAULT_ROD_MATERIAL_ID) &&
    !project.materials.some((m) => m.id === DEFAULT_ROD_MATERIAL_ID)
  const needsSupports = !project.hardware.some((h) => h.kind === 'rod-support')
  if (!needsDefaultRod && !needsSupports) return project
  return {
    ...project,
    materials: needsDefaultRod ? [...project.materials, ...structuredClone(DEFAULT_MATERIALS.filter((m) => m.id === DEFAULT_ROD_MATERIAL_ID))] : project.materials,
    hardware: needsSupports ? [...project.hardware, ...structuredClone(DEFAULT_HARDWARE.filter((h) => h.kind === 'rod-support'))] : project.hardware,
  }
}
