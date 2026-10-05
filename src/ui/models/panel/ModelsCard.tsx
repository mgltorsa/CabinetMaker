'use client'

import { AlertTriangleIcon, BoxIcon, EyeIcon, EyeOffIcon, FileArchiveIcon, Loader2Icon, Trash2Icon, UploadIcon } from 'lucide-react'
import { type ChangeEvent, useRef } from 'react'
import type { ModelUnit, Project, SceneModel } from '@/core/types'
import { CardCaption, SpecCard } from '../../components/sidebar/SpecCard'
import { FieldGrid, LengthInput, NumberInput, SelectField, TextInput } from '../../components/fields'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/cn'
import { MODEL_LIFT, MODEL_SCALE, ROOM_COORD } from '../../lib/limits'
import { useDesigner } from '../../store'
import { errorMessage, notify } from '../../toast'
import { getBlobStore, unusedBlobIds } from '../blobStore'
import { downloadProjectBundle } from '../bundleIo'
import { MODEL_FILE_ACCEPT } from '../format'
import { importModelFiles } from '../modelImport'
import { type ModelPatch, removeModel, updateModel } from '../modelOps'
import { type ImportUnit, useModelUi } from '../modelUi'
import { MODEL_UNITS, modelSizeMm, sizeLabel } from '../units'
import { useStoredBlobs } from '../useStoredBlobs'

const IMPORT_UNITS: { value: ImportUnit; label: string }[] = [{ value: 'auto', label: 'Auto (glTF = metres)' }, ...MODEL_UNITS]

function ModelEditor({ model, units, onChange }: { model: SceneModel; units: Project['units']; onChange: (patch: ModelPatch) => void }) {
  const p = model.position
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary/40 bg-background p-3">
      <TextInput label="Model name" value={model.name} onCommit={(name) => onChange({ name })} />
      <FieldGrid>
        <LengthInput label="Position X" value={p.x} units={units} min={ROOM_COORD.min} max={ROOM_COORD.max} onCommit={(x) => onChange({ position: { ...p, x } })} />
        <LengthInput label="Position Z" value={p.z} units={units} min={ROOM_COORD.min} max={ROOM_COORD.max} onCommit={(z) => onChange({ position: { ...p, z } })} />
        <NumberInput label="Rotation" suffix="°" value={model.rotationYDeg} min={-360} max={360} onCommit={(rotationYDeg) => onChange({ rotationYDeg })} />
        <NumberInput label="Scale" suffix="×" value={model.scale} min={MODEL_SCALE.min} max={MODEL_SCALE.max} onCommit={(scale) => onChange({ scale })} />
        <LengthInput label="Lift above floor" value={p.y} units={units} min={MODEL_LIFT.min} max={MODEL_LIFT.max} onCommit={(y) => onChange({ position: { ...p, y } })} />
        <SelectField<ModelUnit> label="File units" value={model.unit} options={MODEL_UNITS} onChange={(unit) => onChange({ unit })} />
      </FieldGrid>
      <p className="text-xs text-muted-foreground">X runs along the back wall, Z away from it. In the 3D view: drag the gizmo (10 mm / 15° snaps).</p>
    </div>
  )
}

/** 05·2 Models: import, list, and edit imported GLB / glTF / OBJ / STL models. */
export function ModelsCard({ project }: { project: Project }) {
  const editProject = useDesigner((s) => s.editProject)
  const selectedModelId = useModelUi((s) => s.selectedModelId)
  const select = useModelUi((s) => s.selectModel)
  const importUnit = useModelUi((s) => s.importUnit)
  const setImportUnit = useModelUi((s) => s.setImportUnit)
  const isImporting = useModelUi((s) => s.isImporting)
  const fileInput = useRef<HTMLInputElement>(null)
  const models = project.models ?? []
  const stored = useStoredBlobs(models.map((m) => m.blobId).join(','))
  const isMissing = (m: SceneModel): boolean => stored.ids !== null && !stored.ids.has(m.blobId)
  const missingCount = models.filter(isMissing).length
  const unused = stored.ids ? unusedBlobIds([...stored.ids], models) : []
  const selected = models.find((m) => m.id === selectedModelId) ?? null
  const units = project.units

  const handleFiles = (e: ChangeEvent<HTMLInputElement>): void => {
    const input = e.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = '' // allow importing the same file again
    void importModelFiles(files)
  }

  const handleRemove = (m: SceneModel): void => {
    if (selectedModelId === m.id) select(null)
    editProject((p) => removeModel(p, m.id))
  }

  const handleClearUnused = async (): Promise<void> => {
    if (!window.confirm(`Delete ${unused.length} stored model file(s) no model in this project uses? Projects exported as JSON that use them will show placeholders.`)) return
    try {
      const { forgetModel } = await import('../modelCache')
      for (const id of unused) {
        await getBlobStore().delete(id)
        forgetModel(id)
      }
      notify('info', `Deleted ${unused.length} unused model file(s).`)
    } catch (error: unknown) {
      notify('error', `Could not delete model files: ${errorMessage(error)}`)
    } finally {
      stored.refresh()
    }
  }

  const handleBundle = (): void => {
    downloadProjectBundle(project).catch((error: unknown) => notify('error', `Export failed: ${errorMessage(error)}`))
  }

  const summary = `${models.length} ${models.length === 1 ? 'model' : 'models'}${missingCount > 0 ? ` · ${missingCount} missing` : ''}`

  return (
    <SpecCard index="05·2" title="Models" summary={summary} defaultOpen>
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm" onClick={() => fileInput.current?.click()} disabled={isImporting}>
          {isImporting ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Import model…
        </Button>
        <div className="min-w-44 flex-1">
          <SelectField<ImportUnit> label="Import units" value={importUnit} options={IMPORT_UNITS} onChange={setImportUnit} />
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        name="model-file"
        multiple
        accept={MODEL_FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFiles}
      />
      <p className="text-xs text-muted-foreground">GLB, glTF (embedded buffers), OBJ or STL up to 50 MB. You can also drop files on the 3D view.</p>

      {missingCount > 0 && (
        <p role="status" className="flex gap-2 rounded-md border border-warning/50 bg-warning/10 p-2 text-xs">
          <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
          {missingCount} model file(s) are not stored in this browser and show as placeholder boxes. Import the project .zip to restore them.
        </p>
      )}

      {models.length > 0 && (
        <ul aria-label="Imported models" className="flex flex-col gap-1">
          {models.map((m) => {
            const isSelected = m.id === selectedModelId
            return (
              <li key={m.id} className={cn('flex items-center gap-1 rounded-md border px-1 py-0.5', isSelected ? 'border-primary bg-primary/5' : 'border-transparent')}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => select(isSelected ? null : m.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 py-1 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <BoxIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{m.name}</span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {m.format.toUpperCase()} · {sizeLabel(modelSizeMm(m.nativeSize, m.unit, m.scale), units)}
                    </span>
                  </span>
                  {isMissing(m) && <Badge variant="warning">File missing</Badge>}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${m.visible ? 'Hide' : 'Show'} ${m.name}`}
                  aria-pressed={!m.visible}
                  onClick={() => editProject((p) => updateModel(p, m.id, { visible: !m.visible }))}
                >
                  {m.visible ? <EyeIcon /> : <EyeOffIcon />}
                </Button>
                <Button variant="ghost" size="sm" aria-label={`Remove ${m.name}`} onClick={() => handleRemove(m)}>
                  <Trash2Icon />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {selected ? (
        <ModelEditor key={selected.id} model={selected} units={units} onChange={(patch) => editProject((p) => updateModel(p, selected.id, patch))} />
      ) : (
        models.length > 0 && <p className="text-xs text-muted-foreground">Select a model here or click it in the 3D view to move, rotate or scale it.</p>
      )}

      <CardCaption className="mt-1">Share with models</CardCaption>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleBundle}>
          <FileArchiveIcon /> Export project with models (.zip)
        </Button>
        {unused.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void handleClearUnused()}>
            <Trash2Icon /> Clear {unused.length} unused file(s)
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Project JSON keeps only references; the .zip carries the model files too. Import it from the project menu.</p>
    </SpecCard>
  )
}
