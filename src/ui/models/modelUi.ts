/**
 * Transient UI state for the room & models feature (never persisted): which
 * model is selected, the gizmo mode, the import unit choice. Kept apart from
 * the designer store so the feature stays self-contained.
 */
import { create } from 'zustand'
import type { Id, ModelUnit } from '@/core/types'

export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type ImportUnit = ModelUnit | 'auto'

export const GIZMO_MODES: readonly { value: GizmoMode; label: string }[] = [
  { value: 'translate', label: 'Move' },
  { value: 'rotate', label: 'Rotate' },
  { value: 'scale', label: 'Scale' },
]

interface ModelUiState {
  selectedModelId: Id | null
  gizmoMode: GizmoMode
  importUnit: ImportUnit
  isImporting: boolean
  /** Bumped when model files arrive (zip import) so views re-read the store. */
  blobEpoch: number
  selectModel: (id: Id | null) => void
  setGizmoMode: (mode: GizmoMode) => void
  setImportUnit: (unit: ImportUnit) => void
  setImporting: (isImporting: boolean) => void
  bumpBlobEpoch: () => void
}

export const useModelUi = create<ModelUiState>()((set) => ({
  selectedModelId: null,
  gizmoMode: 'translate',
  importUnit: 'auto',
  isImporting: false,
  blobEpoch: 0,
  selectModel: (selectedModelId) => set({ selectedModelId }),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  setImportUnit: (importUnit) => set({ importUnit }),
  setImporting: (isImporting) => set({ isImporting }),
  bumpBlobEpoch: () => set((s) => ({ blobEpoch: s.blobEpoch + 1 })),
}))
