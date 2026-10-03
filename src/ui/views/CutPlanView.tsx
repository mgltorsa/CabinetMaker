'use client'

import type { NestSettings, Project, UnitSystem } from '@/core/types'
import { sheetLayout } from '@/drawings'
import type { PipelineResult } from '@/pipeline'
import { DrawingView } from '../components/DrawingView'
import { CheckboxField, FieldGroup, LengthInput } from '../components/fields'
import { lengthLabel, materialName, percent } from '../lib/format'
import { overallYield, sheetLabel } from '../lib/sheets'
import { useDesigner } from '../store'

function NestSettingsForm({ settings, units }: { settings: NestSettings; units: UnitSystem }) {
  const update = useDesigner((s) => s.updateNest)
  return (
    <FieldGroup title="Nest settings">
      <LengthInput label="Kerf" value={settings.kerf} units={units} onCommit={(kerf) => update({ kerf })} />
      <LengthInput label="Edge trim" value={settings.edgeTrim} units={units} onCommit={(edgeTrim) => update({ edgeTrim })} />
      <LengthInput label="Extra part spacing" value={settings.partSpacing} units={units} onCommit={(partSpacing) => update({ partSpacing })} />
      <CheckboxField label="Ignore grain (allow any rotation)" isChecked={settings.ignoreGrain} onChange={(ignoreGrain) => update({ ignoreGrain })} />
    </FieldGroup>
  )
}

type CutPlanViewProps = {
  project: Project
  result: PipelineResult
}

export function CutPlanView({ project, result }: CutPlanViewProps) {
  const { nest, partsById } = result
  const { units } = project
  const partName = (id: string): string => partsById.get(id)?.name ?? id
  const placedCount = nest.sheets.reduce((n, s) => n + s.placements.length, 0)

  return (
    <div className="cut-plan view-pad">
      <section aria-labelledby="nest-summary-heading">
        <h3 id="nest-summary-heading" className="view-title">
          Summary
        </h3>
        <dl className="stats">
          <div>
            <dt>Sheets</dt>
            <dd>{nest.sheets.length}</dd>
          </div>
          <div>
            <dt>Parts placed</dt>
            <dd>{placedCount}</dd>
          </div>
          <div>
            <dt>Yield</dt>
            <dd>{percent(overallYield(nest.sheets))}</dd>
          </div>
          <div>
            <dt>Unplaced</dt>
            <dd>{nest.unplaced.length}</dd>
          </div>
        </dl>
        {nest.summary.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <caption>By material</caption>
              <thead>
                <tr>
                  <th scope="col">Material</th>
                  <th scope="col" className="num">Sheets</th>
                  <th scope="col" className="num">Parts</th>
                  <th scope="col" className="num">Yield</th>
                </tr>
              </thead>
              <tbody>
                {nest.summary.map((m) => (
                  <tr key={m.materialId}>
                    <th scope="row">{materialName(project, m.materialId)}</th>
                    <td className="num">{m.sheetCount}</td>
                    <td className="num">{m.partCount}</td>
                    <td className="num">{percent(m.yield)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Layouts use a MaxRects heuristic with kerf and grain rules. They are good, not provably optimal.</p>
        <NestSettingsForm settings={project.nest} units={units} />
      </section>

      {nest.unplaced.length > 0 && (
        <section className="callout warn" aria-labelledby="unplaced-heading">
          <h3 id="unplaced-heading">Unplaced parts ({nest.unplaced.length})</h3>
          <ul>
            {nest.unplaced.map((u) => (
              <li key={u.partId}>
                <strong>{partName(u.partId)}</strong>: {u.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {nest.linearPartIds.length > 0 && (
        <section aria-labelledby="linear-heading">
          <h3 id="linear-heading" className="view-title">
            Linear stock (not nested)
          </h3>
          <ul className="plain-list">
            {nest.linearPartIds.map((id) => (
              <li key={id}>{partName(id)}</li>
            ))}
          </ul>
        </section>
      )}

      {nest.sheets.length === 0 ? (
        <p className="empty">No sheets nested yet.</p>
      ) : (
        nest.sheets.map((sheet, i) => (
          <section key={sheet.id} className="sheet-card" aria-labelledby={`sheet-${i}-heading`}>
            <h3 id={`sheet-${i}-heading`} className="view-title">
              {sheetLabel(project, sheet)}
            </h3>
            <p className="hint">
              {lengthLabel(sheet.length, units)} × {lengthLabel(sheet.width, units)} · {sheet.placements.length} parts · yield {percent(sheet.yield)}
            </p>
            <DrawingView
              make={() => {
                const material = project.materials.find((m) => m.id === sheet.materialId)
                return sheetLayout(sheet, partsById, units, {
                  edgeTrim: project.nest.edgeTrim,
                  materialName: materialName(project, sheet.materialId),
                  grained: material?.kind === 'sheet' ? material.grained : undefined,
                })
              }}
              units={units} label={`Layout of ${sheetLabel(project, sheet)}`} />
          </section>
        ))
      )}
    </div>
  )
}
