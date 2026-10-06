'use client'

import { AlertTriangleIcon, Loader2Icon, UploadIcon } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { DEFAULT_HANDLE_COLOR, HANDLE_STYLES, resolveHandle } from '@/core/handles'
import type { HandleStyle, HardwareItem, ModelUnit, Project } from '@/core/types'
import { HANDLE_STYLE_LABEL } from '../../handleOps'
import { CUSTOM_PULL_CENTERS, HANDLE_DIMENSION, HANDLE_PROJECTION, PULL_CENTERS } from '../../lib/limits'
import { MODEL_FILE_ACCEPT } from '../../models/format'
import { MODEL_UNITS, sizeLabel } from '../../models/units'
import { useStoredBlobs } from '../../models/useStoredBlobs'
import { useDesigner } from '../../store'
import { LengthInput, SelectField, type SelectOption } from '../fields'
import { Button } from '../ui/button'
import { ColorField } from './ColorField'
import { HandlePreview } from './HandlePreview'

export const STYLE_OPTIONS: readonly SelectOption<HandleStyle>[] = HANDLE_STYLES.map((s) => ({ value: s, label: HANDLE_STYLE_LABEL[s] }))

/** Field labels per style: `null` hides the field. */
interface StyleFields {
  centers: string | null
  length: string | null
  width: string | null
  diameter: string | null
}

const FIELDS: Readonly<Record<HandleStyle, StyleFields>> = {
  bar: { centers: 'Pull centres', length: 'Length', width: null, diameter: 'Bar diameter' },
  knob: { centers: null, length: null, width: null, diameter: 'Knob diameter' },
  edge: { centers: 'Pull centres', length: 'Length', width: 'Lip height', diameter: 'Sheet thickness' },
  cup: { centers: 'Pull centres', length: 'Length', width: 'Cup height', diameter: 'Sheet thickness' },
  'j-profile': { centers: null, length: null, width: 'Lip height', diameter: 'Sheet thickness' },
  custom: { centers: 'Screw centres (0 = one)', length: 'Length', width: 'Height', diameter: null },
}

const HINT: Readonly<Record<HandleStyle, string>> = {
  bar: 'Two through holes on the centres.',
  knob: 'One through hole.',
  edge: 'Sits on the top edge (bottom edge of wall-cabinet doors); two blind screw holes inside.',
  cup: 'Two through holes on the centres.',
  'j-profile': 'Lip along the top edge (bottom edge of wall-cabinet doors). No holes; priced per front.',
  custom: 'Your 3D model. Model axes: X along the handle, Y up, Z out of the front.',
}

/** Custom handles: the imported model's status, its units and a button to load / replace it. */
function ModelControls({ item, project }: { item: HardwareItem; project: Project }) {
  const updateHandle = useDesigner((s) => s.updateHandle)
  const fileInput = useRef<HTMLInputElement>(null)
  const [isBusy, setBusy] = useState(false)
  const handle = item.handle
  const stored = useStoredBlobs(handle?.blobId ?? '')
  const h = resolveHandle(item)
  const isMissing = handle?.blobId !== undefined && stored.ids !== null && !stored.ids.has(handle.blobId)

  const handleFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setBusy(true)
    void import('../../models/handleImport')
      .then(({ importHandleModel }) => importHandleModel(file, item.id))
      .finally(() => {
        setBusy(false)
        stored.refresh()
      })
  }

  return (
    <div className="col-span-2 flex flex-col gap-2 rounded-md border border-dashed p-2">
      {h.model ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          {h.model.format.toUpperCase()} model · {sizeLabel({ x: h.length, y: h.width, z: h.projection }, project.units)}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No model yet: shown as a bar until you load one.</p>
      )}
      {isMissing && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangleIcon className="size-3.5" /> Model file not in this browser; import the project .zip to restore it.
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        {h.model ? (
          <SelectField<ModelUnit>
            label="Model units"
            value={h.model.unit}
            options={MODEL_UNITS}
            // A new unit rescales the model; sizes typed for the old one would no longer match it.
            onChange={(unit) => updateHandle(item.id, { unit, length: undefined, width: undefined, projection: undefined })}
          />
        ) : (
          <span />
        )}
        <Button variant="outline" size="sm" disabled={isBusy} onClick={() => fileInput.current?.click()}>
          {isBusy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} {h.model ? 'Replace model…' : 'Load model…'}
        </Button>
      </div>
      <input ref={fileInput} type="file" name="handle-model-file" aria-label={`Model file for ${item.name}`} accept={MODEL_FILE_ACCEPT} className="hidden" onChange={handleFile} />
    </div>
  )
}

/** Style, size, colour and (custom) model of a pull, with a live preview. */
export function HandleFields({ item, project }: { item: HardwareItem; project: Project }) {
  const updateHandle = useDesigner((s) => s.updateHandle)
  const setProp = useDesigner((s) => s.setHardwareProp)
  const h = resolveHandle(item)
  const labels = FIELDS[h.style]
  const units = project.units
  const dimension = { min: HANDLE_DIMENSION.min, max: HANDLE_DIMENSION.max }
  const centers = h.style === 'custom' ? CUSTOM_PULL_CENTERS : PULL_CENTERS

  return (
    <>
      <div className="col-span-2 grid grid-cols-[1fr_7.5rem] items-start gap-3">
        <div className="flex flex-col gap-1.5">
          <SelectField label="Handle style" value={h.style} options={STYLE_OPTIONS} onChange={(style) => updateHandle(item.id, { style })} />
          <p className="text-xs text-muted-foreground">{HINT[h.style]}</p>
        </div>
        <HandlePreview handle={h} className="w-full rounded-md border bg-background" />
      </div>
      {labels.centers && <LengthInput label={labels.centers} value={h.centers} units={units} min={centers.min} max={centers.max} onCommit={(v) => setProp(item.id, 'centers', v)} />}
      {labels.length && <LengthInput label={labels.length} value={h.length} units={units} {...dimension} onCommit={(length) => updateHandle(item.id, { length })} />}
      {labels.width && <LengthInput label={labels.width} value={h.width} units={units} {...dimension} onCommit={(width) => updateHandle(item.id, { width })} />}
      {labels.diameter && <LengthInput label={labels.diameter} value={h.diameter} units={units} {...dimension} onCommit={(diameter) => updateHandle(item.id, { diameter })} />}
      <LengthInput label="Projection" value={h.projection} units={units} min={HANDLE_PROJECTION.min} max={HANDLE_PROJECTION.max} onCommit={(projection) => updateHandle(item.id, { projection })} />
      <ColorField label="Handle colour" value={item.handle?.color} fallback={DEFAULT_HANDLE_COLOR} onCommit={(color) => updateHandle(item.id, { color })} />
      {h.style === 'custom' && <ModelControls item={item} project={project} />}
    </>
  )
}
