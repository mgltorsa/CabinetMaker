'use client'

import { useState } from 'react'
import type { Grain, Project } from '@/core/types'
import { formatLength } from '@/core/units'
import { panelDetail } from '@/drawings'
import type { PipelineResult } from '@/pipeline'
import { DrawingView } from '../components/DrawingView'
import { materialName, unitSuffix } from '../lib/format'

const GRAIN_LABEL: Record<Grain, string> = { length: 'Along length', width: 'Along width', none: '—' }

type PartsViewProps = {
  project: Project
  result: PipelineResult
}

export function PartsView({ project, result }: PartsViewProps) {
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null)
  const { units } = project
  const rows = result.bom.parts
  const selectedPart = selectedPartId === null ? undefined : result.partsById.get(selectedPartId)
  const cabinetName = (id: string): string => project.cabinets.find((c) => c.id === id)?.name ?? id
  const u = unitSuffix(units)

  if (rows.length === 0) return <p className="empty">No parts yet. Add a cabinet or check the warnings below.</p>

  return (
    <div className="parts-view view-pad">
      <div className="table-wrap">
        <table className="data-table">
          <caption>
            Cut list — {rows.length} part{rows.length === 1 ? '' : 's'}. Choose a part to see its panel detail.
          </caption>
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col">Cabinet</th>
              <th scope="col">Material</th>
              <th scope="col" className="num">Length ({u})</th>
              <th scope="col" className="num">Width ({u})</th>
              <th scope="col" className="num">Thick. ({u})</th>
              <th scope="col">Grain</th>
              <th scope="col" className="num">Ops</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = row.partId === selectedPartId
              return (
                <tr key={row.partId} className={isSelected ? 'is-selected' : undefined}>
                  <th scope="row">
                    <button type="button" className="link" aria-pressed={isSelected} onClick={() => setSelectedPartId(isSelected ? null : row.partId)}>
                      {row.name}
                    </button>
                  </th>
                  <td>{cabinetName(row.cabinetId)}</td>
                  <td>{materialName(project, row.materialId)}</td>
                  <td className="num">{formatLength(row.length, units)}</td>
                  <td className="num">{formatLength(row.width, units)}</td>
                  <td className="num">{formatLength(row.thickness, units)}</td>
                  <td>{GRAIN_LABEL[row.grain]}</td>
                  <td className="num">{row.opCount}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {selectedPart && (
        <section className="panel-detail" aria-labelledby="panel-detail-heading">
          <h3 id="panel-detail-heading" className="view-title">
            Panel detail — {selectedPart.name}
          </h3>
          <DrawingView make={() => panelDetail(selectedPart, units)} units={units} label={`${selectedPart.name} panel detail`} />
        </section>
      )}
    </div>
  )
}
