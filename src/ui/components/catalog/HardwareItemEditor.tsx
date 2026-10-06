'use client'

import { ChevronRightIcon, CopyIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { resolveHandle } from '@/core/handles'
import type { HardwareItem, HardwareKind, Project } from '@/core/types'
import { HARDWARE_KIND_LABEL, hardwareUses, replacementCandidates, SLOT_KIND, type HardwareUse } from '../../costOps'
import { money } from '../../lib/format'
import { HANDLE_STYLE_LABEL } from '../../handleOps'
import { HINGE_OPENING_ANGLE, MAX_MONEY, SLIDE_LENGTH } from '../../lib/limits'
import { SLIDE_MOUNT_PROP } from '../../lib/slides'
import { useDesigner } from '../../store'
import { CommitField, LengthInput, NumberInput, SelectField, type SelectOption, TextInput } from '../fields'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { HandleFields } from './HandleFields'

export const HARDWARE_KINDS: readonly HardwareKind[] = Object.keys(HARDWARE_KIND_LABEL) as HardwareKind[]

const NO_PULL = '__none__'
const MOUNT_UNSET = '__unset__'

/** Props edited with dedicated fields; any others are listed read-only. */
const EDITED_PROPS: Readonly<Partial<Record<HardwareKind, readonly string[]>>> = {
  slide: ['length', 'mount'],
  hinge: ['openingAngle'],
  pull: ['centers'],
}

/** Free text that may be blank (manufacturer, SKU). */
function OptionalTextInput({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  return <CommitField<string> label={label} value={value} format={(v) => v} parse={(t) => ({ ok: true, value: t.trim() })} onCommit={onCommit} inputMode="text" isFreeText />
}

function usageLabel(use: HardwareUse): string {
  return `${use.cabinetName} (${HARDWARE_KIND_LABEL[SLOT_KIND[use.slot]].toLowerCase()})`
}

/** `Name (Manufacturer SKU)`, without empty parts. */
function itemLabel(h: HardwareItem): string {
  const source = [h.manufacturer, h.sku].filter((part) => part !== '').join(' ')
  return source === '' ? h.name : `${h.name} (${source})`
}

type ItemProps = { item: HardwareItem; project: Project }

function KindProps({ item, project }: ItemProps) {
  const setProp = useDesigner((s) => s.setHardwareProp)
  const set = (key: string) => (value: number) => setProp(item.id, key, value)
  const units = project.units
  if (item.kind === 'slide') {
    const mount = item.props.mount
    const mountValue = mount === SLIDE_MOUNT_PROP['side-mount'] ? 'side-mount' : mount === SLIDE_MOUNT_PROP.undermount ? 'undermount' : MOUNT_UNSET
    const mounts: SelectOption<string>[] = [
      ...(mountValue === MOUNT_UNSET ? [{ value: MOUNT_UNSET, label: 'Either (not set)', isDisabled: true }] : []),
      { value: 'undermount', label: 'Undermount' },
      { value: 'side-mount', label: 'Side mount' },
    ]
    return (
      <>
        <LengthInput label="Slide length" value={item.props.length ?? 0} units={units} min={SLIDE_LENGTH.min} max={SLIDE_LENGTH.max} onCommit={set('length')} />
        <SelectField
          label="Mount"
          value={mountValue}
          options={mounts}
          onChange={(v) => {
            if (v === 'undermount' || v === 'side-mount') set('mount')(SLIDE_MOUNT_PROP[v])
          }}
        />
      </>
    )
  }
  if (item.kind === 'hinge') {
    return <NumberInput label="Opening angle" suffix="°" value={item.props.openingAngle ?? 0} min={HINGE_OPENING_ANGLE.min} max={HINGE_OPENING_ANGLE.max} onCommit={set('openingAngle')} />
  }
  if (item.kind === 'pull') return <HandleFields item={item} project={project} />
  return null
}

function OtherProps({ item }: { item: HardwareItem }) {
  const edited = EDITED_PROPS[item.kind] ?? []
  const others = Object.entries(item.props).filter(([key]) => !edited.includes(key))
  if (others.length === 0) return null
  return <p className="col-span-2 font-mono text-[11px] text-muted-foreground">{others.map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
}

/** A used item cannot be deleted: move its cabinets onto another item of its kind first. */
function ReplaceFlow({ item, project, uses }: ItemProps & { uses: HardwareUse[] }) {
  const replace = useDesigner((s) => s.replaceHardwareItem)
  const candidates = replacementCandidates(project, item.id)
  const options: SelectOption<string>[] = [
    ...candidates.map((h) => ({ value: h.id, label: itemLabel(h) })),
    ...(item.kind === 'pull' ? [{ value: NO_PULL, label: 'No pull' }] : []),
  ]
  const [choice, setChoice] = useState<string>(options[0]?.value ?? '')
  const selected = options.some((o) => o.value === choice) ? choice : (options[0]?.value ?? '')
  const usedBy = uses.map(usageLabel).join(', ')

  const handleReplace = (): void => {
    const target = selected === NO_PULL ? null : selected
    const name = target === null ? 'no pull' : (candidates.find((h) => h.id === target)?.name ?? target)
    if (window.confirm(`Replace “${item.name}” with ${name} on every cabinet and delete it from the catalog?`)) replace(item.id, target)
  }

  return (
    <div className="col-span-2 flex flex-col gap-2 rounded-md border border-dashed p-2">
      <p className="text-xs text-muted-foreground">
        Used by {usedBy}. Kind is locked; to delete it, move those cabinets to another {HARDWARE_KIND_LABEL[item.kind].toLowerCase()}.
      </p>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">Add or duplicate another {HARDWARE_KIND_LABEL[item.kind].toLowerCase()} first.</p>
      ) : (
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <SelectField label="Replace with" value={selected} options={options} onChange={setChoice} />
          <Button variant="destructive" size="sm" onClick={handleReplace}>
            <Trash2Icon /> Replace &amp; delete
          </Button>
        </div>
      )}
    </div>
  )
}

/** `isOpen`: expanded on mount, and again whenever it turns true (an item created by an async import). */
type HardwareItemEditorProps = ItemProps & { isOpen?: boolean }

/** One catalog item: summary line, every field on expand, duplicate / delete / replace. */
export function HardwareItemEditor({ item, project, isOpen = false }: HardwareItemEditorProps) {
  const update = useDesigner((s) => s.updateHardwareItem)
  const duplicate = useDesigner((s) => s.duplicateHardwareItem)
  const remove = useDesigner((s) => s.deleteHardwareItem)
  const set = (patch: Parameters<typeof update>[1]): void => update(item.id, patch)
  const [open, setOpen] = useState(isOpen)
  const [lastIsOpen, setLastIsOpen] = useState(isOpen)
  if (isOpen !== lastIsOpen) {
    setLastIsOpen(isOpen)
    if (isOpen) setOpen(true)
  }
  const uses = hardwareUses(project, item.id)
  const isUsed = uses.length > 0
  const kinds: SelectOption<HardwareKind>[] = HARDWARE_KINDS.map((k) => ({ value: k, label: HARDWARE_KIND_LABEL[k], isDisabled: isUsed && k !== item.kind }))

  const handleDelete = (): void => {
    if (window.confirm(`Delete “${item.name}” from the hardware catalog?`)) remove(item.id)
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/hw rounded-md border bg-background/60">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/hw:rotate-90" />
        <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {item.kind === 'pull' ? HANDLE_STYLE_LABEL[resolveHandle(item).style] : HARDWARE_KIND_LABEL[item.kind]} · {money(item.unitCost, project.estimate.currency)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <fieldset className="grid grid-cols-2 gap-3 border-t px-3 py-3">
          <legend className="sr-only">{item.name}</legend>
          <TextInput className="col-span-2" label="Name" value={item.name} onCommit={(name) => set({ name })} />
          <SelectField label="Kind" value={item.kind} options={kinds} onChange={(kind) => set({ kind })} />
          <NumberInput label="Unit cost" value={item.unitCost} min={0} max={MAX_MONEY} onCommit={(unitCost) => set({ unitCost })} />
          <OptionalTextInput label="Manufacturer" value={item.manufacturer} onCommit={(manufacturer) => set({ manufacturer })} />
          <OptionalTextInput label="SKU" value={item.sku} onCommit={(sku) => set({ sku })} />
          <KindProps item={item} project={project} />
          <OtherProps item={item} />
          {isUsed && <ReplaceFlow item={item} project={project} uses={uses} />}
          <div className="col-span-2 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => duplicate(item.id)}>
              <CopyIcon /> Duplicate
            </Button>
            {!isUsed && (
              <Button variant="outline" size="sm" onClick={handleDelete}>
                <Trash2Icon /> Delete
              </Button>
            )}
          </div>
        </fieldset>
      </CollapsibleContent>
    </Collapsible>
  )
}
