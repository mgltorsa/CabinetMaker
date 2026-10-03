'use client'

import type { Project } from '@/core/types'
import { sheetLayout } from '@/drawings'
import type { PipelineResult } from '@/pipeline'
import { DrawingView } from '../components/DrawingView'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { lengthLabel, materialName, percent } from '../lib/format'
import { overallYield, sheetLabel } from '../lib/sheets'

type CutPlanViewProps = {
  project: Project
  result: PipelineResult
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-background px-4 py-3">
      <dt className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className="font-mono text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

export function CutPlanView({ project, result }: CutPlanViewProps) {
  const { nest, partsById } = result
  const { units } = project
  const partName = (id: string): string => partsById.get(id)?.name ?? id
  const placedCount = nest.sheets.reduce((n, s) => n + s.placements.length, 0)

  return (
    <div className="flex flex-col gap-6 p-6">
      <section aria-labelledby="nest-summary-heading" className="flex flex-col gap-3">
        <h2 id="nest-summary-heading" className="font-mono text-sm font-semibold">
          Summary
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Sheets" value={nest.sheets.length} />
          <Stat label="Parts placed" value={placedCount} />
          <Stat label="Yield" value={percent(overallYield(nest.sheets))} />
          <Stat label="Unplaced" value={nest.unplaced.length} />
        </dl>
        {nest.summary.length > 0 && (
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Material</TableHead>
                  <TableHead scope="col" className="text-right">Sheets</TableHead>
                  <TableHead scope="col" className="text-right">Parts</TableHead>
                  <TableHead scope="col" className="text-right">Yield</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nest.summary.map((m) => (
                  <TableRow key={m.materialId}>
                    <TableCell>{materialName(project, m.materialId)}</TableCell>
                    <TableCell className="text-right font-mono">{m.sheetCount}</TableCell>
                    <TableCell className="text-right font-mono">{m.partCount}</TableCell>
                    <TableCell className="text-right font-mono">{percent(m.yield)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {nest.unplaced.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Unplaced parts ({nest.unplaced.length})</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {nest.unplaced.map((u) => (
                <li key={u.partId}>
                  <strong>{partName(u.partId)}</strong>: {u.reason}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {nest.linearPartIds.length > 0 && (
        <section aria-labelledby="linear-heading" className="flex flex-col gap-2">
          <h2 id="linear-heading" className="font-mono text-sm font-semibold">
            Linear stock (not nested)
          </h2>
          <p className="text-sm text-muted-foreground">{nest.linearPartIds.map(partName).join(', ')}</p>
        </section>
      )}

      {nest.sheets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sheets nested yet.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {nest.sheets.map((sheet) => (
            <Card key={sheet.id} className="bg-background">
              <CardHeader>
                <CardTitle>{sheetLabel(project, sheet)}</CardTitle>
                <CardDescription>
                  {lengthLabel(sheet.length, units)} × {lengthLabel(sheet.width, units)} · {sheet.placements.length} parts · yield {percent(sheet.yield)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DrawingView
                  className="border-0 p-0 shadow-none"
                  make={() => {
                    const material = project.materials.find((m) => m.id === sheet.materialId)
                    return sheetLayout(sheet, partsById, units, {
                      edgeTrim: (result.nestSettings ?? project.nest).edgeTrim,
                      materialName: materialName(project, sheet.materialId),
                      grained: material?.kind === 'sheet' ? material.grained : undefined,
                    })
                  }}
                  units={units}
                  label={`Layout of ${sheetLabel(project, sheet)}`}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
