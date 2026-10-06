'use client'

import { SearchIcon } from 'lucide-react'
import { ASSET_CATEGORIES, type CategoryFilter, searchAssets } from '@/assets'
import type { Project } from '@/core/types'
import { Input } from '../../components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { MAX_ASSETS } from '../../lib/limits'
import { useDesigner } from '../../store'
import { addAsset, newPlacedAsset } from '../assetOps'
import { useAssetUi } from '../assetUi'
import { AssetIcon } from './assetIcons'

const TABS: readonly { id: CategoryFilter; label: string }[] = [...ASSET_CATEGORIES, { id: 'all', label: 'All' }]

const isCategory = (v: string): v is CategoryFilter => TABS.some((t) => t.id === v)

/** Category tabs, search and a grid of catalog assets; a click adds one to the room. */
export function AssetPicker({ project }: { project: Project }) {
  const editProject = useDesigner((s) => s.editProject)
  const category = useAssetUi((s) => s.category)
  const query = useAssetUi((s) => s.query)
  const setCategory = useAssetUi((s) => s.setCategory)
  const setQuery = useAssetUi((s) => s.setQuery)
  const select = useAssetUi((s) => s.selectAsset)
  // Typing a search looks across every category.
  const results = searchAssets(query, query.trim() ? 'all' : category)
  const isFull = (project.assets ?? []).length >= MAX_ASSETS

  const handleAdd = (assetId: string): void => {
    const asset = newPlacedAsset(project, assetId)
    if (!asset) return
    editProject((p) => addAsset(p, asset))
    select(asset.id)
  }

  return (
    <div className="flex flex-col gap-2">
      <Tabs value={category} onValueChange={(v) => isCategory(v) && setCategory(v)}>
        <TabsList aria-label="Asset categories" className="w-full">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-1 px-2 text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="relative">
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Search assets" placeholder="Search fridge, lamp, sofa…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
      </div>
      {results.length === 0 ? (
        <p className="text-xs text-muted-foreground">No asset matches “{query.trim()}”.</p>
      ) : (
        <ul aria-label="Asset catalog" className="grid grid-cols-3 gap-1.5">
          {results.map((def) => (
            <li key={def.id}>
              <button
                type="button"
                aria-label={`Add ${def.name}`}
                title={`Add ${def.name}`}
                disabled={isFull}
                onClick={() => handleAdd(def.id)}
                className="flex h-full w-full flex-col items-center gap-1 rounded-md border bg-background px-1 py-2 text-center text-[11px] leading-tight shadow-xs outline-none hover:border-primary hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                <span className="grid size-8 place-items-center rounded-md" style={{ backgroundColor: `${def.defaultColor}22` }}>
                  <AssetIcon assetId={def.id} className="size-5 text-foreground/80" />
                </span>
                {def.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {isFull && <p className="text-xs text-muted-foreground">This project has the most assets allowed ({MAX_ASSETS}).</p>}
    </div>
  )
}
