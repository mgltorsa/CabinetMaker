'use client'

import { getAssetDef } from '@/assets'
import type { AssetLight, PlacedAsset, Project } from '@/core/types'
import { ColorField } from '../../components/catalog/ColorField'
import { CheckboxField, FieldGrid, LengthInput, NumberInput, TextInput } from '../../components/fields'
import { CardCaption } from '../../components/sidebar/SpecCard'
import { Button } from '../../components/ui/button'
import { ASSET_LIFT, ASSET_ROTATION, ASSET_SIZE, LIGHT_INTENSITY, ROOM_COORD } from '../../lib/limits'
import { type AssetPatch } from '../assetOps'
import { type SnapTarget, snapPosition } from '../placement'

const SNAPS: readonly { target: SnapTarget; label: string }[] = [
  { target: 'floor', label: 'Floor' },
  { target: 'wall', label: 'Back wall' },
  { target: 'counter', label: 'Counter' },
  { target: 'under-cabinet', label: 'Under cabinets' },
  { target: 'ceiling', label: 'Ceiling' },
]

type AssetEditorProps = {
  asset: PlacedAsset
  project: Project
  onChange: (patch: AssetPatch) => void
  onLightChange: (patch: Partial<AssetLight>) => void
}

/** Numeric placement, size, colour and light settings of the selected asset. */
export function AssetEditor({ asset, project, onChange, onLightChange }: AssetEditorProps) {
  const def = getAssetDef(asset.assetId)
  const units = project.units
  const p = asset.position
  const s = asset.size
  const size = (axis: 'x' | 'y' | 'z', label: string) => (
    <LengthInput label={label} value={s[axis]} units={units} min={ASSET_SIZE.min} max={ASSET_SIZE.max} onCommit={(v) => onChange({ size: { ...s, [axis]: v } })} />
  )

  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary/40 bg-background p-3">
      <TextInput label="Asset name" value={asset.name} onCommit={(name) => onChange({ name })} />
      <FieldGrid>
        <LengthInput label="Asset X" value={p.x} units={units} min={ROOM_COORD.min} max={ROOM_COORD.max} onCommit={(x) => onChange({ position: { ...p, x } })} />
        <LengthInput label="Asset Z" value={p.z} units={units} min={ROOM_COORD.min} max={ROOM_COORD.max} onCommit={(z) => onChange({ position: { ...p, z } })} />
        <LengthInput label="Asset lift" value={p.y} units={units} min={ASSET_LIFT.min} max={ASSET_LIFT.max} onCommit={(y) => onChange({ position: { ...p, y } })} />
        <NumberInput label="Asset rotation" suffix="°" value={asset.rotationYDeg} min={ASSET_ROTATION.min} max={ASSET_ROTATION.max} onCommit={(rotationYDeg) => onChange({ rotationYDeg })} />
      </FieldGrid>
      <div className="grid grid-cols-3 gap-2">
        {size('x', 'Asset width')}
        {size('y', 'Asset height')}
        {size('z', 'Asset depth')}
      </div>
      <ColorField label="Asset colour" value={asset.color} fallback={def?.defaultColor ?? '#c8c4bc'} onCommit={(color) => onChange({ color })} />

      <div className="flex flex-col gap-1.5">
        <CardCaption>Snap to</CardCaption>
        <div className="flex flex-wrap gap-1.5">
          {SNAPS.map((snap) => (
            <Button
              key={snap.target}
              variant="outline"
              size="sm"
              aria-label={`Snap to ${snap.label.toLowerCase()}`}
              onClick={() => onChange({ position: snapPosition(project, asset, snap.target) })}
            >
              {snap.label}
            </Button>
          ))}
        </div>
      </div>

      {asset.light && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
          <CheckboxField label="Light on" isChecked={asset.light.on} onChange={(on) => onLightChange({ on })} />
          <FieldGrid>
            <NumberInput label="Brightness" suffix="×" value={asset.light.intensity} min={LIGHT_INTENSITY.min} max={LIGHT_INTENSITY.max} onCommit={(intensity) => onLightChange({ intensity })} />
            <ColorField label="Light colour" value={asset.light.color} fallback={asset.light.color} onCommit={(color) => color && onLightChange({ color })} />
          </FieldGrid>
          <p className="text-xs text-muted-foreground">Turn on “Evening light” over the 3D view to see placed lights best.</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">X runs along the back wall, Z away from it; lift is the height of the asset’s base. Click an asset in the 3D view to select it.</p>
    </div>
  )
}
