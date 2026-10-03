'use client'

import type { Machine, MachinePoint, Tool, UnitSystem } from '@/core/types'
import { CheckboxField, FieldGroup, LengthInput, NumberInput, SelectField, type SelectOption, TextInput } from '../components/fields'
import { useDesigner } from '../store'

const TOOL_KINDS: SelectOption<Tool['kind']>[] = [
  { value: 'compression', label: 'Compression' },
  { value: 'end-mill', label: 'End mill' },
  { value: 'drill', label: 'Drill' },
]

const MAX_TOOL_NUMBER = 99

function ToolRow({ tool, units }: { tool: Tool; units: UnitSystem }) {
  const updateTool = useDesigner((s) => s.updateTool)
  const set = (patch: Partial<Omit<Tool, 'id'>>): void => updateTool(tool.id, patch)
  const name = `T${tool.number}`
  return (
    <tr>
      <td>
        <NumberInput label={`${name} number`} isLabelHidden value={tool.number} integer min={1} max={MAX_TOOL_NUMBER} onCommit={(number) => set({ number })} />
      </td>
      <td>
        <TextInput label={`${name} name`} isLabelHidden value={tool.name} onCommit={(n) => set({ name: n })} />
      </td>
      <td>
        <SelectField label={`${name} kind`} isLabelHidden value={tool.kind} options={TOOL_KINDS} onChange={(kind) => set({ kind })} />
      </td>
      <td>
        <LengthInput label={`${name} diameter`} isLabelHidden value={tool.diameter} units={units} min={0.1} onCommit={(diameter) => set({ diameter })} />
      </td>
      <td>
        <LengthInput label={`${name} flute length`} isLabelHidden value={tool.fluteLength} units={units} min={0.1} onCommit={(fluteLength) => set({ fluteLength })} />
      </td>
      <td>
        <NumberInput label={`${name} RPM`} isLabelHidden value={tool.rpm} integer min={1} onCommit={(rpm) => set({ rpm })} />
      </td>
      <td>
        <NumberInput label={`${name} plunge feed (mm/min)`} isLabelHidden value={tool.plungeFeed} min={1} onCommit={(plungeFeed) => set({ plungeFeed })} />
      </td>
      <td>
        <NumberInput label={`${name} cut feed (mm/min)`} isLabelHidden value={tool.cutFeed} min={1} onCommit={(cutFeed) => set({ cutFeed })} />
      </td>
      <td>
        <LengthInput label={`${name} step down`} isLabelHidden value={tool.stepDown} units={units} min={0.1} onCommit={(stepDown) => set({ stepDown })} />
      </td>
    </tr>
  )
}

export function ToolTable({ tools, units }: { tools: readonly Tool[]; units: UnitSystem }) {
  return (
    <div className="table-wrap">
      <table className="data-table tool-table">
        <caption>Tool library</caption>
        <thead>
          <tr>
            <th scope="col">No.</th>
            <th scope="col">Name</th>
            <th scope="col">Kind</th>
            <th scope="col">Diameter</th>
            <th scope="col">Flute</th>
            <th scope="col">RPM</th>
            <th scope="col">Plunge mm/min</th>
            <th scope="col">Cut mm/min</th>
            <th scope="col">Step down</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <ToolRow key={t.id} tool={t} units={units} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

type PointFieldsProps = {
  label: string
  point: MachinePoint
  units: UnitSystem
  onCommit: (point: MachinePoint) => void
}

function PointFields({ label, point, units, onCommit }: PointFieldsProps) {
  return (
    <>
      <LengthInput label={`${label} X`} value={point.x} units={units} min={-Infinity} onCommit={(x) => onCommit({ ...point, x })} />
      <LengthInput label={`${label} Y`} value={point.y} units={units} min={-Infinity} onCommit={(y) => onCommit({ ...point, y })} />
      <LengthInput label={`${label} Z`} value={point.z} units={units} min={-Infinity} onCommit={(z) => onCommit({ ...point, z })} />
    </>
  )
}

export function MachineSettings({ machine, tools, units }: { machine: Machine; tools: readonly Tool[]; units: UnitSystem }) {
  const update = useDesigner((s) => s.updateMachine)
  const set = (patch: Partial<Machine>): void => update(patch)
  const toolOptions: SelectOption<string>[] = tools.map((t) => ({ value: t.id, label: `T${t.number} ${t.name}` }))
  const unitsOptions: SelectOption<Machine['units']>[] = [
    { value: 'G21', label: 'Metric (G21)' },
    { value: 'G20', label: 'Inch (G20) — coming soon', isDisabled: true },
  ]

  return (
    <>
      <FieldGroup title="Machine" isOpen>
        <TextInput label="Machine name" value={machine.name} onCommit={(name) => set({ name })} />
        <SelectField label="Output units" value={machine.units} options={unitsOptions} onChange={(u) => set({ units: u })} />
        <LengthInput label="Table X" value={machine.tableX} units={units} min={1} onCommit={(tableX) => set({ tableX })} />
        <LengthInput label="Table Y" value={machine.tableY} units={units} min={1} onCommit={(tableY) => set({ tableY })} />
        <LengthInput label="Edge inset" value={machine.edgeInset} units={units} onCommit={(edgeInset) => set({ edgeInset })} />
        <LengthInput label="Safe Z" value={machine.safeZ} units={units} min={0.1} onCommit={(safeZ) => set({ safeZ })} />
        <LengthInput label="Program safe Z" value={machine.programSafeZ} units={units} min={0.1} onCommit={(programSafeZ) => set({ programSafeZ })} />
        <LengthInput label="Rapid clearance" value={machine.rapidClearance} units={units} onCommit={(rapidClearance) => set({ rapidClearance })} />
        <LengthInput label="Through-cut extra depth" value={machine.throughCutExtra} units={units} onCommit={(throughCutExtra) => set({ throughCutExtra })} />
        <SelectField label="Profile tool" value={machine.profileToolId} options={toolOptions} onChange={(profileToolId) => set({ profileToolId })} />
        <SelectField label="Dado tool" value={machine.dadoToolId} options={toolOptions} onChange={(dadoToolId) => set({ dadoToolId })} />
        <SelectField label="Drill tool" value={machine.drillToolId} options={toolOptions} onChange={(drillToolId) => set({ drillToolId })} />
      </FieldGroup>

      <FieldGroup title="Tabs & onion skin" isOpen>
        <CheckboxField label="Hold parts with tabs" isChecked={machine.tabs.enabled} onChange={(enabled) => set({ tabs: { ...machine.tabs, enabled } })} />
        <LengthInput label="Tab spacing" value={machine.tabs.spacing} units={units} min={1} onCommit={(spacing) => set({ tabs: { ...machine.tabs, spacing } })} />
        <LengthInput label="Tab width" value={machine.tabs.width} units={units} min={0.1} onCommit={(width) => set({ tabs: { ...machine.tabs, width } })} />
        <LengthInput label="Tab thickness" value={machine.tabs.thickness} units={units} min={0.1} onCommit={(thickness) => set({ tabs: { ...machine.tabs, thickness } })} />
        <LengthInput label="Onion skin (tabs off)" value={machine.onionSkin} units={units} onCommit={(onionSkin) => set({ onionSkin })} />
      </FieldGroup>

      <FieldGroup title="Home, tool change & park">
        <PointFields label="Home" point={machine.home} units={units} onCommit={(home) => set({ home })} />
        <SelectField
          label="Tool change"
          value={machine.toolChange.mode}
          options={[
            { value: 'manual', label: 'Manual (pause)' },
            { value: 'auto', label: 'Automatic (M6)' },
          ]}
          onChange={(mode) => set({ toolChange: { ...machine.toolChange, mode } })}
        />
        <PointFields label="Tool change" point={machine.toolChange} units={units} onCommit={(p) => set({ toolChange: { ...p, mode: machine.toolChange.mode } })} />
        <PointFields label="Park" point={machine.park} units={units} onCommit={(park) => set({ park })} />
      </FieldGroup>

      <ToolTable tools={tools} units={units} />
    </>
  )
}
