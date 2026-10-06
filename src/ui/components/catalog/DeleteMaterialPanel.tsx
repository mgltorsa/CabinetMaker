'use client'

import { type ReactNode, useState } from 'react'
import type { Material, Project } from '@/core/types'
import { MATERIAL_USE_LABELS } from '../../lib/materials'
import { materialDeleteBlock, materialUses } from '../../projectOps'
import { useDesigner } from '../../store'
import { SelectField } from '../fields'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'

type DeleteMaterialPanelProps = {
  project: Project
  material: Material
  onClose: () => void
}

const KIND_LABEL: Record<Material['kind'], string> = { sheet: 'sheet material', linear: 'linear stock' }

/**
 * Inline delete flow. An unused material asks for confirmation; one in use is
 * blocked with the list of uses and can be replaced (same kind) and deleted;
 * the last material of a kind always stays.
 */
export function DeleteMaterialPanel({ project, material, onClose }: DeleteMaterialPanelProps) {
  const deleteMaterial = useDesigner((s) => s.deleteMaterial)
  const others = project.materials.filter((m) => m.kind === material.kind && m.id !== material.id)
  const [choice, setChoice] = useState<string>(others[0]?.id ?? '')
  const replacementId = others.some((m) => m.id === choice) ? choice : others[0]?.id
  const block = materialDeleteBlock(project, material.id)

  if (block === 'missing') return null

  if (block === 'last-of-kind') {
    return (
      <Panel>
        <Alert variant="warning">
          <AlertTitle>Cannot delete the last {KIND_LABEL[material.kind]}</AlertTitle>
          <AlertDescription>New cabinets fall back to it. Add another {KIND_LABEL[material.kind]} first.</AlertDescription>
        </Alert>
        <Actions>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </Actions>
      </Panel>
    )
  }

  if (block === 'in-use') {
    return (
      <Panel>
        <Alert variant="warning">
          <AlertTitle>“{material.name}” is in use</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {materialUses(project, material.id).map((use) => (
                <li key={use.cabinetId}>
                  {use.cabinetName}: {use.fields.map((f) => MATERIAL_USE_LABELS[f]).join(', ')}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
        {replacementId !== undefined && (
          <SelectField label="Replace with" value={replacementId} options={others.map((m) => ({ value: m.id, label: m.name }))} onChange={setChoice} />
        )}
        <Actions>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" disabled={replacementId === undefined} onClick={() => deleteMaterial(material.id, replacementId)}>
            Replace and delete
          </Button>
        </Actions>
      </Panel>
    )
  }

  return (
    <Panel>
      <p className="text-sm">Delete “{material.name}”? No cabinet uses it.</p>
      <Actions>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" onClick={() => deleteMaterial(material.id)}>
          Delete material
        </Button>
      </Actions>
    </Panel>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">{children}</div>
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>
}
