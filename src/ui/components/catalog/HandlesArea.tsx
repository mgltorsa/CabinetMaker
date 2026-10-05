'use client'

import { Loader2Icon, PlusIcon, UploadIcon } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import type { HandleStyle, Id, Project } from '@/core/types'
import { canAddHardware } from '../../costOps'
import { MODEL_FILE_ACCEPT } from '../../models/format'
import { useDesigner } from '../../store'
import { SelectField } from '../fields'
import { Button } from '../ui/button'
import { STYLE_OPTIONS } from './HandleFields'
import { HardwareItemEditor } from './HardwareItemEditor'

type HandlesAreaProps = {
  project: Project
  /** Item to show expanded (just created). */
  openId: Id | null
  onCreated: (id: Id) => void
}

/** Handle types (catalog pulls): create by style, import a model as a custom handle, and edit each one. */
export function HandlesArea({ project, openId, onCreated }: HandlesAreaProps) {
  const add = useDesigner((s) => s.addHandleItem)
  const [style, setStyle] = useState<HandleStyle>('bar')
  const [isImporting, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const handles = project.hardware.filter((h) => h.kind === 'pull')
  const isFull = !canAddHardware(project)

  const handleAdd = (): void => {
    const id = add(style)
    if (id !== null) onCreated(id)
  }

  const handleFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // allow importing the same file again
    if (!file) return
    setImporting(true)
    void import('../../models/handleImport')
      .then(({ importHandleModel }) => importHandleModel(file))
      .then((id) => {
        if (id !== null) onCreated(id)
      })
      .finally(() => setImporting(false))
  }

  return (
    <section aria-labelledby="handles-heading" className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="handles-heading" className="text-sm font-medium">
          Handles
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">{handles.length} types</span>
      </div>
      <p className="text-xs text-muted-foreground">Pick a cabinet’s handle under Doors (01·8). Each type sets the holes drilled in the fronts.</p>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <SelectField label="New handle style" value={style} options={STYLE_OPTIONS} onChange={setStyle} />
        <Button variant="outline" size="sm" disabled={isFull} onClick={handleAdd}>
          <PlusIcon /> Add handle
        </Button>
      </div>
      <Button variant="outline" size="sm" className="self-start" disabled={isFull || isImporting} onClick={() => fileInput.current?.click()}>
        {isImporting ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Import handle model…
      </Button>
      <input ref={fileInput} type="file" name="handle-import-file" aria-label="Import handle model file" accept={MODEL_FILE_ACCEPT} className="hidden" onChange={handleFile} />
      {handles.length === 0 ? (
        <p className="text-xs text-muted-foreground">No handle types yet.</p>
      ) : (
        <ul aria-label="Handles" className="flex flex-col gap-2">
          {handles.map((item) => (
            <li key={item.id}>
              <HardwareItemEditor item={item} project={project} isOpen={item.id === openId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
