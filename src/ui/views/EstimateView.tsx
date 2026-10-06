'use client'

import type { BomLine, Estimate, Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { minutesLabel, money } from '../lib/format'

type LineTableProps = {
  caption: string
  lines: readonly BomLine[]
  currency: string
  showSku?: boolean
}

function LineTable({ caption, lines, currency, showSku = false }: LineTableProps) {
  return (
    <Card className="gap-0 bg-background">
      <CardHeader className="pb-3">
        <CardTitle>{caption}</CardTitle>
      </CardHeader>
      {lines.length === 0 ? (
        <CardContent className="text-sm text-muted-foreground">Nothing yet.</CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="pl-4">Item</TableHead>
              {showSku && <TableHead scope="col">Part number</TableHead>}
              <TableHead scope="col" className="text-right">Qty</TableHead>
              <TableHead scope="col" className="text-right">Unit cost</TableHead>
              <TableHead scope="col" className="pr-4 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={`${l.category}:${l.refId}`}>
                <TableCell className="pl-4 whitespace-normal">{l.description}</TableCell>
                {showSku && <TableCell className="font-mono text-xs">{[l.manufacturer, l.sku].filter(Boolean).join(' ') || '—'}</TableCell>}
                <TableCell className="text-right font-mono tabular-nums">
                  {Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(2)} {l.unit}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{money(l.unitCost, currency)}</TableCell>
                <TableCell className="pr-4 text-right font-mono tabular-nums">{money(l.total, currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

const percentLabel = (fraction: number): string => `${Math.round(fraction * 10_000) / 100} %`

/**
 * Totals column rows down to the pre-tax price and tax; the grand total is
 * shown below them. Extras, markup and minimum charge rows appear only when
 * non-zero.
 */
export function totalRows(e: Estimate, margin: number): [string, number][] {
  const optional = (label: string, value: number): [string, number][] => (value > 0 ? [[label, value]] : [])
  return [
    ['Materials', e.materialCost],
    ['Hardware', e.hardwareCost],
    ['Labor', e.laborCost],
    ...optional('Extra charges', e.extrasCost),
    ...optional('Markup', e.markupAmount),
    ['Subtotal', e.subtotal],
    [`Margin (${(margin * 100).toFixed(0)} %)`, e.marginAmount],
    ...optional('Minimum charge adjustment', e.minimumChargeAdjustment),
    ['Price (excl. tax)', e.price],
    [`Tax (${percentLabel(e.taxRate)})`, e.tax],
  ]
}

type EstimateViewProps = {
  project: Project
  result: PipelineResult
}

export function EstimateView({ project, result }: EstimateViewProps) {
  const e = result.estimate
  const c = e.currency
  const totals = totalRows(e, project.estimate.margin)

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <LineTable caption="Materials" lines={e.materials} currency={c} />
        <LineTable caption="Hardware" lines={e.hardware} currency={c} showSku />
        {e.extras.length > 0 && <LineTable caption="Extra charges" lines={e.extras} currency={c} />}
        <Card className="gap-0 bg-background">
          <CardHeader className="pb-3">
            <CardTitle>Labor</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="pl-4">Bucket</TableHead>
                <TableHead scope="col" className="text-right">Time</TableHead>
                <TableHead scope="col" className="pr-4 text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {e.labor.map((l) => (
                <TableRow key={l.bucket}>
                  <TableCell className="pl-4 capitalize">{l.bucket}</TableCell>
                  <TableCell className="text-right font-mono">{minutesLabel(l.minutes)}</TableCell>
                  <TableCell className="pr-4 text-right font-mono">{money(l.cost, c)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
      <Card className="h-fit bg-background lg:sticky lg:top-4" aria-labelledby="totals-heading">
        <CardHeader>
          <CardTitle id="totals-heading">Totals</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <dl className="flex flex-col gap-2 text-sm">
            {totals.map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono tabular-nums">{money(value, c)}</dd>
              </div>
            ))}
            <Separator className="my-1" />
            <div className="flex items-baseline justify-between">
              <dt className="font-mono text-sm font-semibold">Total</dt>
              <dd className="font-mono text-2xl font-semibold text-primary tabular-nums">{money(e.total, c)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">Catalog prices are placeholders. Verify supplier costs and part numbers.</p>
        </CardContent>
      </Card>
    </div>
  )
}
