/** The built-in asset catalog: lookup by id, categories, search. */
import { DECOR_ASSETS } from './decor'
import { KITCHEN_ASSETS } from './kitchen'
import { LIGHT_ASSETS } from './lights'
import { ROOM_ASSETS } from './room'
import type { AssetCategory, AssetDef } from './types'

export const ASSET_CATALOG: readonly AssetDef[] = [...KITCHEN_ASSETS, ...ROOM_ASSETS, ...LIGHT_ASSETS, ...DECOR_ASSETS]

export const ASSET_CATEGORIES: readonly { id: AssetCategory; label: string }[] = [
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'room', label: 'Room' },
  { id: 'lights', label: 'Lights' },
  { id: 'decor', label: 'Decor' },
]

export type CategoryFilter = AssetCategory | 'all'

const BY_ID: ReadonlyMap<string, AssetDef> = new Map(ASSET_CATALOG.map((a) => [a.id, a]))

export function getAssetDef(assetId: string): AssetDef | undefined {
  return BY_ID.get(assetId)
}

/** Catalog entries in `category` whose name, id or keywords contain every word of `query` (case-insensitive). */
export function searchAssets(query: string, category: CategoryFilter): AssetDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return ASSET_CATALOG.filter((a) => {
    if (category !== 'all' && a.category !== category) return false
    const haystack = [a.name, a.id, ...a.keywords].join(' ').toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}
