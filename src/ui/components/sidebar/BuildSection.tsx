'use client'

import type { Cabinet, ConstructionMethod, Project } from '@/core/types'
import { formatLength } from '@/core/units'
import { DRAWER_JOINERY, JOINERY, materialOptions, withCurrent } from '../../lib/options'
import { useDesigner } from '../../store'
import { MaterialLibrary } from '../catalog/MaterialLibrary'
import { FieldGrid, LengthInput, SelectField } from '../fields'
import { SpecCard } from './SpecCard'

const JOINERY_LABEL: Record<ConstructionMethod['joinery'], string> = { none: 'Screws', dowel: 'Dowels', domino: 'Domino', dado: 'Dado / groove' }

/** 02 Build options: shop decisions that apply across the cabinet (stock, joinery, frame). */
export function BuildSection({ cabinet, project }: { cabinet: Cabinet; project: Project }) {
  const update = useDesigner((s) => s.updateConstruction)
  const set = (patch: Partial<ConstructionMethod>): void => update(cabinet.id, patch)
  const c = cabinet.construction
  const units = project.units
  const sheets = materialOptions(project, 'sheet')
  const name = (id: string): string => project.materials.find((m) => m.id === id)?.name ?? id
  const isFaceFrame = c.style.startsWith('face-frame')
  const sheet = (label: string, key: keyof Pick<ConstructionMethod, 'carcassMaterialId' | 'backMaterialId' | 'frontMaterialId' | 'drawerBoxMaterialId' | 'drawerBottomMaterialId'>) => (
    <SelectField label={label} value={c[key]} options={withCurrent(sheets, c[key])} onChange={(v) => set({ [key]: v })} />
  )

  return (
    <div className="flex flex-col gap-2">
      <SpecCard index="02·1" title="Materials" summary={`${name(c.carcassMaterialId)} carcass`} defaultOpen>
        <FieldGrid>
          {sheet('Carcass', 'carcassMaterialId')}
          {sheet('Back panel', 'backMaterialId')}
          {sheet('Fronts', 'frontMaterialId')}
          {sheet('Drawer box stock', 'drawerBoxMaterialId')}
          {sheet('Drawer bottom stock', 'drawerBottomMaterialId')}
          <SelectField
            label="Face frame stock"
            value={c.faceFrameMaterialId}
            options={withCurrent(materialOptions(project, 'linear'), c.faceFrameMaterialId)}
            onChange={(faceFrameMaterialId) => set({ faceFrameMaterialId })}
          />
        </FieldGrid>
      </SpecCard>
      <SpecCard index="02·2" title="Joinery" summary={`${JOINERY_LABEL[c.joinery]} · drawers ${JOINERY_LABEL[c.drawer.joinery].toLowerCase()}`}>
        <FieldGrid>
          <SelectField label="Carcass joinery" value={c.joinery} options={JOINERY} onChange={(joinery) => set({ joinery })} />
          <SelectField label="Drawer box joints" value={c.drawer.joinery} options={DRAWER_JOINERY} onChange={(joinery) => set({ drawer: { ...c.drawer, joinery } })} />
        </FieldGrid>
        <p className="text-xs text-muted-foreground">Dado and face bores are cut on the CNC; dowel and Domino edge bores are listed as manual operations.</p>
      </SpecCard>
      <SpecCard
        index="02·3"
        title="Face frame"
        summary={isFaceFrame ? `Stiles ${formatLength(c.faceFrame.stileWidth, units)} · rails ${formatLength(c.faceFrame.railWidth, units)}` : 'Not used (frameless)'}
      >
        {isFaceFrame ? (
          <FieldGrid className="grid-cols-3">
            <LengthInput label="Stile width" value={c.faceFrame.stileWidth} units={units} min={1} onCommit={(stileWidth) => set({ faceFrame: { ...c.faceFrame, stileWidth } })} />
            <LengthInput label="Rail width" value={c.faceFrame.railWidth} units={units} min={1} onCommit={(railWidth) => set({ faceFrame: { ...c.faceFrame, railWidth } })} />
            <LengthInput label="Overhang" value={c.faceFrame.overhang} units={units} onCommit={(overhang) => set({ faceFrame: { ...c.faceFrame, overhang } })} />
          </FieldGrid>
        ) : (
          <p className="text-xs text-muted-foreground">Choose a face-frame style in 01·2 Style to edit stiles and rails.</p>
        )}
      </SpecCard>
      <MaterialLibrary project={project} />
    </div>
  )
}
