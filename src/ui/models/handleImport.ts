/**
 * Browser glue for custom handles: import a GLB / glTF / OBJ / STL file into
 * the model store (same checks as scene models) and show it on a pull, either
 * a new custom handle or an existing one. Failures become toasts.
 */
import type { Id } from '@/core/types'
import { addCustomHandle, guessHandleUnit, setHandleModel } from '../handleOps'
import { getDesignerStore } from '../store'
import { errorMessage, notify } from '../toast'
import { modelNameFromFile } from './format'
import { storeModelFile } from './modelImport'
import { modelSizeMm, sizeLabel } from './units'

/**
 * Import `file` as a handle model: onto pull `targetId`, or as a new custom
 * handle when `targetId` is null. Returns the pull's id, or null on failure.
 */
export async function importHandleModel(file: File, targetId: Id | null = null): Promise<Id | null> {
  try {
    const stored = await storeModelFile(file)
    if (!stored) return null
    const { format, blobId, parsed } = stored
    const unit = guessHandleUnit(format, parsed.nativeSize)
    const model = { name: modelNameFromFile(file.name), format, blobId, nativeSize: parsed.nativeSize }
    const designer = getDesignerStore().getState()
    let id: Id | null = targetId
    if (targetId === null) {
      const added = addCustomHandle(designer.project, model, unit)
      if (added.id === null) {
        notify('error', 'The hardware catalog is full.')
        return null
      }
      designer.setProject(added.project)
      id = added.id
    } else {
      designer.editProject((p) => setHandleModel(p, targetId, model, unit))
    }
    const size = sizeLabel(modelSizeMm(parsed.nativeSize, unit, 1), designer.project.units)
    notify('info', `Handle model “${model.name}” imported (${size}, read as ${unit}). Change its Units if the size is wrong.`)
    return id
  } catch (error: unknown) {
    notify('error', `Could not import “${file.name}”: ${errorMessage(error)}`)
    return null
  }
}
