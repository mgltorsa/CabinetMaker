'use client'

import { ChevronRightIcon, CopyIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import type { Id, LinearMaterial, Material, Project, SheetMaterial, UnitSystem } from '@/core/types'
import { MATERIAL_THICKNESS, STOCK_SIZE } from '../../lib/limits'
import { materialSpec, materialWarnings } from '../../lib/materials'
import type { MaterialPatch } from '../../projectOps'
import { useDesigner } from '../../store'
import { CheckboxField, FieldGrid, LengthInput, NumberInput, TextInput } from '../fields'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { ColorField } from './ColorField'
import { DeleteMaterialPanel } from './DeleteMaterialPanel'

/** Swatch shown for a material without its own colour (the 3D view then uses its finish colour). */
const NO_COLOR_SWATCH = '#d9d4cc'

type MaterialRowProps = {
  project: Project
  material: Material
  defaultOpen?: boolean
  /** A copy was made (open it). */
  onAdded: (id: Id) => void
}

/** One expandable library row: name and stock size closed; every field, warnings and actions open. */
export function MaterialRow({ project, material, defaultOpen = false, onAdded }: MaterialRowProps) {
  const update = useDesigner((s) => s.updateMaterial)
  const duplicate = useDesigner((s) => s.duplicateMaterial)
  const [isDeleting, setDeleting] = useState(false)
  const set = (patch: MaterialPatch): void => update(material.id, patch)
  const units = project.units
  const warnings = materialWarnings(material, project)

  const handleDuplicate = (): void => {
    const copyId = duplicate(material.id)
    if (copyId !== null) onAdded(copyId)
  }

  return (
    <Collapsible defaultOpen={defaultOpen} className="group/mat rounded-md border bg-background/60">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/mat:rotate-90" />
        <span aria-hidden="true" className="size-3.5 shrink-0 rounded-sm border border-foreground/20" style={{ backgroundColor: material.color ?? NO_COLOR_SWATCH }} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{material.name}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">{materialSpec(material, units)}</span>
        </span>
        {warnings.length > 0 && (
          <TriangleAlertIcon role="img" aria-label={warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`} className="size-4 shrink-0 text-warning" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div role="group" aria-label={`${material.name} settings`} className="flex flex-col gap-3 border-t px-3 py-3">
          <FieldGrid>
            <TextInput label="Name" value={material.name} onCommit={(name) => set({ name })} className="col-span-2" />
            <LengthInput label="Thickness" value={material.thickness} units={units} {...MATERIAL_THICKNESS} onCommit={(thickness) => set({ thickness })} />
            {material.kind === 'sheet' ? (
              <SheetFields material={material} units={units} currency={project.estimate.currency} set={set} />
            ) : (
              <LinearFields material={material} units={units} currency={project.estimate.currency} set={set} />
            )}
            <div className="col-span-2">
              <ColorField label="Colour" value={material.color} fallback={NO_COLOR_SWATCH} onCommit={(color) => set({ color })} />
            </div>
          </FieldGrid>
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-foreground">
              {warnings.map((w) => (
                <li key={w} className="flex items-start gap-1.5">
                  <TriangleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0 text-warning" />
                  {w}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="xs" aria-label={`Duplicate ${material.name}`} onClick={handleDuplicate}>
              <CopyIcon aria-hidden="true" /> Duplicate
            </Button>
            <Button variant="outline" size="xs" aria-label={`Delete ${material.name}`} onClick={() => setDeleting(true)}>
              <Trash2Icon aria-hidden="true" /> Delete
            </Button>
          </div>
          {isDeleting && <DeleteMaterialPanel project={project} material={material} onClose={() => setDeleting(false)} />}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

type KindFieldsProps<M> = { material: M; units: UnitSystem; currency: string; set: (patch: MaterialPatch) => void }

function SheetFields({ material, units, currency, set }: KindFieldsProps<SheetMaterial>) {
  return (
    <>
      <NumberInput label="Cost per sheet" suffix={currency} value={material.costPerSheet} min={0} onCommit={(costPerSheet) => set({ costPerSheet })} />
      <LengthInput label="Sheet length" value={material.sheetLength} units={units} {...STOCK_SIZE} onCommit={(sheetLength) => set({ sheetLength })} />
      <LengthInput label="Sheet width" value={material.sheetWidth} units={units} {...STOCK_SIZE} onCommit={(sheetWidth) => set({ sheetWidth })} />
      <div className="col-span-2">
        <CheckboxField label="Grained" isChecked={material.grained} onChange={(grained) => set({ grained })} />
      </div>
    </>
  )
}

function LinearFields({ material, units, currency, set }: KindFieldsProps<LinearMaterial>) {
  return (
    <>
      <NumberInput label="Cost per metre" suffix={currency} value={material.costPerMetre} min={0} onCommit={(costPerMetre) => set({ costPerMetre })} />
      <LengthInput label="Board width" value={material.width} units={units} {...STOCK_SIZE} onCommit={(width) => set({ width })} />
      <LengthInput label="Stock length" value={material.stockLength} units={units} {...STOCK_SIZE} onCommit={(stockLength) => set({ stockLength })} />
    </>
  )
}
