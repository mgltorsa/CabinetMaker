/**
 * Transient UI state for the asset library (never persisted): the selected
 * placed asset and the library's category tab and search text.
 */
import { create } from 'zustand'
import type { CategoryFilter } from '@/assets'
import type { Id } from '@/core/types'

interface AssetUiState {
  selectedAssetId: Id | null
  category: CategoryFilter
  query: string
  selectAsset: (id: Id | null) => void
  setCategory: (category: CategoryFilter) => void
  setQuery: (query: string) => void
}

export const useAssetUi = create<AssetUiState>()((set) => ({
  selectedAssetId: null,
  category: 'kitchen',
  query: '',
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),
  setCategory: (category) => set({ category }),
  setQuery: (query) => set({ query }),
}))
