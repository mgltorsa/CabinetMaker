'use client'

import { DownloadIcon } from 'lucide-react'
import type { EstimateSettings, Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { money, percent } from '../../lib/format'
import { overallYield } from '../../lib/sheets'
import { type OutputView, useDesigner } from '../../store'
import type { Exports } from '../../useExports'
import { CheckboxField, CommitField, FieldGrid, LengthInput, NumberInput } from '../fields'
import { Button } from '../ui/button'
import { PlanBookCard } from './PlanBookCard'
import { SpecCard } from './SpecCard'

const MAX_MARGIN_PERCENT = 95

const LABOR_FIELDS: { key: keyof EstimateSettings['labor']; label: string }[] = [
  { key: 'minutesPerSheet', label: 'Minutes per sheet' },
  { key: 'minutesPerPart', label: 'Minutes per part' },
  { key: 'minutesPerJoineryOp', label: 'Minutes per joinery op' },
  { key: 'minutesPerHole', label: 'Minutes per hole' },
  { key: 'minutesPerHardwareItem', label: 'Minutes per hardware item' },
  { key: 'assemblyMinutesPerCabinet', label: 'Assembly minutes per cabinet' },
]

type OutputsSectionProps = { project: Project; result: PipelineResult; exports: Exports }

/** 03 Drawings & BOM: each card opens its view in the main area and holds its settings. */
export function OutputsSection({ project, result, exports }: OutputsSectionProps) {
  const setOutputView = useDesigner((s) => s.setOutputView)
  const updateNest = useDesigner((s) => s.updateNest)
  const updateEstimate = useDesigner((s) => s.updateEstimate)
  const updateLabor = useDesigner((s) => s.updateLabor)
  const { nest, bom, estimate } = result
  const units = project.units
  const show = (view: OutputView) => () => setOutputView(view)
  const materials = new Set(bom.parts.map((p) => p.materialId)).size
  const n = project.nest
  const e = project.estimate

  return (
    <div className="flex flex-col gap-2">
      <SpecCard index="03·1" title="Cut list" summary={`${bom.parts.length} parts · ${materials} materials`} onActivate={show('cutlist')}>
        <p className="text-xs text-muted-foreground">Every part with size, material, grain and operation count. Choose a part in the list to see its panel drawing.</p>
        <Button variant="outline" size="sm" onClick={exports.downloadCutListCsv}>
          <DownloadIcon /> Cut list (CSV)
        </Button>
      </SpecCard>

      <SpecCard
        index="03·2"
        title="Cut plan"
        summary={`${nest.sheets.length} sheets · ${percent(overallYield(nest.sheets))} yield`}
        onActivate={show('cutplan')}
        advanced={
          <>
            <LengthInput label="Extra part spacing" value={n.partSpacing} units={units} onCommit={(partSpacing) => updateNest({ partSpacing })} />
            <div className="col-span-2">
              <CheckboxField label="Ignore grain (allow any rotation)" isChecked={n.ignoreGrain} onChange={(ignoreGrain) => updateNest({ ignoreGrain })} />
            </div>
          </>
        }
      >
        <FieldGrid>
          <LengthInput label="Kerf" value={n.kerf} units={units} onCommit={(kerf) => updateNest({ kerf })} />
          <LengthInput label="Edge trim" value={n.edgeTrim} units={units} onCommit={(edgeTrim) => updateNest({ edgeTrim })} />
        </FieldGrid>
        <p className="text-xs text-muted-foreground">MaxRects heuristic with grain and kerf rules: good layouts, not provably optimal.</p>
      </SpecCard>

      <SpecCard
        index="03·3"
        title="Estimate"
        summary={`${money(estimate.price, estimate.currency)} · ${Math.round(e.margin * 100)} % margin`}
        onActivate={show('estimate')}
        advanced={
          <>
            <CommitField<string>
              label="Currency (ISO code)"
              value={e.currency}
              format={(v) => v}
              parse={(t) => (/^[A-Za-z]{3}$/.test(t.trim()) ? { ok: true, value: t.trim().toUpperCase() } : { ok: false, error: 'Use a 3-letter code, e.g. USD' })}
              onCommit={(currency) => updateEstimate({ currency })}
              inputMode="text"
              isFreeText
            />
            <NumberInput
              label="Linear stock waste"
              suffix="%"
              value={Math.round(e.linearWaste * 1000) / 10}
              min={0}
              max={100}
              onCommit={(pct) => updateEstimate({ linearWaste: pct / 100 })}
            />
            {LABOR_FIELDS.map((f) => (
              <NumberInput key={f.key} label={f.label} suffix="min" value={e.labor[f.key]} min={0} onCommit={(v) => updateLabor({ [f.key]: v })} />
            ))}
          </>
        }
      >
        <FieldGrid>
          <NumberInput label="Shop rate (per hour)" value={e.shopRate} min={0} onCommit={(shopRate) => updateEstimate({ shopRate })} />
          <NumberInput label="Margin" suffix="%" value={Math.round(e.margin * 1000) / 10} min={0} max={MAX_MARGIN_PERCENT} onCommit={(pct) => updateEstimate({ margin: pct / 100 })} />
        </FieldGrid>
        <Button variant="outline" size="sm" onClick={exports.downloadBomCsv}>
          <DownloadIcon /> Bill of materials (CSV)
        </Button>
      </SpecCard>

      <PlanBookCard project={project} result={result} exports={exports} />
    </div>
  )
}
