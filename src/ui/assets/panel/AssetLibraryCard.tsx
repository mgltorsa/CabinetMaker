'use client'

import { CopyIcon, EyeIcon, EyeOffIcon, LightbulbIcon, LightbulbOffIcon, Trash2Icon } from 'lucide-react'
import type { PlacedAsset, Project } from '@/core/types'
import { CardCaption, SpecCard } from '../../components/sidebar/SpecCard'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/cn'
import { getDesignerStore, useDesigner } from '../../store'
import { sizeLabel } from '../../models/units'
import { duplicateAsset, removeAsset, setAssetLight, updateAsset } from '../assetOps'
import { useAssetUi } from '../assetUi'
import { AssetEditor } from './AssetEditor'
import { AssetIcon } from './assetIcons'
import { AssetPicker } from './AssetPicker'

function summaryOf(assets: readonly PlacedAsset[]): string {
  if (assets.length === 0) return 'Kitchen, room, lights and decor'
  const lit = assets.filter((a) => a.light?.on && a.visible).length
  return `${assets.length} placed${lit > 0 ? ` · ${lit} ${lit === 1 ? 'light' : 'lights'} on` : ''}`
}

function PlacedRow({ asset, project, isSelected }: { asset: PlacedAsset; project: Project; isSelected: boolean }) {
  const editProject = useDesigner((s) => s.editProject)
  const select = useAssetUi((s) => s.selectAsset)
  const name = asset.name
  const handleDuplicate = (): void => {
    // Run once on the current project so the copy's (random) id is the one selected.
    const { project: next, copyId } = duplicateAsset(getDesignerStore().getState().project, asset.id)
    if (copyId === null) return
    editProject(() => next)
    select(copyId)
  }
  const handleRemove = (): void => {
    if (isSelected) select(null)
    editProject((p) => removeAsset(p, asset.id))
  }
  return (
    <li className={cn('flex items-center gap-0.5 rounded-md border px-1 py-0.5', isSelected ? 'border-primary bg-primary/5' : 'border-transparent')}>
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => select(isSelected ? null : asset.id)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 py-1 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <AssetIcon assetId={asset.assetId} className={cn('size-4 shrink-0', asset.visible ? 'text-muted-foreground' : 'text-muted-foreground/40')} />
        <span className="flex min-w-0 flex-col">
          <span className={cn('truncate text-sm', !asset.visible && 'text-muted-foreground line-through')}>{name}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">{sizeLabel(asset.size, project.units)}</span>
        </span>
      </button>
      {asset.light && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Turn ${asset.light.on ? 'off' : 'on'} ${name}`}
          aria-pressed={asset.light.on}
          onClick={() => editProject((p) => setAssetLight(p, asset.id, { on: !asset.light?.on }))}
        >
          {asset.light.on ? <LightbulbIcon /> : <LightbulbOffIcon />}
        </Button>
      )}
      <Button variant="ghost" size="sm" aria-label={`Duplicate ${name}`} onClick={handleDuplicate}>
        <CopyIcon />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`${asset.visible ? 'Hide' : 'Show'} ${name}`}
        aria-pressed={!asset.visible}
        onClick={() => editProject((p) => updateAsset(p, asset.id, { visible: !asset.visible }))}
      >
        {asset.visible ? <EyeIcon /> : <EyeOffIcon />}
      </Button>
      <Button variant="ghost" size="sm" aria-label={`Remove ${name}`} onClick={handleRemove}>
        <Trash2Icon />
      </Button>
    </li>
  )
}

/** 05·4 Asset library: add parametric appliances, furniture, lights and decor to the room (design only, never cut). */
export function AssetLibraryCard({ project }: { project: Project }) {
  const editProject = useDesigner((s) => s.editProject)
  const selectedAssetId = useAssetUi((s) => s.selectedAssetId)
  const assets = project.assets ?? []
  const selected = assets.find((a) => a.id === selectedAssetId) ?? null

  return (
    <SpecCard index="05·4" title="Asset library" summary={summaryOf(assets)}>
      <AssetPicker project={project} />
      <p className="text-xs text-muted-foreground">For the design and renders only: assets never enter the cut list, nest, CNC or estimate.</p>

      {assets.length > 0 && (
        <>
          <CardCaption className="mt-1">Placed assets</CardCaption>
          <ul aria-label="Placed assets" className="flex flex-col gap-1">
            {assets.map((a) => (
              <PlacedRow key={a.id} asset={a} project={project} isSelected={a.id === selectedAssetId} />
            ))}
          </ul>
        </>
      )}

      {selected && (
        <AssetEditor
          key={selected.id}
          asset={selected}
          project={project}
          onChange={(patch) => editProject((p) => updateAsset(p, selected.id, patch))}
          onLightChange={(patch) => editProject((p) => setAssetLight(p, selected.id, patch))}
        />
      )}
    </SpecCard>
  )
}
