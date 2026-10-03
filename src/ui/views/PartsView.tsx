'use client'

import { useState } from 'react'
import type { Grain, Project } from '@/core/types'
import { formatLength } from '@/core/units'
import { panelDetail } from '@/drawings'
import type { PipelineResult } from '@/pipeline'
import { DrawingView } from '../components/DrawingView'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { cn } from '../lib/cn'
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

  if (rows.length === 0) return <p className="p-6 text-sm text-muted-foreground">No parts yet. Add a cabinet or check the warnings.</p>

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="rounded-md border bg-background">
        <Table>
          <TableCaption className="mt-0 caption-top border-b py-2.5 pl-3 text-left font-mono text-xs text-foreground">
            Cut list — {rows.length} part{rows.length === 1 ? '' : 's'}. Choose a part to see its panel detail.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Part</TableHead>
              <TableHead scope="col">Cabinet</TableHead>
              <TableHead scope="col">Material</TableHead>
              <TableHead scope="col" className="text-right">Length ({u})</TableHead>
              <TableHead scope="col" className="text-right">Width ({u})</TableHead>
              <TableHead scope="col" className="text-right">Thick. ({u})</TableHead>
              <TableHead scope="col">Grain</TableHead>
              <TableHead scope="col" className="text-right">Ops</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isSelected = row.partId === selectedPartId
              return (
                <TableRow key={row.partId} data-state={isSelected ? 'selected' : undefined}>
                  <TableCell>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedPartId(isSelected ? null : row.partId)}
                      className={cn('rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50', isSelected && 'underline')}
                    >
                      {row.name}
                    </button>
                  </TableCell>
                  <TableCell>{cabinetName(row.cabinetId)}</TableCell>
                  <TableCell>{materialName(project, row.materialId)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatLength(row.length, units)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatLength(row.width, units)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatLength(row.thickness, units)}</TableCell>
                  <TableCell>{GRAIN_LABEL[row.grain]}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.opCount}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {selectedPart && (
        <section aria-labelledby="panel-detail-heading" className="flex flex-col gap-3">
          <h2 id="panel-detail-heading" className="font-mono text-sm font-semibold">
            Panel detail — {selectedPart.name}
          </h2>
          <DrawingView
            make={() => panelDetail(selectedPart, units, { materialName: materialName(project, selectedPart.materialId) })}
            units={units}
            label={`${selectedPart.name} panel detail`}
          />
        </section>
      )}
    </div>
  )
}
