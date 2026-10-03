'use client'

import type {
  BackConstruction,
  Cabinet,
  CabinetType,
  ConstructionMethod,
  ConstructionStyle,
  DrawerJoinery,
  HardwareItem,
  HardwareKind,
  JoineryType,
  Project,
  SlideMount,
  TopConstruction,
  TopKind,
  ToeKickType,
  UnitSystem,
} from '@/core/types'
import { CABINET_DIMENSION, FLOOR_HEIGHT, MAX_SHELF_PIN_DIAMETER, MIN_SHELF_PIN_SPACING } from '../lib/limits'
import { hasSideMountSlides, slidesForMount } from '../lib/slides'
import { selectedCabinet, useDesigner } from '../store'
import { CheckboxField, FieldGroup, LengthInput, SelectField, type SelectOption, TextInput } from './fields'
import { SectionsEditor } from './SectionsEditor'

const opts = <T extends string>(pairs: [T, string][]): SelectOption<T>[] => pairs.map(([value, label]) => ({ value, label }))

const CABINET_TYPES = opts<CabinetType>([
  ['base', 'Base'],
  ['wall', 'Wall'],
  ['tall', 'Tall / pantry'],
  ['drawer-bank', 'Drawer bank'],
  ['bookshelf', 'Bookshelf'],
  ['nightstand', 'Nightstand'],
  ['dresser', 'Dresser'],
  ['vanity', 'Vanity'],
  ['custom', 'Custom'],
])
const STYLES = opts<ConstructionStyle>([
  ['frameless-overlay', 'Frameless, full overlay'],
  ['frameless-inset', 'Frameless, inset'],
  ['face-frame-overlay', 'Face frame, overlay'],
  ['face-frame-inset', 'Face frame, inset'],
])
const JOINERY = opts<JoineryType>([
  ['none', 'Screws only'],
  ['dowel', 'Dowel'],
  ['domino', 'Domino'],
  ['dado', 'Dado / groove'],
])
const DRAWER_JOINERY = opts<DrawerJoinery>([
  ['none', 'Screws only'],
  ['dowel', 'Dowel'],
  ['domino', 'Domino'],
  ['dado', 'Dado'],
])
const BACKS = opts<BackConstruction>([
  ['captured', 'Captured in groove'],
  ['applied', 'Applied to rear'],
])
const TOE_KICKS = opts<ToeKickType>([
  ['none', 'None'],
  ['panel', 'Panel'],
  ['full', 'Full (separate base)'],
])
const TOP_CONSTRUCTIONS = opts<TopConstruction>([
  ['stretchers', 'Stretchers'],
  ['full-top', 'Full top panel'],
])
/** Side mount is offered only when the catalog has a side-mount slide (or the cabinet already uses it). */
function slideMountOptions(project: Project, current: SlideMount): SelectOption<SlideMount>[] {
  const hasSide = hasSideMountSlides(project.hardware)
  return [
    { value: 'undermount', label: 'Undermount' },
    {
      value: 'side-mount',
      label: hasSide ? 'Side mount' : 'Side mount (no side-mount slides in catalog)',
      isDisabled: !hasSide && current !== 'side-mount',
    },
  ]
}
const TOP_KINDS = opts<TopKind>([
  ['none', 'None'],
  ['finished', 'Finished top'],
  ['countertop', 'Countertop'],
])

type FormProps = { cabinet: Cabinet; project: Project; units: UnitSystem }

function materialOptions(project: Project, kind: 'sheet' | 'linear'): SelectOption<string>[] {
  return project.materials.filter((m) => m.kind === kind).map((m) => ({ value: m.id, label: m.name }))
}

const hardwareOption = (h: HardwareItem): SelectOption<string> => ({ value: h.id, label: `${h.name} (${h.manufacturer} ${h.sku})` })

function hardwareOptions(project: Project, kind: HardwareKind): SelectOption<string>[] {
  return project.hardware.filter((h) => h.kind === kind).map(hardwareOption)
}

/** Slides of the cabinet's mount; a current slide of the other mount stays listed, marked as such. */
function slideOptions(project: Project, mount: SlideMount, currentId: string): SelectOption<string>[] {
  const options = slidesForMount(project.hardware, mount).map(hardwareOption)
  const current = project.hardware.find((h) => h.id === currentId && h.kind === 'slide')
  if (!current || options.some((o) => o.value === currentId)) return withCurrent(options, currentId)
  return [{ value: current.id, label: `${current.name} (other mount)` }, ...options]
}

/** Keep the current id selectable even if it is missing from the catalog. */
function withCurrent(options: SelectOption<string>[], current: string): SelectOption<string>[] {
  return options.some((o) => o.value === current) ? options : [{ value: current, label: `${current} (missing)` }, ...options]
}

function DimensionsGroup({ cabinet, units }: Omit<FormProps, 'project'>) {
  const update = useDesigner((s) => s.updateCabinet)
  const set = (patch: Parameters<typeof update>[1]): void => update(cabinet.id, patch)
  return (
    <FieldGroup title="Cabinet" isOpen>
      <TextInput label="Name" value={cabinet.name} onCommit={(name) => set({ name })} className="span-2" />
      <SelectField label="Type" value={cabinet.type} options={CABINET_TYPES} onChange={(type) => set({ type })} />
      <LengthInput label="Width" value={cabinet.width} units={units} {...CABINET_DIMENSION} onCommit={(width) => set({ width })} />
      <LengthInput label="Height" value={cabinet.height} units={units} {...CABINET_DIMENSION} onCommit={(height) => set({ height })} />
      <LengthInput label="Depth" value={cabinet.depth} units={units} {...CABINET_DIMENSION} onCommit={(depth) => set({ depth })} />
      <LengthInput label="Floor height" value={cabinet.floorHeight} units={units} {...FLOOR_HEIGHT} onCommit={(floorHeight) => set({ floorHeight })} />
    </FieldGroup>
  )
}

export function ConstructionGroups({ cabinet, project, units }: FormProps) {
  const update = useDesigner((s) => s.updateConstruction)
  const setSlideMount = useDesigner((s) => s.setSlideMount)
  const c = cabinet.construction
  const set = (patch: Partial<ConstructionMethod>): void => update(cabinet.id, patch)
  const sheets = materialOptions(project, 'sheet')
  const isFaceFrame = c.style.startsWith('face-frame')

  return (
    <>
      <FieldGroup title="Construction">
        <SelectField label="Style" value={c.style} options={STYLES} onChange={(style) => set({ style })} />
        <SelectField label="Carcass joinery" value={c.joinery} options={JOINERY} onChange={(joinery) => set({ joinery })} />
        <SelectField label="Top construction" value={c.top} options={TOP_CONSTRUCTIONS} onChange={(top) => set({ top })} />
        <LengthInput label="Stretcher width" value={c.stretcherWidth} units={units} onCommit={(stretcherWidth) => set({ stretcherWidth })} />
        <CheckboxField label="Rear nailer" isChecked={c.rearNailer} onChange={(rearNailer) => set({ rearNailer })} />
        <LengthInput label="Nailer width" value={c.nailerWidth} units={units} onCommit={(nailerWidth) => set({ nailerWidth })} />
        <CheckboxField label="System 32 holes" isChecked={c.system32} onChange={(system32) => set({ system32 })} />
        <LengthInput label="Edge reveal" value={c.reveal.edge} units={units} onCommit={(edge) => set({ reveal: { ...c.reveal, edge } })} />
        <LengthInput label="Gap between fronts" value={c.reveal.between} units={units} onCommit={(between) => set({ reveal: { ...c.reveal, between } })} />
      </FieldGroup>

      <FieldGroup title="Materials">
        <SelectField label="Carcass" value={c.carcassMaterialId} options={withCurrent(sheets, c.carcassMaterialId)} onChange={(carcassMaterialId) => set({ carcassMaterialId })} />
        <SelectField label="Back" value={c.backMaterialId} options={withCurrent(sheets, c.backMaterialId)} onChange={(backMaterialId) => set({ backMaterialId })} />
        <SelectField label="Fronts" value={c.frontMaterialId} options={withCurrent(sheets, c.frontMaterialId)} onChange={(frontMaterialId) => set({ frontMaterialId })} />
        <SelectField label="Drawer boxes" value={c.drawerBoxMaterialId} options={withCurrent(sheets, c.drawerBoxMaterialId)} onChange={(drawerBoxMaterialId) => set({ drawerBoxMaterialId })} />
        <SelectField
          label="Drawer bottoms"
          value={c.drawerBottomMaterialId}
          options={withCurrent(sheets, c.drawerBottomMaterialId)}
          onChange={(drawerBottomMaterialId) => set({ drawerBottomMaterialId })}
        />
        <SelectField
          label="Face frame stock"
          value={c.faceFrameMaterialId}
          options={withCurrent(materialOptions(project, 'linear'), c.faceFrameMaterialId)}
          onChange={(faceFrameMaterialId) => set({ faceFrameMaterialId })}
        />
      </FieldGroup>

      <FieldGroup title="Back & toe kick">
        <SelectField label="Back" value={c.back.construction} options={BACKS} onChange={(construction) => set({ back: { ...c.back, construction } })} />
        <LengthInput label="Groove depth" value={c.back.grooveDepth} units={units} onCommit={(grooveDepth) => set({ back: { ...c.back, grooveDepth } })} />
        <LengthInput label="Back inset" value={c.back.inset} units={units} onCommit={(inset) => set({ back: { ...c.back, inset } })} />
        <SelectField label="Toe kick" value={c.toeKick.type} options={TOE_KICKS} onChange={(type) => set({ toeKick: { ...c.toeKick, type } })} />
        <LengthInput label="Toe kick height" value={c.toeKick.height} units={units} onCommit={(height) => set({ toeKick: { ...c.toeKick, height } })} />
        <LengthInput label="Toe kick setback" value={c.toeKick.setback} units={units} onCommit={(setback) => set({ toeKick: { ...c.toeKick, setback } })} />
      </FieldGroup>

      {isFaceFrame && (
        <FieldGroup title="Face frame">
          <LengthInput label="Stile width" value={c.faceFrame.stileWidth} units={units} min={1} onCommit={(stileWidth) => set({ faceFrame: { ...c.faceFrame, stileWidth } })} />
          <LengthInput label="Rail width" value={c.faceFrame.railWidth} units={units} min={1} onCommit={(railWidth) => set({ faceFrame: { ...c.faceFrame, railWidth } })} />
          <LengthInput label="Overhang" value={c.faceFrame.overhang} units={units} onCommit={(overhang) => set({ faceFrame: { ...c.faceFrame, overhang } })} />
        </FieldGroup>
      )}

      <FieldGroup title="Shelf pins & hinges">
        <LengthInput label="Pin row inset" value={c.shelfPins.inset} units={units} onCommit={(inset) => set({ shelfPins: { ...c.shelfPins, inset } })} />
        <LengthInput label="Pin spacing" value={c.shelfPins.spacing} units={units} min={MIN_SHELF_PIN_SPACING} onCommit={(spacing) => set({ shelfPins: { ...c.shelfPins, spacing } })} />
        <LengthInput
          label="Pin diameter"
          value={c.shelfPins.diameter}
          units={units}
          min={0.1}
          max={MAX_SHELF_PIN_DIAMETER}
          onCommit={(diameter) => set({ shelfPins: { ...c.shelfPins, diameter } })}
        />
        <LengthInput label="Pin depth" value={c.shelfPins.depth} units={units} onCommit={(depth) => set({ shelfPins: { ...c.shelfPins, depth } })} />
        <LengthInput label="Hinge cup diameter" value={c.hinge.cupDiameter} units={units} min={1} onCommit={(cupDiameter) => set({ hinge: { ...c.hinge, cupDiameter } })} />
        <LengthInput label="Hinge cup depth" value={c.hinge.cupDepth} units={units} onCommit={(cupDepth) => set({ hinge: { ...c.hinge, cupDepth } })} />
        <LengthInput label="Cup edge distance" value={c.hinge.cupEdgeDistance} units={units} onCommit={(cupEdgeDistance) => set({ hinge: { ...c.hinge, cupEdgeDistance } })} />
        <LengthInput label="Hinge end distance" value={c.hinge.endDistance} units={units} onCommit={(endDistance) => set({ hinge: { ...c.hinge, endDistance } })} />
      </FieldGroup>

      <FieldGroup title="Drawers">
        <SelectField
          label="Slide mount"
          value={c.drawer.slideMount}
          options={slideMountOptions(project, c.drawer.slideMount)}
          onChange={(slideMount) => setSlideMount(cabinet.id, slideMount)}
        />
        <SelectField label="Drawer box joinery" value={c.drawer.joinery} options={DRAWER_JOINERY} onChange={(joinery) => set({ drawer: { ...c.drawer, joinery } })} />
        <LengthInput label="Rear clearance" value={c.drawer.rearClearance} units={units} onCommit={(rearClearance) => set({ drawer: { ...c.drawer, rearClearance } })} />
      </FieldGroup>
    </>
  )
}

const NO_PULL = '__none__'

export function HardwareGroup({ cabinet, project }: Omit<FormProps, 'units'>) {
  const update = useDesigner((s) => s.updateCabinetHardware)
  const h = cabinet.hardware
  const set = (patch: Partial<Cabinet['hardware']>): void => update(cabinet.id, patch)
  const pulls = [{ value: NO_PULL, label: 'No pull' }, ...hardwareOptions(project, 'pull')]
  return (
    <FieldGroup title="Hardware">
      <SelectField label="Hinge" value={h.hingeId} options={withCurrent(hardwareOptions(project, 'hinge'), h.hingeId)} onChange={(hingeId) => set({ hingeId })} />
      <SelectField
        label="Slide"
        value={h.slideId}
        options={slideOptions(project, cabinet.construction.drawer.slideMount, h.slideId)}
        onChange={(slideId) => set({ slideId })}
      />
      <SelectField label="Pull" value={h.pullId ?? NO_PULL} options={withCurrent(pulls, h.pullId ?? NO_PULL)} onChange={(v) => set({ pullId: v === NO_PULL ? null : v })} />
      <SelectField label="Shelf pin" value={h.shelfPinId} options={withCurrent(hardwareOptions(project, 'shelf-pin'), h.shelfPinId)} onChange={(shelfPinId) => set({ shelfPinId })} />
    </FieldGroup>
  )
}

const NO_MATERIAL = '__none__'

function TopGroup({ cabinet, project, units }: FormProps) {
  const update = useDesigner((s) => s.updateCabinetTop)
  const t = cabinet.top
  const set = (patch: Partial<Cabinet['top']>): void => update(cabinet.id, patch)
  const materials = [{ value: NO_MATERIAL, label: 'Default' }, ...materialOptions(project, 'sheet')]
  return (
    <FieldGroup title="Top / countertop">
      <SelectField label="Top" value={t.kind} options={TOP_KINDS} onChange={(kind) => set({ kind })} />
      {t.kind !== 'none' && (
        <>
          <SelectField
            label="Top material"
            value={t.materialId ?? NO_MATERIAL}
            options={withCurrent(materials, t.materialId ?? NO_MATERIAL)}
            onChange={(v) => set({ materialId: v === NO_MATERIAL ? null : v })}
          />
          <LengthInput label="Top thickness" value={t.thickness} units={units} min={1} onCommit={(thickness) => set({ thickness })} />
          <LengthInput label="Front overhang" value={t.overhangFront} units={units} onCommit={(overhangFront) => set({ overhangFront })} />
          <LengthInput label="Side overhang" value={t.overhangSides} units={units} onCommit={(overhangSides) => set({ overhangSides })} />
        </>
      )}
    </FieldGroup>
  )
}

/** Parameter form for the selected cabinet. */
export function CabinetForm() {
  const cabinet = useDesigner(selectedCabinet)
  const project = useDesigner((s) => s.project)
  if (!cabinet) return null
  const units = project.units
  return (
    <section key={cabinet.id} className="panel cabinet-form" aria-labelledby="cabinet-form-heading">
      <h2 id="cabinet-form-heading">Edit: {cabinet.name}</h2>
      <DimensionsGroup cabinet={cabinet} units={units} />
      <SectionsEditor cabinet={cabinet} units={units} />
      <ConstructionGroups cabinet={cabinet} project={project} units={units} />
      <HardwareGroup cabinet={cabinet} project={project} />
      <TopGroup cabinet={cabinet} project={project} units={units} />
    </section>
  )
}
