'use client'

import { useId, useState } from 'react'
import type { CabinetType } from '@/core/types'
import { PRESETS } from '@/engine/presets'
import { lengthLabel } from '../lib/format'
import { useDesigner } from '../store'

export function CabinetList() {
  const cabinets = useDesigner((s) => s.project.cabinets)
  const units = useDesigner((s) => s.project.units)
  const selectedId = useDesigner((s) => s.selectedCabinetId)
  const selectCabinet = useDesigner((s) => s.selectCabinet)
  const addCabinetFromPreset = useDesigner((s) => s.addCabinetFromPreset)
  const duplicateCabinet = useDesigner((s) => s.duplicateCabinet)
  const deleteCabinet = useDesigner((s) => s.deleteCabinet)
  const [presetType, setPresetType] = useState<CabinetType>(PRESETS[0]?.type ?? 'base')
  const presetId = useId()
  const presetDescription = PRESETS.find((p) => p.type === presetType)?.description

  const handleDelete = (id: string, name: string): void => {
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) deleteCabinet(id)
  }

  return (
    <section className="panel cabinet-list" aria-labelledby="cabinets-heading">
      <h2 id="cabinets-heading">Cabinets</h2>
      {cabinets.length === 0 ? (
        <p className="empty">No cabinets yet. Add one from a preset below.</p>
      ) : (
        <ul>
          {cabinets.map((cab) => {
            const isSelected = cab.id === selectedId
            return (
              <li key={cab.id} className={isSelected ? 'is-selected' : undefined}>
                <button type="button" className="cabinet-select" aria-pressed={isSelected} onClick={() => selectCabinet(cab.id)}>
                  <span className="cabinet-name">{cab.name}</span>
                  <span className="cabinet-meta">
                    {lengthLabel(cab.width, units)} × {lengthLabel(cab.height, units)} × {lengthLabel(cab.depth, units)}
                  </span>
                </button>
                <div className="row-actions">
                  <button type="button" className="ghost small" onClick={() => duplicateCabinet(cab.id)} aria-label={`Duplicate ${cab.name}`}>
                    Duplicate
                  </button>
                  <button type="button" className="ghost small danger" onClick={() => handleDelete(cab.id, cab.name)} aria-label={`Delete ${cab.name}`}>
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="add-cabinet">
        <label htmlFor={presetId}>Add from preset</label>
        <div className="inline">
          <select
            id={presetId}
            value={presetType}
            onChange={(e) => {
              const match = PRESETS.find((p) => p.type === e.target.value)
              if (match) setPresetType(match.type)
            }}
          >
            {PRESETS.map((p) => (
              <option key={`${p.type}:${p.label}`} value={p.type}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => addCabinetFromPreset(presetType)}>
            Add
          </button>
        </div>
        {presetDescription && <p className="hint">{presetDescription}</p>}
      </div>
    </section>
  )
}
