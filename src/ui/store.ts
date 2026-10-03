/**
 * Designer state (zustand). Holds the persisted `Project` plus transient UI
 * selection and view toggles. Every action is an immutable update through the
 * pure helpers in `projectOps`.
 */
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { createProject } from '@/core/defaults'
import type { BayKind, Cabinet, CabinetType, ConstructionMethod, EstimateSettings, Id, Machine, NestSettings, Project, Tool, UnitSystem } from '@/core/types'
import { createPreset } from '@/engine/presets'
import { browserStorage, loadProject } from './persistence'
import * as ops from './projectOps'

export interface ViewToggles {
  /** Doors and drawer fronts. */
  fronts: boolean
  drawerBoxes: boolean
  back: boolean
  /** Countertop / finished top. */
  top: boolean
  /** Slide drawers out along +Z. */
  open: boolean
}

export type ViewToggle = keyof ViewToggles

export const DEFAULT_VIEW: ViewToggles = { fronts: true, drawerBoxes: true, back: true, top: true, open: false }

export interface DesignerActions {
  /** Replace the whole project (load, import). Keeps a valid selection. */
  setProject: (project: Project) => void
  newProject: () => void
  setProjectName: (name: string) => void
  setUnits: (units: UnitSystem) => void
  selectCabinet: (id: Id | null) => void
  setViewToggle: (key: ViewToggle, value: boolean) => void

  addCabinetFromPreset: (type: CabinetType) => void
  duplicateCabinet: (id: Id) => void
  deleteCabinet: (id: Id) => void
  updateCabinet: (id: Id, patch: ops.CabinetPatch) => void
  updateConstruction: (id: Id, patch: Partial<ConstructionMethod>) => void
  updateCabinetHardware: (id: Id, patch: Parameters<typeof ops.updateCabinetHardware>[2]) => void
  updateCabinetTop: (id: Id, patch: Parameters<typeof ops.updateCabinetTop>[2]) => void

  addSection: (cabinetId: Id) => void
  removeSection: (cabinetId: Id, sectionId: Id) => void
  moveSection: (cabinetId: Id, sectionId: Id, delta: number) => void
  updateSection: (cabinetId: Id, sectionId: Id, patch: ops.SectionPatch) => void
  addBay: (cabinetId: Id, sectionId: Id, kind: BayKind) => void
  removeBay: (cabinetId: Id, sectionId: Id, bayId: Id) => void
  moveBay: (cabinetId: Id, sectionId: Id, bayId: Id, delta: number) => void
  updateBay: (cabinetId: Id, sectionId: Id, bayId: Id, patch: ops.BayPatch) => void

  updateMachine: (patch: Partial<Machine>) => void
  updateTool: (toolId: Id, patch: Partial<Omit<Tool, 'id'>>) => void
  updateNest: (patch: Partial<NestSettings>) => void
  updateEstimate: (patch: Partial<Omit<EstimateSettings, 'labor'>>) => void
  updateLabor: (patch: Partial<EstimateSettings['labor']>) => void
}

export interface DesignerState extends DesignerActions {
  project: Project
  selectedCabinetId: Id | null
  view: ViewToggles
}

export type DesignerStore = StoreApi<DesignerState>

function validSelection(project: Project, preferred: Id | null): Id | null {
  if (preferred !== null && project.cabinets.some((c) => c.id === preferred)) return preferred
  return project.cabinets[0]?.id ?? null
}

export function createDesignerStore(initial: Project = createProject()): DesignerStore {
  return createStore<DesignerState>()((set) => {
    /** Apply a pure project edit. */
    const edit = (fn: (p: Project) => Project): void => set((s) => ({ project: fn(s.project) }))

    return {
      project: initial,
      selectedCabinetId: validSelection(initial, null),
      view: DEFAULT_VIEW,

      setProject: (project) => set((s) => ({ project, selectedCabinetId: validSelection(project, s.selectedCabinetId) })),
      newProject: () => {
        const project = createProject()
        set({ project, selectedCabinetId: validSelection(project, null) })
      },
      setProjectName: (name) => edit((p) => ({ ...p, name })),
      setUnits: (units) => edit((p) => (p.units === units ? p : { ...p, units })),
      selectCabinet: (id) => set((s) => ({ selectedCabinetId: validSelection(s.project, id) })),
      setViewToggle: (key, value) => set((s) => ({ view: { ...s.view, [key]: value } })),

      addCabinetFromPreset: (type) =>
        set((s) => {
          const project = ops.addCabinet(s.project, createPreset(type))
          return { project, selectedCabinetId: project.cabinets.at(-1)?.id ?? s.selectedCabinetId }
        }),
      duplicateCabinet: (id) =>
        set((s) => {
          const { project, copyId } = ops.duplicateCabinet(s.project, id)
          return { project, selectedCabinetId: copyId ?? s.selectedCabinetId }
        }),
      deleteCabinet: (id) =>
        set((s) => {
          const index = s.project.cabinets.findIndex((c) => c.id === id)
          const project = ops.deleteCabinet(s.project, id)
          if (project === s.project) return {}
          // Keep the selection on a neighbour so the form does not jump to the top.
          const neighbour = project.cabinets[Math.min(index, project.cabinets.length - 1)]?.id ?? null
          const preferred = s.selectedCabinetId === id ? neighbour : s.selectedCabinetId
          return { project, selectedCabinetId: validSelection(project, preferred) }
        }),
      updateCabinet: (id, patch) => edit((p) => ops.updateCabinet(p, id, patch)),
      updateConstruction: (id, patch) => edit((p) => ops.updateConstruction(p, id, patch)),
      updateCabinetHardware: (id, patch) => edit((p) => ops.updateCabinetHardware(p, id, patch)),
      updateCabinetTop: (id, patch) => edit((p) => ops.updateCabinetTop(p, id, patch)),

      addSection: (cabinetId) => edit((p) => ops.addSection(p, cabinetId)),
      removeSection: (cabinetId, sectionId) => edit((p) => ops.removeSection(p, cabinetId, sectionId)),
      moveSection: (cabinetId, sectionId, delta) => edit((p) => ops.moveSection(p, cabinetId, sectionId, delta)),
      updateSection: (cabinetId, sectionId, patch) => edit((p) => ops.updateSection(p, cabinetId, sectionId, patch)),
      addBay: (cabinetId, sectionId, kind) => edit((p) => ops.addBay(p, cabinetId, sectionId, kind)),
      removeBay: (cabinetId, sectionId, bayId) => edit((p) => ops.removeBay(p, cabinetId, sectionId, bayId)),
      moveBay: (cabinetId, sectionId, bayId, delta) => edit((p) => ops.moveBay(p, cabinetId, sectionId, bayId, delta)),
      updateBay: (cabinetId, sectionId, bayId, patch) => edit((p) => ops.updateBay(p, cabinetId, sectionId, bayId, patch)),

      updateMachine: (patch) => edit((p) => ops.updateMachine(p, patch)),
      updateTool: (toolId, patch) => edit((p) => ops.updateTool(p, toolId, patch)),
      updateNest: (patch) => edit((p) => ops.updateNest(p, patch)),
      updateEstimate: (patch) => edit((p) => ops.updateEstimate(p, patch)),
      updateLabor: (patch) => edit((p) => ops.updateLabor(p, patch)),
    }
  })
}

let browserStore: DesignerStore | null = null

/** The app-wide store, created on first client use from the saved project. */
export function getDesignerStore(): DesignerStore {
  browserStore ??= createDesignerStore(loadProject(browserStorage()))
  return browserStore
}

export function useDesigner<T>(selector: (state: DesignerState) => T): T {
  return useStore(getDesignerStore(), selector)
}

/** Currently selected cabinet, or null when the project has none. */
export function selectedCabinet(state: DesignerState): Cabinet | null {
  return state.project.cabinets.find((c) => c.id === state.selectedCabinetId) ?? null
}
