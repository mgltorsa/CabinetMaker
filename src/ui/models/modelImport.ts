/**
 * Browser glue for importing model files (file picker and drag-and-drop):
 * check → read → hash → parse → store bytes → add the model to the project.
 * three and its loaders load on first use.
 */
import type { ModelFormat } from '@/core/types'
import { MAX_MODELS } from '../lib/limits'
import { getDesignerStore } from '../store'
import { errorMessage, notify } from '../toast'
import { contentId, getBlobStore } from './blobStore'
import { checkModelFile, modelNameFromFile } from './format'
import { addModel, newSceneModel } from './modelOps'
import { useModelUi } from './modelUi'
import type { ParsedModel } from './loaders'
import { guessModelUnit, modelSizeMm, sizeLabel } from './units'

export interface StoredModelFile {
  format: ModelFormat
  blobId: string
  parsed: ParsedModel
}

/**
 * Check, parse and store one model file (shared by scene models and custom
 * handles). `null` after a toast when the file is refused; throws when it
 * cannot be parsed or stored.
 */
export async function storeModelFile(file: File): Promise<StoredModelFile | null> {
  const check = checkModelFile(file.name, file.size)
  if (!check.ok) {
    notify('error', check.error)
    return null
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const blobId = await contentId(bytes)
  // Parse before storing: a file the loaders reject never reaches the store.
  const { parseModel } = await import('./loaders')
  const { primeModel } = await import('./modelCache')
  const parsed = await parseModel(bytes, check.format)
  const store = getBlobStore()
  if ((await store.get(blobId)) === null) await store.put(blobId, bytes)
  primeModel(blobId, parsed)
  return { format: check.format, blobId, parsed }
}

async function importOne(file: File): Promise<void> {
  const stored = await storeModelFile(file)
  if (!stored) return
  const { format, blobId, parsed } = stored

  const designer = getDesignerStore().getState()
  const { importUnit } = useModelUi.getState()
  const unit = importUnit === 'auto' ? guessModelUnit(format, parsed.nativeSize) : importUnit
  const model = newSceneModel(designer.project, { name: modelNameFromFile(file.name), format, blobId, nativeSize: parsed.nativeSize }, unit)
  designer.editProject((p) => addModel(p, model))
  useModelUi.getState().selectModel(model.id)
  const size = sizeLabel(modelSizeMm(parsed.nativeSize, unit, 1), designer.project.units)
  notify('info', `Imported “${model.name}” (${size}, read as ${unit}). If the size is wrong, change its Units in 05.`)
}

/** Import each file in turn; every failure becomes a toast, never an exception. */
export async function importModelFiles(files: readonly File[]): Promise<void> {
  const ui = useModelUi.getState()
  if (ui.isImporting || files.length === 0) return
  ui.setImporting(true)
  try {
    for (const file of files) {
      if ((getDesignerStore().getState().project.models ?? []).length >= MAX_MODELS) {
        notify('error', `A project holds at most ${MAX_MODELS} models.`)
        return
      }
      try {
        await importOne(file)
      } catch (error: unknown) {
        notify('error', `Could not import “${file.name}”: ${errorMessage(error)}`)
      }
    }
  } finally {
    useModelUi.getState().setImporting(false)
  }
}
