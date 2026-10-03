'use client'

import type { BomLine, EstimateSettings, Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { CommitField, FieldGroup, NumberInput } from '../components/fields'
import { minutesLabel, money } from '../lib/format'
import { useDesigner } from '../store'

const MAX_MARGIN_PERCENT = 95

type LineTableProps = {
  caption: string
  lines: readonly BomLine[]
  currency: string
  showSku?: boolean
}

function LineTable({ caption, lines, currency, showSku = false }: LineTableProps) {
  if (lines.length === 0) return <p className="empty">{caption}: nothing yet.</p>
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            {showSku && <th scope="col">Part number</th>}
            <th scope="col" className="num">Qty</th>
            <th scope="col" className="num">Unit cost</th>
            <th scope="col" className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.category}:${l.refId}`}>
              <th scope="row">{l.description}</th>
              {showSku && <td>{[l.manufacturer, l.sku].filter(Boolean).join(' ') || '—'}</td>}
              <td className="num">
                {Number.isInteger(l.qty) ? l.qty : l.qty.toFixed(2)} {l.unit}
              </td>
              <td className="num">{money(l.unitCost, currency)}</td>
              <td className="num">{money(l.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const LABOR_FIELDS: { key: keyof EstimateSettings['labor']; label: string }[] = [
  { key: 'minutesPerSheet', label: 'Minutes per sheet' },
  { key: 'minutesPerPart', label: 'Minutes per part' },
  { key: 'minutesPerJoineryOp', label: 'Minutes per joinery op' },
  { key: 'minutesPerHole', label: 'Minutes per hole' },
  { key: 'minutesPerHardwareItem', label: 'Minutes per hardware item' },
  { key: 'assemblyMinutesPerCabinet', label: 'Assembly minutes per cabinet' },
]

function EstimateSettingsForm({ settings }: { settings: EstimateSettings }) {
  const updateEstimate = useDesigner((s) => s.updateEstimate)
  const updateLabor = useDesigner((s) => s.updateLabor)
  return (
    <FieldGroup title="Estimate settings" isOpen>
      <CommitField<string>
        label="Currency (ISO code)"
        value={settings.currency}
        format={(v) => v}
        parse={(t) => (/^[A-Za-z]{3}$/.test(t.trim()) ? { ok: true, value: t.trim().toUpperCase() } : { ok: false, error: 'Use a 3-letter code, e.g. USD' })}
        onCommit={(currency) => updateEstimate({ currency })}
        inputMode="text"
        isFreeText
      />
      <NumberInput label="Shop rate (per hour)" value={settings.shopRate} min={0} onCommit={(shopRate) => updateEstimate({ shopRate })} />
      <NumberInput
        label="Margin"
        suffix="%"
        value={Math.round(settings.margin * 1000) / 10}
        min={0}
        max={MAX_MARGIN_PERCENT}
        onCommit={(pct) => updateEstimate({ margin: pct / 100 })}
      />
      <NumberInput
        label="Linear stock waste"
        suffix="%"
        value={Math.round(settings.linearWaste * 1000) / 10}
        min={0}
        max={100}
        onCommit={(pct) => updateEstimate({ linearWaste: pct / 100 })}
      />
      {LABOR_FIELDS.map((f) => (
        <NumberInput key={f.key} label={f.label} suffix="min" value={settings.labor[f.key]} min={0} onCommit={(v) => updateLabor({ [f.key]: v })} />
      ))}
    </FieldGroup>
  )
}

type EstimateViewProps = {
  project: Project
  result: PipelineResult
}

export function EstimateView({ project, result }: EstimateViewProps) {
  const e = result.estimate
  const c = e.currency
  const totals: [string, number][] = [
    ['Materials', e.materialCost],
    ['Hardware', e.hardwareCost],
    ['Labor', e.laborCost],
    ['Subtotal', e.subtotal],
    [`Margin (${(project.estimate.margin * 100).toFixed(0)} %)`, e.marginAmount],
  ]

  return (
    <div className="estimate-view view-pad">
      <div className="estimate-grid">
        <div className="estimate-tables">
          <LineTable caption="Materials" lines={e.materials} currency={c} />
          <LineTable caption="Hardware" lines={e.hardware} currency={c} showSku />
          {e.labor.length === 0 ? (
            <p className="empty">Labor: nothing yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <caption>Labor</caption>
                <thead>
                  <tr>
                    <th scope="col">Bucket</th>
                    <th scope="col" className="num">Time</th>
                    <th scope="col" className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {e.labor.map((l) => (
                    <tr key={l.bucket}>
                      <th scope="row" className="capitalize">
                        {l.bucket}
                      </th>
                      <td className="num">{minutesLabel(l.minutes)}</td>
                      <td className="num">{money(l.cost, c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <aside className="totals" aria-labelledby="totals-heading">
          <h3 id="totals-heading">Totals</h3>
          <dl>
            {totals.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{money(value, c)}</dd>
              </div>
            ))}
            <div className="price">
              <dt>Price</dt>
              <dd>{money(e.price, c)}</dd>
            </div>
          </dl>
          <p className="hint">Catalog prices are placeholders. Verify supplier costs and part numbers.</p>
        </aside>
      </div>
      <EstimateSettingsForm settings={project.estimate} />
    </div>
  )
}
