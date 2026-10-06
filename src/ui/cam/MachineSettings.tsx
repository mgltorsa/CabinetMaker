'use client'

import type { Machine, MachinePoint, Tool, UnitSystem } from '@/core/types'
import { CheckboxField, FieldGrid, FieldGroup, LengthInput, NumberInput, SelectField, type SelectOption, TextInput } from '../components/fields'
import { CardCaption, SpecCard } from '../components/sidebar/SpecCard'
import { MAX_TAB_WIDTH, MIN_STEP_DOWN, MIN_TAB_SPACING, TOOL_NUMBER } from '../lib/limits'
import { cuttingTools, duplicateToolNumbers, toolLabel, toolRoleProblem } from '../lib/machineTools'
import { useDesigner } from '../store'

const TOOL_KINDS: SelectOption<Tool['kind']>[] = [
  { value: 'compression', label: 'Compression' },
  { value: 'end-mill', label: 'End mill' },
  { value: 'drill', label: 'Drill' },
]

type ToolCardProps = {
  tool: Tool
  units: UnitSystem
  /** Another tool has the same number. */
  isDuplicate: boolean
}

/** One tool of the library: summary line, all cutting data on expand. */
function ToolCard({ tool, units, isDuplicate }: ToolCardProps) {
  const updateTool = useDesigner((s) => s.updateTool)
  const set = (patch: Partial<Omit<Tool, 'id'>>): void => updateTool(tool.id, patch)
  const name = `T${tool.number}`
  const numberError = isDuplicate ? `${name} is used by another tool; numbers must be unique` : undefined
  return (
    <FieldGroup title={`${name} · ${tool.name}`} description={`Ø ${tool.diameter} · ${tool.kind}`} isOpen={isDuplicate}>
      <NumberInput label={`${name} number`} value={tool.number} integer min={TOOL_NUMBER.min} max={TOOL_NUMBER.max} error={numberError} onCommit={(number) => set({ number })} />
      <SelectField label={`${name} kind`} value={tool.kind} options={TOOL_KINDS} onChange={(kind) => set({ kind })} />
      <div className="col-span-2">
        <TextInput label={`${name} name`} value={tool.name} onCommit={(n) => set({ name: n })} />
      </div>
      <LengthInput label={`${name} diameter`} value={tool.diameter} units={units} min={0.1} onCommit={(diameter) => set({ diameter })} />
      <LengthInput
        label={`${name} flute length`}
        value={tool.fluteLength}
        units={units}
        min={Math.max(MIN_STEP_DOWN, tool.stepDown)}
        onCommit={(fluteLength) => set({ fluteLength })}
      />
      <NumberInput label={`${name} RPM`} value={tool.rpm} integer min={1} onCommit={(rpm) => set({ rpm })} />
      <LengthInput label={`${name} step down`} value={tool.stepDown} units={units} min={MIN_STEP_DOWN} max={tool.fluteLength} onCommit={(stepDown) => set({ stepDown })} />
      <NumberInput label={`${name} plunge feed (mm/min)`} value={tool.plungeFeed} min={1} onCommit={(plungeFeed) => set({ plungeFeed })} />
      <NumberInput label={`${name} cut feed (mm/min)`} value={tool.cutFeed} min={1} onCommit={(cutFeed) => set({ cutFeed })} />
    </FieldGroup>
  )
}

export function ToolLibrary({ tools, units }: { tools: readonly Tool[]; units: UnitSystem }) {
  const duplicates = duplicateToolNumbers(tools)
  return (
    <div className="flex flex-col gap-2">
      {tools.map((t) => (
        // Re-keyed on the duplicate flag so a card opens itself when it gains the error.
        <ToolCard key={`${t.id}:${duplicates.has(t.number)}`} tool={t} units={units} isDuplicate={duplicates.has(t.number)} />
      ))}
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

export type ToolChoice = { options: SelectOption<string>[]; error?: string }

/**
 * Options for a machine tool role (`mustCut`: profile/dado, so no drills). The
 * current choice stays listed so the select shows the truth, flagged when it
 * is missing or unsuitable.
 */
export function toolChoice(role: string, currentId: string, tools: readonly Tool[], mustCut: boolean): ToolChoice {
  const allowed = mustCut ? cuttingTools(tools) : tools
  const options = allowed.map(toolOption)
  const error = toolRoleProblem(role, currentId, tools, mustCut) ?? undefined
  if (allowed.some((t) => t.id === currentId)) return { options, error }
  const current = tools.find((t) => t.id === currentId)
  const label = current ? `${toolLabel(current)} (drill)` : `${currentId} (missing)`
  return { options: [{ value: currentId, label }, ...options], error }
}

type CamSectionProps = {
  machine: Machine
  tools: readonly Tool[]
  units: UnitSystem
}

/** 04 CAM / CNC: machine, tools, hold-down and positions. The toolpath preview is in the main area. */
export function CamSection({ machine, tools, units }: CamSectionProps) {
  const update = useDesigner((s) => s.updateMachine)
  const set = (patch: Partial<Machine>): void => update(patch)
  const profile = toolChoice('Profile', machine.profileToolId, tools, true)
  const dado = toolChoice('Dado', machine.dadoToolId, tools, true)
  const drill = toolChoice('Drill', machine.drillToolId, tools, false)
  const unitsOptions: SelectOption<Machine['units']>[] = [
    { value: 'G21', label: 'Metric (G21)' },
    { value: 'G20', label: 'Inch (G20) — coming soon', isDisabled: true },
  ]
  const toolName = (id: string): string => {
    const t = tools.find((x) => x.id === id)
    return t ? `T${t.number}` : '—'
  }
  const duplicates = duplicateToolNumbers(tools)

  return (
    <div className="flex flex-col gap-2">
      <SpecCard
        index="04·1"
        title="Machine"
        summary={`${machine.name} · ${machine.tableX} × ${machine.tableY}`}
        defaultOpen
        advanced={
          <>
            <LengthInput label="Program safe Z" value={machine.programSafeZ} units={units} min={0.1} onCommit={(programSafeZ) => set({ programSafeZ })} />
            <LengthInput label="Rapid clearance" value={machine.rapidClearance} units={units} onCommit={(rapidClearance) => set({ rapidClearance })} />
            <LengthInput label="Through-cut extra depth" value={machine.throughCutExtra} units={units} onCommit={(throughCutExtra) => set({ throughCutExtra })} />
            <SelectField label="Output units" value={machine.units} options={unitsOptions} onChange={(u) => set({ units: u })} />
          </>
        }
      >
        <FieldGrid>
          <div className="col-span-2">
            <TextInput label="Machine name" value={machine.name} onCommit={(name) => set({ name })} />
          </div>
          <LengthInput label="Table X" value={machine.tableX} units={units} min={1} onCommit={(tableX) => set({ tableX })} />
          <LengthInput label="Table Y" value={machine.tableY} units={units} min={1} onCommit={(tableY) => set({ tableY })} />
          <LengthInput label="Safe Z" value={machine.safeZ} units={units} min={0.1} onCommit={(safeZ) => set({ safeZ })} />
        </FieldGrid>
      </SpecCard>

      <SpecCard
        index="04·2"
        title="Tooling"
        summary={`Profile ${toolName(machine.profileToolId)} · dado ${toolName(machine.dadoToolId)} · drill ${toolName(machine.drillToolId)}`}
        defaultOpen={duplicates.size > 0}
      >
        <FieldGrid className="grid-cols-3">
          <SelectField label="Profile tool" value={machine.profileToolId} {...profile} onChange={(profileToolId) => set({ profileToolId })} />
          <SelectField label="Dado tool" value={machine.dadoToolId} {...dado} onChange={(dadoToolId) => set({ dadoToolId })} />
          <SelectField label="Drill tool" value={machine.drillToolId} {...drill} onChange={(drillToolId) => set({ drillToolId })} />
        </FieldGrid>
        <CardCaption className="pt-1">Tool library</CardCaption>
        <ToolLibrary tools={tools} units={units} />
      </SpecCard>

      <SpecCard
        index="04·3"
        title="Hold-down"
        summary={machine.tabs.enabled ? `Tabs every ${machine.tabs.spacing} · ${machine.tabs.width} wide` : `Onion skin ${machine.onionSkin}`}
      >
        <CheckboxField label="Hold parts with tabs" isChecked={machine.tabs.enabled} onChange={(enabled) => set({ tabs: { ...machine.tabs, enabled } })} />
        <FieldGrid>
          <LengthInput label="Tab spacing" value={machine.tabs.spacing} units={units} min={MIN_TAB_SPACING} onCommit={(spacing) => set({ tabs: { ...machine.tabs, spacing } })} />
          <LengthInput label="Tab width" value={machine.tabs.width} units={units} min={0.1} max={MAX_TAB_WIDTH} onCommit={(width) => set({ tabs: { ...machine.tabs, width } })} />
          <LengthInput label="Tab thickness" value={machine.tabs.thickness} units={units} min={0.1} onCommit={(thickness) => set({ tabs: { ...machine.tabs, thickness } })} />
          <LengthInput label="Onion skin (tabs off)" value={machine.onionSkin} units={units} onCommit={(onionSkin) => set({ onionSkin })} />
        </FieldGrid>
      </SpecCard>

      <SpecCard index="04·4" title="Positions" summary={`Tool change ${machine.toolChange.mode === 'manual' ? 'manual (pause)' : 'automatic (M6)'}`}>
        <SelectField
          label="Tool change"
          value={machine.toolChange.mode}
          options={[
            { value: 'manual', label: 'Manual (pause)' },
            { value: 'auto', label: 'Automatic (M6)' },
          ]}
          onChange={(mode) => set({ toolChange: { ...machine.toolChange, mode } })}
        />
        <FieldGrid className="grid-cols-3">
          <PointFields label="Home" point={machine.home} units={units} onCommit={(home) => set({ home })} />
          <PointFields label="Tool change" point={machine.toolChange} units={units} onCommit={(p) => set({ toolChange: { ...p, mode: machine.toolChange.mode } })} />
          <PointFields label="Park" point={machine.park} units={units} onCommit={(park) => set({ park })} />
        </FieldGrid>
      </SpecCard>
    </div>
  )
}
