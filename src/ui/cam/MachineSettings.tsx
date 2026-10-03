'use client'

import type { Machine, MachinePoint, Tool, UnitSystem } from '@/core/types'
import { CheckboxField, FieldGroup, LengthInput, NumberInput, SelectField, type SelectOption, TextInput } from '../components/fields'
import { MAX_TAB_WIDTH, MIN_STEP_DOWN, MIN_TAB_SPACING, TOOL_NUMBER } from '../lib/limits'
import { cuttingTools, duplicateToolNumbers, toolLabel, toolRoleProblem } from '../lib/machineTools'
import { useDesigner } from '../store'

const TOOL_KINDS: SelectOption<Tool['kind']>[] = [
  { value: 'compression', label: 'Compression' },
  { value: 'end-mill', label: 'End mill' },
  { value: 'drill', label: 'Drill' },
]

type ToolRowProps = {
  tool: Tool
  units: UnitSystem
  /** Another tool has the same number. */
  isDuplicate: boolean
}

function ToolRow({ tool, units, isDuplicate }: ToolRowProps) {
  const updateTool = useDesigner((s) => s.updateTool)
  const set = (patch: Partial<Omit<Tool, 'id'>>): void => updateTool(tool.id, patch)
  const name = `T${tool.number}`
  const numberError = isDuplicate ? `${name} is used by another tool; numbers must be unique` : undefined
  return (
    <tr>
      <td>
        <NumberInput
          label={`${name} number`}
          isLabelHidden
          value={tool.number}
          integer
          min={TOOL_NUMBER.min}
          max={TOOL_NUMBER.max}
          error={numberError}
          onCommit={(number) => set({ number })}
        />
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
        <LengthInput
          label={`${name} flute length`}
          isLabelHidden
          value={tool.fluteLength}
          units={units}
          min={Math.max(MIN_STEP_DOWN, tool.stepDown)}
          onCommit={(fluteLength) => set({ fluteLength })}
        />
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
        <LengthInput
          label={`${name} step down`}
          isLabelHidden
          value={tool.stepDown}
          units={units}
          min={MIN_STEP_DOWN}
          max={tool.fluteLength}
          onCommit={(stepDown) => set({ stepDown })}
        />
      </td>
    </tr>
  )
}

export function ToolTable({ tools, units }: { tools: readonly Tool[]; units: UnitSystem }) {
  const duplicates = duplicateToolNumbers(tools)
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
            <ToolRow key={t.id} tool={t} units={units} isDuplicate={duplicates.has(t.number)} />
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

const toolOption = (t: Tool): SelectOption<string> => ({ value: t.id, label: toolLabel(t) })

type ToolChoice = { options: SelectOption<string>[]; error?: string }

/**
 * Options for a machine tool role (`mustCut`: profile/dado, so no drills). The
 * current choice stays listed so the select shows the truth, flagged when it
 * is missing or unsuitable.
 */
function toolChoice(role: string, currentId: string, tools: readonly Tool[], mustCut: boolean): ToolChoice {
  const allowed = mustCut ? cuttingTools(tools) : tools
  const options = allowed.map(toolOption)
  const error = toolRoleProblem(role, currentId, tools, mustCut) ?? undefined
  if (allowed.some((t) => t.id === currentId)) return { options, error }
  const current = tools.find((t) => t.id === currentId)
  const label = current ? `${toolLabel(current)} (drill)` : `${currentId} (missing)`
  return { options: [{ value: currentId, label }, ...options], error }
}

type MachineSettingsProps = {
  machine: Machine
  tools: readonly Tool[]
  units: UnitSystem
}

export function MachineSettings({ machine, tools, units }: MachineSettingsProps) {
  const update = useDesigner((s) => s.updateMachine)
  const set = (patch: Partial<Machine>): void => update(patch)
  const profile = toolChoice('Profile', machine.profileToolId, tools, true)
  const dado = toolChoice('Dado', machine.dadoToolId, tools, true)
  const drill = toolChoice('Drill', machine.drillToolId, tools, false)
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
        <LengthInput label="Safe Z" value={machine.safeZ} units={units} min={0.1} onCommit={(safeZ) => set({ safeZ })} />
        <LengthInput label="Program safe Z" value={machine.programSafeZ} units={units} min={0.1} onCommit={(programSafeZ) => set({ programSafeZ })} />
        <LengthInput label="Rapid clearance" value={machine.rapidClearance} units={units} onCommit={(rapidClearance) => set({ rapidClearance })} />
        <LengthInput label="Through-cut extra depth" value={machine.throughCutExtra} units={units} onCommit={(throughCutExtra) => set({ throughCutExtra })} />
        <SelectField label="Profile tool" value={machine.profileToolId} {...profile} onChange={(profileToolId) => set({ profileToolId })} />
        <SelectField label="Dado tool" value={machine.dadoToolId} {...dado} onChange={(dadoToolId) => set({ dadoToolId })} />
        <SelectField label="Drill tool" value={machine.drillToolId} {...drill} onChange={(drillToolId) => set({ drillToolId })} />
      </FieldGroup>

      <FieldGroup title="Tabs & onion skin" isOpen>
        <CheckboxField label="Hold parts with tabs" isChecked={machine.tabs.enabled} onChange={(enabled) => set({ tabs: { ...machine.tabs, enabled } })} />
        <LengthInput label="Tab spacing" value={machine.tabs.spacing} units={units} min={MIN_TAB_SPACING} onCommit={(spacing) => set({ tabs: { ...machine.tabs, spacing } })} />
        <LengthInput label="Tab width" value={machine.tabs.width} units={units} min={0.1} max={MAX_TAB_WIDTH} onCommit={(width) => set({ tabs: { ...machine.tabs, width } })} />
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
