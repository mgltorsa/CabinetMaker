'use client'

import { DEFAULT_ROD_MATERIAL_ID } from '@/core/defaults'
import type { Bay, Cabinet, ConstructionMethod, Project, UnitSystem } from '@/core/types'
import { CABINET_DIMENSION, FLOOR_HEIGHT, MAX_BAYS, MAX_SHELF_PIN_DIAMETER, MAX_SHELVES, MIN_SHELF_PIN_SPACING } from '../../lib/limits'
import {
  BACKS,
  CABINET_TYPES,
  DRAWER_JOINERY,
  hardwareOptions,
  materialOptions,
  rodMaterialOptions,
  slideMountOptions,
  slideOptions,
  STYLES,
  TOE_KICKS,
  TOP_CONSTRUCTIONS,
  TOP_KINDS,
  withCurrent,
} from '../../lib/options'
import {
  backSummary,
  dimensionsSummary,
  doorsSummary,
  drawersSummary,
  layoutSummary,
  rodCount,
  shelvesAndRodsSummary,
  STYLE_LABELS,
  toeKickSummary,
  topSummary,
} from '../../lib/summaries'
import { useDesigner } from '../../store'
import { CheckboxField, FieldGrid, LengthInput, SelectField, TextInput } from '../fields'
import { Stepper } from '../Stepper'
import { LayoutEditor } from './LayoutEditor'
import { CardCaption, SpecCard } from './SpecCard'

type CardProps = { cabinet: Cabinet; project: Project; units: UnitSystem }

function useConstruction(cabinet: Cabinet): (patch: Partial<ConstructionMethod>) => void {
  const update = useDesigner((s) => s.updateConstruction)
  return (patch) => update(cabinet.id, patch)
}

function DimensionsCard({ cabinet, units }: CardProps) {
  const update = useDesigner((s) => s.updateCabinet)
  const set = (patch: Parameters<typeof update>[1]): void => update(cabinet.id, patch)
  return (
    <SpecCard
      index="01·1"
      title="Dimensions"
      summary={dimensionsSummary(cabinet, units)}
      defaultOpen
      advanced={
        <>
          <TextInput label="Name" value={cabinet.name} onCommit={(name) => set({ name })} className="col-span-2" />
          <SelectField label="Type" value={cabinet.type} options={CABINET_TYPES} onChange={(type) => set({ type })} />
          <LengthInput label="Floor height" value={cabinet.floorHeight} units={units} {...FLOOR_HEIGHT} onCommit={(floorHeight) => set({ floorHeight })} />
        </>
      }
    >
      <FieldGrid className="grid-cols-3">
        <LengthInput label="Width" value={cabinet.width} units={units} {...CABINET_DIMENSION} onCommit={(width) => set({ width })} />
        <LengthInput label="Height" value={cabinet.height} units={units} {...CABINET_DIMENSION} onCommit={(height) => set({ height })} />
        <LengthInput label="Depth" value={cabinet.depth} units={units} {...CABINET_DIMENSION} onCommit={(depth) => set({ depth })} />
      </FieldGrid>
    </SpecCard>
  )
}

function StyleCard({ cabinet, units }: CardProps) {
  const set = useConstruction(cabinet)
  const c = cabinet.construction
  return (
    <SpecCard
      index="01·2"
      title="Style"
      summary={STYLE_LABELS[c.style]}
      advanced={
        <>
          <LengthInput label="Edge reveal" value={c.reveal.edge} units={units} onCommit={(edge) => set({ reveal: { ...c.reveal, edge } })} />
          <LengthInput label="Gap between fronts" value={c.reveal.between} units={units} onCommit={(between) => set({ reveal: { ...c.reveal, between } })} />
        </>
      }
    >
      <SelectField label="Construction style" value={c.style} options={STYLES} onChange={(style) => set({ style })} />
    </SpecCard>
  )
}

function ToeKickCard({ cabinet, units }: CardProps) {
  const set = useConstruction(cabinet)
  const k = cabinet.construction.toeKick
  return (
    <SpecCard index="01·3" title="Toe kick" summary={toeKickSummary(cabinet, units)}>
      <FieldGrid className="grid-cols-3">
        <SelectField label="Toe kick" value={k.type} options={TOE_KICKS} onChange={(type) => set({ toeKick: { ...k, type } })} />
        <LengthInput label="Toe kick height" value={k.height} units={units} onCommit={(height) => set({ toeKick: { ...k, height } })} />
        <LengthInput label="Toe kick setback" value={k.setback} units={units} onCommit={(setback) => set({ toeKick: { ...k, setback } })} />
      </FieldGrid>
    </SpecCard>
  )
}

const NO_MATERIAL = '__none__'

function TopCard({ cabinet, project, units }: CardProps) {
  const setConstruction = useConstruction(cabinet)
  const updateTop = useDesigner((s) => s.updateCabinetTop)
  const c = cabinet.construction
  const t = cabinet.top
  const setTop = (patch: Partial<Cabinet['top']>): void => updateTop(cabinet.id, patch)
  const materials = [{ value: NO_MATERIAL, label: 'Same as carcass' }, ...materialOptions(project, 'sheet')]
  return (
    <SpecCard
      index="01·4"
      title="Top"
      summary={topSummary(cabinet, units)}
      advanced={
        <>
          <LengthInput label="Stretcher width" value={c.stretcherWidth} units={units} onCommit={(stretcherWidth) => setConstruction({ stretcherWidth })} />
          <LengthInput label="Nailer width" value={c.nailerWidth} units={units} onCommit={(nailerWidth) => setConstruction({ nailerWidth })} />
          <div className="col-span-2">
            <CheckboxField label="Rear nailer" isChecked={c.rearNailer} onChange={(rearNailer) => setConstruction({ rearNailer })} />
          </div>
        </>
      }
    >
      <FieldGrid>
        <SelectField label="Top construction" value={c.top} options={TOP_CONSTRUCTIONS} onChange={(top) => setConstruction({ top })} />
        <SelectField label="Top" value={t.kind} options={TOP_KINDS} onChange={(kind) => setTop({ kind })} />
      </FieldGrid>
      {t.kind !== 'none' && (
        <FieldGrid>
          <SelectField
            label="Top material"
            value={t.materialId ?? NO_MATERIAL}
            options={withCurrent(materials, t.materialId ?? NO_MATERIAL)}
            onChange={(v) => setTop({ materialId: v === NO_MATERIAL ? null : v })}
          />
          <LengthInput label="Top thickness" value={t.thickness} units={units} min={1} onCommit={(thickness) => setTop({ thickness })} />
          <LengthInput label="Front overhang" value={t.overhangFront} units={units} onCommit={(overhangFront) => setTop({ overhangFront })} />
          <LengthInput label="Side overhang" value={t.overhangSides} units={units} onCommit={(overhangSides) => setTop({ overhangSides })} />
        </FieldGrid>
      )}
    </SpecCard>
  )
}

function LayoutCard({ cabinet, units }: CardProps) {
  return (
    <SpecCard index="01·5" title="Layout" summary={layoutSummary(cabinet)}>
      <LayoutEditor cabinet={cabinet} units={units} />
    </SpecCard>
  )
}

/** Bays that can hold shelves, labelled for the steppers. */
function shelfBays(cabinet: Cabinet): { sectionId: string; bay: Bay; label: string }[] {
  const many = cabinet.sections.flatMap((s) => s.bays).filter((b) => b.kind !== 'drawer').length > 1
  return cabinet.sections.flatMap((s, si) =>
    s.bays
      .map((bay, bi) => ({ bay, bi }))
      .filter(({ bay }) => bay.kind !== 'drawer')
      .map(({ bay, bi }) => ({
        sectionId: s.id,
        bay,
        label: many ? `Shelves · section ${si + 1}, bay ${bi + 1} (${bay.kind})` : 'Shelves',
      })),
  )
}

function ShelvesCard({ cabinet, project, units }: CardProps) {
  const set = useConstruction(cabinet)
  const updateBay = useDesigner((s) => s.updateBay)
  const updateHardware = useDesigner((s) => s.updateCabinetHardware)
  const c = cabinet.construction
  const bays = shelfBays(cabinet)
  return (
    <SpecCard
      index="01·6"
      title="Shelves"
      summary={shelvesAndRodsSummary(cabinet)}
      advanced={
        <>
          <div className="col-span-2">
            <CheckboxField label="System 32 holes" isChecked={c.system32} onChange={(system32) => set({ system32 })} />
          </div>
          <LengthInput label="Pin row inset" value={c.shelfPins.inset} units={units} onCommit={(inset) => set({ shelfPins: { ...c.shelfPins, inset } })} />
          <LengthInput
            label="Pin spacing"
            value={c.shelfPins.spacing}
            units={units}
            min={MIN_SHELF_PIN_SPACING}
            onCommit={(spacing) => set({ shelfPins: { ...c.shelfPins, spacing } })}
          />
          <LengthInput
            label="Pin diameter"
            value={c.shelfPins.diameter}
            units={units}
            min={0.1}
            max={MAX_SHELF_PIN_DIAMETER}
            onCommit={(diameter) => set({ shelfPins: { ...c.shelfPins, diameter } })}
          />
          <LengthInput label="Pin depth" value={c.shelfPins.depth} units={units} onCommit={(depth) => set({ shelfPins: { ...c.shelfPins, depth } })} />
          <div className="col-span-2">
            <SelectField
              label="Shelf pin"
              value={cabinet.hardware.shelfPinId}
              options={withCurrent(hardwareOptions(project, 'shelf-pin'), cabinet.hardware.shelfPinId)}
              onChange={(shelfPinId) => updateHardware(cabinet.id, { shelfPinId })}
            />
          </div>
          {rodCount(cabinet) > 0 && (
            <div className="col-span-2">
              <SelectField
                label="Hanging rod stock"
                value={c.rodMaterialId ?? DEFAULT_ROD_MATERIAL_ID}
                options={withCurrent(rodMaterialOptions(project), c.rodMaterialId ?? DEFAULT_ROD_MATERIAL_ID)}
                onChange={(rodMaterialId) => set({ rodMaterialId })}
              />
            </div>
          )}
        </>
      }
    >
      {bays.length === 0 ? (
        <p className="text-xs text-muted-foreground">Every bay is a drawer. Add a door or open bay in Layout to hold shelves.</p>
      ) : (
        bays.map(({ sectionId, bay, label }) => (
          <Stepper
            key={bay.id}
            label={label}
            value={bay.shelfCount}
            max={MAX_SHELVES}
            onChange={(shelfCount) => updateBay(cabinet.id, sectionId, bay.id, { shelfCount })}
          />
        ))
      )}
    </SpecCard>
  )
}

function DrawersCard({ cabinet, project, units }: CardProps) {
  const set = useConstruction(cabinet)
  const setDrawerCount = useDesigner((s) => s.setDrawerCount)
  const setSlideMount = useDesigner((s) => s.setSlideMount)
  const updateHardware = useDesigner((s) => s.updateCabinetHardware)
  const c = cabinet.construction
  const many = cabinet.sections.length > 1
  return (
    <SpecCard
      index="01·7"
      title="Drawers"
      summary={drawersSummary(cabinet, project.hardware)}
      advanced={
        <>
          <SelectField label="Drawer box joinery" value={c.drawer.joinery} options={DRAWER_JOINERY} onChange={(joinery) => set({ drawer: { ...c.drawer, joinery } })} />
          <LengthInput label="Rear clearance" value={c.drawer.rearClearance} units={units} onCommit={(rearClearance) => set({ drawer: { ...c.drawer, rearClearance } })} />
          <SelectField
            label="Drawer boxes"
            value={c.drawerBoxMaterialId}
            options={withCurrent(materialOptions(project, 'sheet'), c.drawerBoxMaterialId)}
            onChange={(drawerBoxMaterialId) => set({ drawerBoxMaterialId })}
          />
          <SelectField
            label="Drawer bottoms"
            value={c.drawerBottomMaterialId}
            options={withCurrent(materialOptions(project, 'sheet'), c.drawerBottomMaterialId)}
            onChange={(drawerBottomMaterialId) => set({ drawerBottomMaterialId })}
          />
        </>
      }
    >
      {cabinet.sections.map((s, si) => (
        <Stepper
          key={s.id}
          label={many ? `Drawers · section ${si + 1}` : 'Drawers'}
          value={s.bays.filter((b) => b.kind === 'drawer').length}
          max={MAX_BAYS}
          onChange={(n) => setDrawerCount(cabinet.id, s.id, n)}
        />
      ))}
      <FieldGrid>
        <SelectField label="Slide mount" value={c.drawer.slideMount} options={slideMountOptions(project, c.drawer.slideMount)} onChange={(m) => setSlideMount(cabinet.id, m)} />
        <SelectField
          label="Slide"
          value={cabinet.hardware.slideId}
          options={slideOptions(project, c.drawer.slideMount, cabinet.hardware.slideId)}
          onChange={(slideId) => updateHardware(cabinet.id, { slideId })}
        />
      </FieldGrid>
    </SpecCard>
  )
}

const NO_PULL = '__none__'

function DoorsCard({ cabinet, project, units }: CardProps) {
  const set = useConstruction(cabinet)
  const updateBay = useDesigner((s) => s.updateBay)
  const updateHardware = useDesigner((s) => s.updateCabinetHardware)
  const c = cabinet.construction
  const h = cabinet.hardware
  const pulls = [{ value: NO_PULL, label: 'No pull' }, ...hardwareOptions(project, 'pull')]
  const doorBays = cabinet.sections.flatMap((s, si) => s.bays.map((bay, bi) => ({ s, si, bay, bi })).filter(({ bay }) => bay.kind === 'door'))
  return (
    <SpecCard
      index="01·8"
      title="Doors"
      summary={doorsSummary(cabinet)}
      advanced={
        <>
          <LengthInput label="Hinge cup diameter" value={c.hinge.cupDiameter} units={units} min={1} onCommit={(cupDiameter) => set({ hinge: { ...c.hinge, cupDiameter } })} />
          <LengthInput label="Hinge cup depth" value={c.hinge.cupDepth} units={units} onCommit={(cupDepth) => set({ hinge: { ...c.hinge, cupDepth } })} />
          <LengthInput label="Cup edge distance" value={c.hinge.cupEdgeDistance} units={units} onCommit={(cupEdgeDistance) => set({ hinge: { ...c.hinge, cupEdgeDistance } })} />
          <LengthInput label="Hinge end distance" value={c.hinge.endDistance} units={units} onCommit={(endDistance) => set({ hinge: { ...c.hinge, endDistance } })} />
          <div className="col-span-2">
            <SelectField
              label="Fronts material"
              value={c.frontMaterialId}
              options={withCurrent(materialOptions(project, 'sheet'), c.frontMaterialId)}
              onChange={(frontMaterialId) => set({ frontMaterialId })}
            />
          </div>
        </>
      }
    >
      {doorBays.length === 0 && <p className="text-xs text-muted-foreground">No door bays. Change a bay to “Door” in Layout.</p>}
      {doorBays.map(({ s, si, bay, bi }) => (
        <div key={bay.id} className="flex flex-col gap-2 rounded-md border border-dashed p-2.5">
          <CardCaption>{doorBays.length > 1 ? `Section ${si + 1}, bay ${bi + 1}` : 'Door bay'}</CardCaption>
          <FieldGrid>
            <SelectField
              label={`Doors in section ${si + 1}, bay ${bi + 1}`}
              isLabelHidden
              value={bay.doorCount === 2 ? '2' : '1'}
              options={[
                { value: '1', label: 'Single door' },
                { value: '2', label: 'Pair of doors' },
              ]}
              onChange={(v) => updateBay(cabinet.id, s.id, bay.id, { doorCount: v === '2' ? 2 : 1 })}
            />
            {bay.doorCount === 1 && (
              <SelectField
                label={`Hinge side, section ${si + 1}, bay ${bi + 1}`}
                isLabelHidden
                value={bay.hingeSide}
                options={[
                  { value: 'left', label: 'Hinged left' },
                  { value: 'right', label: 'Hinged right' },
                ]}
                onChange={(hingeSide) => updateBay(cabinet.id, s.id, bay.id, { hingeSide })}
              />
            )}
          </FieldGrid>
        </div>
      ))}
      <FieldGrid>
        <SelectField label="Hinge" value={h.hingeId} options={withCurrent(hardwareOptions(project, 'hinge'), h.hingeId)} onChange={(hingeId) => updateHardware(cabinet.id, { hingeId })} />
        <SelectField
          label="Pull"
          value={h.pullId ?? NO_PULL}
          options={withCurrent(pulls, h.pullId ?? NO_PULL)}
          onChange={(v) => updateHardware(cabinet.id, { pullId: v === NO_PULL ? null : v })}
        />
      </FieldGrid>
    </SpecCard>
  )
}

function BackCard({ cabinet, project, units }: CardProps) {
  const set = useConstruction(cabinet)
  const c = cabinet.construction
  return (
    <SpecCard
      index="01·9"
      title="Back"
      summary={backSummary(cabinet, units)}
      advanced={
        <>
          <LengthInput label="Groove depth" value={c.back.grooveDepth} units={units} onCommit={(grooveDepth) => set({ back: { ...c.back, grooveDepth } })} />
          <LengthInput label="Back inset" value={c.back.inset} units={units} onCommit={(inset) => set({ back: { ...c.back, inset } })} />
          <div className="col-span-2">
            <SelectField
              label="Back material"
              value={c.backMaterialId}
              options={withCurrent(materialOptions(project, 'sheet'), c.backMaterialId)}
              onChange={(backMaterialId) => set({ backMaterialId })}
            />
          </div>
        </>
      }
    >
      <SelectField label="Back" value={c.back.construction} options={BACKS} onChange={(construction) => set({ back: { ...c.back, construction } })} />
    </SpecCard>
  )
}

/** 01 Design: one numbered card per decision, simple first, details on demand. */
export function DesignSection({ cabinet, project }: { cabinet: Cabinet; project: Project }) {
  const props = { cabinet, project, units: project.units }
  return (
    <div className="flex flex-col gap-2">
      <DimensionsCard {...props} />
      <StyleCard {...props} />
      <ToeKickCard {...props} />
      <TopCard {...props} />
      <LayoutCard {...props} />
      <ShelvesCard {...props} />
      <DrawersCard {...props} />
      <DoorsCard {...props} />
      <BackCard {...props} />
    </div>
  )
}
