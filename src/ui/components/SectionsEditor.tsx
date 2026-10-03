'use client'

import type { Bay, BayKind, Cabinet, Section, UnitSystem } from '@/core/types'
import { MAX_BAYS, MAX_SECTIONS, MAX_SHELVES, SECTION_SIZE } from '../lib/limits'
import { useDesigner } from '../store'
import { NumberInput, OptionalLengthInput, SelectField, type SelectOption } from './fields'

const BAY_KINDS: SelectOption<BayKind>[] = [
  { value: 'drawer', label: 'Drawer' },
  { value: 'door', label: 'Door' },
  { value: 'open', label: 'Open' },
]

const DOOR_COUNTS: SelectOption<'1' | '2'>[] = [
  { value: '1', label: 'Single door' },
  { value: '2', label: 'Pair of doors' },
]

const HINGE_SIDES: SelectOption<Bay['hingeSide']>[] = [
  { value: 'left', label: 'Hinged left' },
  { value: 'right', label: 'Hinged right' },
]

type BayEditorProps = {
  cabinetId: string
  section: Section
  bay: Bay
  index: number
  units: UnitSystem
}

function BayEditor({ cabinetId, section, bay, index, units }: BayEditorProps) {
  const updateBay = useDesigner((s) => s.updateBay)
  const moveBay = useDesigner((s) => s.moveBay)
  const removeBay = useDesigner((s) => s.removeBay)
  const patch = (p: Parameters<typeof updateBay>[3]): void => updateBay(cabinetId, section.id, bay.id, p)
  const label = `Bay ${index + 1}`
  const isLast = index === section.bays.length - 1

  return (
    <li className="bay">
      <div className="bay-head">
        <span className="bay-title">{label}</span>
        <div className="row-actions">
          <button type="button" className="ghost small" disabled={index === 0} onClick={() => moveBay(cabinetId, section.id, bay.id, -1)} aria-label={`Move ${label} up`}>
            ↑
          </button>
          <button type="button" className="ghost small" disabled={isLast} onClick={() => moveBay(cabinetId, section.id, bay.id, 1)} aria-label={`Move ${label} down`}>
            ↓
          </button>
          <button
            type="button"
            className="ghost small danger"
            disabled={section.bays.length <= 1}
            onClick={() => removeBay(cabinetId, section.id, bay.id)}
            aria-label={`Remove ${label}`}
          >
            Remove
          </button>
        </div>
      </div>
      <div className="field-grid">
        <SelectField label={`${label} kind`} value={bay.kind} options={BAY_KINDS} onChange={(kind) => patch({ kind })} />
        <OptionalLengthInput label={`${label} height`} value={bay.height} units={units} {...SECTION_SIZE} onCommit={(height) => patch({ height })} />
        {bay.kind !== 'drawer' && (
          <NumberInput label={`${label} shelves`} value={bay.shelfCount} integer min={0} max={MAX_SHELVES} onCommit={(shelfCount) => patch({ shelfCount })} />
        )}
        {bay.kind === 'door' && (
          <SelectField
            label={`${label} doors`}
            value={bay.doorCount === 2 ? '2' : '1'}
            options={DOOR_COUNTS}
            onChange={(v) => patch({ doorCount: v === '2' ? 2 : 1 })}
          />
        )}
        {bay.kind === 'door' && bay.doorCount === 1 && (
          <SelectField label={`${label} hinge side`} value={bay.hingeSide} options={HINGE_SIDES} onChange={(hingeSide) => patch({ hingeSide })} />
        )}
      </div>
    </li>
  )
}

type SectionEditorProps = {
  cabinet: Cabinet
  section: Section
  index: number
  units: UnitSystem
}

function SectionEditor({ cabinet, section, index, units }: SectionEditorProps) {
  const updateSection = useDesigner((s) => s.updateSection)
  const moveSection = useDesigner((s) => s.moveSection)
  const removeSection = useDesigner((s) => s.removeSection)
  const addBay = useDesigner((s) => s.addBay)
  const label = `Section ${index + 1}`
  const isLast = index === cabinet.sections.length - 1
  const isFull = section.bays.length >= MAX_BAYS

  return (
    <li className="section-card">
      <div className="bay-head">
        <h3 className="section-title">{label}</h3>
        <div className="row-actions">
          <button type="button" className="ghost small" disabled={index === 0} onClick={() => moveSection(cabinet.id, section.id, -1)} aria-label={`Move ${label} left`}>
            ←
          </button>
          <button type="button" className="ghost small" disabled={isLast} onClick={() => moveSection(cabinet.id, section.id, 1)} aria-label={`Move ${label} right`}>
            →
          </button>
          <button
            type="button"
            className="ghost small danger"
            disabled={cabinet.sections.length <= 1}
            onClick={() => removeSection(cabinet.id, section.id)}
            aria-label={`Remove ${label}`}
          >
            Remove
          </button>
        </div>
      </div>
      <div className="field-grid">
        <OptionalLengthInput
          label={`${label} width`}
          value={section.width}
          units={units}
          {...SECTION_SIZE}
          onCommit={(width) => updateSection(cabinet.id, section.id, { width })}
        />
      </div>
      <ol className="bays" aria-label={`${label} bays, top to bottom`}>
        {section.bays.map((bay, i) => (
          <BayEditor key={bay.id} cabinetId={cabinet.id} section={section} bay={bay} index={i} units={units} />
        ))}
      </ol>
      <div className="inline wrap">
        <span className="hint">Add bay:</span>
        {BAY_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            className="small"
            disabled={isFull}
            onClick={() => addBay(cabinet.id, section.id, k.value)}
            aria-label={`Add ${k.label.toLowerCase()} bay to ${label}`}
          >
            + {k.label}
          </button>
        ))}
      </div>
    </li>
  )
}

type SectionsEditorProps = {
  cabinet: Cabinet
  units: UnitSystem
}

export function SectionsEditor({ cabinet, units }: SectionsEditorProps) {
  const addSection = useDesigner((s) => s.addSection)
  return (
    <details className="field-group" open>
      <summary>Sections &amp; bays</summary>
      <p className="hint">Sections are columns split by dividers; bays stack top to bottom. Leave a size empty to share the remaining space.</p>
      <ol className="sections">
        {cabinet.sections.map((section, i) => (
          <SectionEditor key={section.id} cabinet={cabinet} section={section} index={i} units={units} />
        ))}
      </ol>
      <button type="button" className="small" disabled={cabinet.sections.length >= MAX_SECTIONS} onClick={() => addSection(cabinet.id)}>
        + Add section
      </button>
    </details>
  )
}
