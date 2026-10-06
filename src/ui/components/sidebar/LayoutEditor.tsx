'use client'

import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import type { Bay, Cabinet, UnitSystem } from '@/core/types'
import { DEFAULT_ROD_DROP } from '@/engine/constants'
import { cn } from '../../lib/cn'
import { MAX_BAYS, MAX_SECTIONS, MAX_SHELVES, ROD_DROP, SECTION_SIZE } from '../../lib/limits'
import { BAY_KINDS } from '../../lib/options'
import { useDesigner } from '../../store'
import { CheckboxField, LengthInput, NumberInput, OptionalLengthInput, SelectField, type SelectOption } from '../fields'
import { Button } from '../ui/button'
import { CardCaption } from './SpecCard'

const DOOR_COUNTS: SelectOption<'1' | '2'>[] = [
  { value: '1', label: 'Single door' },
  { value: '2', label: 'Pair of doors' },
]

const HINGE_SIDES: SelectOption<Bay['hingeSide']>[] = [
  { value: 'left', label: 'Hinged left' },
  { value: 'right', label: 'Hinged right' },
]

/** Relative sizes for the diagram: fixed sizes as given, `null` shares what is left. */
function weights(sizes: readonly (number | null)[], total: number): number[] {
  const fixed = sizes.reduce<number>((n, s) => n + (s ?? 0), 0)
  const autoCount = sizes.filter((s) => s === null).length
  const share = autoCount > 0 ? Math.max(total - fixed, total * 0.1) / autoCount : 0
  return sizes.map((s) => s ?? share)
}

function BayFace({ bay }: { bay: Bay }) {
  if (bay.kind === 'drawer') return <span className="absolute top-1/2 left-1/2 h-0.5 w-1/3 -translate-x-1/2 rounded bg-foreground/50" />
  if (bay.kind === 'door') {
    return bay.doorCount === 2 ? (
      <span className="absolute inset-y-1 left-1/2 w-px bg-foreground/40" />
    ) : (
      <span className={cn('absolute top-1/2 h-1/4 w-0.5 -translate-y-1/2 rounded bg-foreground/50', bay.hingeSide === 'left' ? 'right-1.5' : 'left-1.5')} />
    )
  }
  return (
    <>
      {Array.from({ length: Math.min(bay.shelfCount, 6) }, (_, i) => (
        <span key={i} className="absolute inset-x-1 h-px bg-foreground/35" style={{ top: `${((i + 1) * 100) / (Math.min(bay.shelfCount, 6) + 1)}%` }} />
      ))}
    </>
  )
}

/** Dashed line near the top of a door/open bay that holds a hanging rod. */
function RodMark({ bay }: { bay: Bay }) {
  if (bay.kind === 'drawer' || bay.rod === undefined) return null
  return <span data-rod="true" aria-hidden="true" className="absolute inset-x-1 top-[22%] border-t-2 border-dashed border-foreground/55" />
}

type LayoutEditorProps = { cabinet: Cabinet; units: UnitSystem }

/** Visual sections/bays editor: pick a bay on the front diagram, edit it below. */
export function LayoutEditor({ cabinet, units }: LayoutEditorProps) {
  const updateBay = useDesigner((s) => s.updateBay)
  const moveBay = useDesigner((s) => s.moveBay)
  const removeBay = useDesigner((s) => s.removeBay)
  const addBay = useDesigner((s) => s.addBay)
  const addSection = useDesigner((s) => s.addSection)
  const removeSection = useDesigner((s) => s.removeSection)
  const moveSection = useDesigner((s) => s.moveSection)
  const updateSection = useDesigner((s) => s.updateSection)
  const setBayRod = useDesigner((s) => s.setBayRod)
  const [selected, setSelected] = useState<{ sectionId: string; bayId: string } | null>(null)

  const sectionIndex = Math.max(0, cabinet.sections.findIndex((s) => s.id === selected?.sectionId))
  const section = cabinet.sections[sectionIndex]
  const bayIndex = Math.max(0, section?.bays.findIndex((b) => b.id === selected?.bayId) ?? 0)
  const bay = section?.bays[bayIndex]
  if (!section || !bay) return null

  const sectionWeights = weights(cabinet.sections.map((s) => s.width), cabinet.width)
  const sectionLabel = `Section ${sectionIndex + 1}`
  const bayLabel = `Bay ${bayIndex + 1}`
  const patch = (p: Parameters<typeof updateBay>[3]): void => updateBay(cabinet.id, section.id, bay.id, p)
  const aspect = Math.min(Math.max(cabinet.height / cabinet.width, 0.4), 2.2)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Sections are columns split by dividers; bays stack top to bottom. Choose a bay to edit it.</p>
      <div role="group" aria-label="Cabinet front layout" className="mx-auto flex w-full max-w-[240px] gap-0.5 rounded-sm border-2 border-foreground/70 bg-background p-0.5" style={{ aspectRatio: `1 / ${aspect}` }}>
        {cabinet.sections.map((s, si) => {
          const bayWeights = weights(s.bays.map((b) => b.height), cabinet.height)
          return (
            <div key={s.id} className="flex min-w-0 flex-col gap-0.5" style={{ flexGrow: sectionWeights[si], flexBasis: 0 }}>
              {s.bays.map((b, bi) => {
                const isSelected = s.id === section.id && b.id === bay.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`Section ${si + 1}, bay ${bi + 1}: ${b.kind}`}
                    onClick={() => setSelected({ sectionId: s.id, bayId: b.id })}
                    className={cn(
                      'relative min-h-3 rounded-[2px] border border-foreground/40 bg-card transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      isSelected && 'border-primary bg-primary/15 ring-1 ring-primary',
                    )}
                    style={{ flexGrow: bayWeights[bi], flexBasis: 0 }}
                  >
                    <BayFace bay={b} />
                    <RodMark bay={b} />
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <CardCaption>
          {sectionLabel} · {bayLabel}
        </CardCaption>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${bayLabel} up`} disabled={bayIndex === 0} onClick={() => moveBay(cabinet.id, section.id, bay.id, -1)}>
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${bayLabel} down`}
            disabled={bayIndex === section.bays.length - 1}
            onClick={() => moveBay(cabinet.id, section.id, bay.id, 1)}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${bayLabel}`}
            disabled={section.bays.length <= 1}
            onClick={() => {
              removeBay(cabinet.id, section.id, bay.id)
              setSelected(null)
            }}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label={`${bayLabel} kind`} value={bay.kind} options={BAY_KINDS} onChange={(kind) => patch({ kind })} />
        <OptionalLengthInput label={`${bayLabel} height`} value={bay.height} units={units} {...SECTION_SIZE} onCommit={(height) => patch({ height })} />
        {bay.kind !== 'drawer' && (
          <NumberInput label={`${bayLabel} shelves`} value={bay.shelfCount} integer min={0} max={MAX_SHELVES} onCommit={(shelfCount) => patch({ shelfCount })} />
        )}
        {bay.kind === 'door' && (
          <SelectField label={`${bayLabel} doors`} value={bay.doorCount === 2 ? '2' : '1'} options={DOOR_COUNTS} onChange={(v) => patch({ doorCount: v === '2' ? 2 : 1 })} />
        )}
        {bay.kind === 'door' && bay.doorCount === 1 && (
          <SelectField label={`${bayLabel} hinge side`} value={bay.hingeSide} options={HINGE_SIDES} onChange={(hingeSide) => patch({ hingeSide })} />
        )}
        {bay.kind !== 'drawer' && (
          <div className="col-span-2">
            <CheckboxField
              label={`${bayLabel} hanging rod`}
              isChecked={bay.rod !== undefined}
              onChange={(on) => setBayRod(cabinet.id, section.id, bay.id, on ? { dropFromTop: DEFAULT_ROD_DROP } : null)}
            />
          </div>
        )}
        {bay.kind !== 'drawer' && bay.rod !== undefined && (
          <LengthInput
            label={`${bayLabel} rod drop from top`}
            value={bay.rod.dropFromTop}
            units={units}
            {...ROD_DROP}
            onCommit={(dropFromTop) => setBayRod(cabinet.id, section.id, bay.id, { dropFromTop })}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BAY_KINDS.map((k) => (
          <Button
            key={k.value}
            variant="outline"
            size="xs"
            disabled={section.bays.length >= MAX_BAYS}
            onClick={() => addBay(cabinet.id, section.id, k.value)}
            aria-label={`Add ${k.label.toLowerCase()} bay to ${sectionLabel}`}
          >
            <PlusIcon /> {k.label}
          </Button>
        ))}
      </div>

      <div className="flex items-end justify-between gap-2 border-t pt-3">
        <div className="max-w-[55%]">
          <OptionalLengthInput
            label={`${sectionLabel} width`}
            value={section.width}
            units={units}
            {...SECTION_SIZE}
            onCommit={(width) => updateSection(cabinet.id, section.id, { width })}
          />
        </div>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${sectionLabel} left`} disabled={sectionIndex === 0} onClick={() => moveSection(cabinet.id, section.id, -1)}>
            <ArrowLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${sectionLabel} right`}
            disabled={sectionIndex === cabinet.sections.length - 1}
            onClick={() => moveSection(cabinet.id, section.id, 1)}
          >
            <ArrowRightIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${sectionLabel}`}
            disabled={cabinet.sections.length <= 1}
            onClick={() => {
              removeSection(cabinet.id, section.id)
              setSelected(null)
            }}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
      <Button variant="outline" size="sm" disabled={cabinet.sections.length >= MAX_SECTIONS} onClick={() => addSection(cabinet.id)}>
        <PlusIcon /> Add section (divider)
      </Button>
    </div>
  )
}
