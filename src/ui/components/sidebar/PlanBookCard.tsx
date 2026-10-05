'use client'

import { EyeIcon, FileTextIcon, Loader2Icon } from 'lucide-react'
import { useId, useState } from 'react'
import { isIsoDate, PDF_SECTION_KEYS, resolvePdfSettings, withPdfSettings } from '@/core/pdf-settings'
import type { ImageDataUrl, PdfDateMode, PdfPageSize, PdfSectionKey, Project, WatermarkKind, WatermarkLayer, WatermarkPlacement } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { fitsAutosave } from '../../lib/imageUpload'
import { PDF_LIMITS } from '../../lib/limits'
import { useDesigner } from '../../store'
import { errorMessage, notify } from '../../toast'
import type { Exports } from '../../useExports'
import { CheckboxField, CommitField, FieldGrid, NumberInput, SelectField, type SelectOption } from '../fields'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { PdfImageField } from './PdfImageField'
import { CardCaption, SpecCard } from './SpecCard'

const SECTION_LABELS: Readonly<Record<PdfSectionKey, string>> = {
  cover: 'Cover',
  elevations: 'Elevations',
  panels: 'Panel details',
  sheets: 'Sheet layouts',
  cutList: 'Cut list',
  bom: 'Bill of materials',
  estimate: 'Estimate',
}

const PAGE_SIZE_OPTIONS: readonly SelectOption<PdfPageSize>[] = [
  { value: 'letter', label: 'Letter (11 x 8.5 in)' },
  { value: 'a4', label: 'A4 (297 x 210 mm)' },
]
const DATE_OPTIONS: readonly SelectOption<PdfDateMode>[] = [
  { value: 'today', label: 'Date of export' },
  { value: 'fixed', label: 'Fixed date' },
]
const KIND_OPTIONS: readonly SelectOption<WatermarkKind>[] = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
]
const PLACEMENT_OPTIONS: readonly SelectOption<WatermarkPlacement>[] = [
  { value: 'centre', label: 'Centre' },
  { value: 'tiled', label: 'Tiled' },
  { value: 'corner', label: 'Corner' },
]
const LAYER_OPTIONS: readonly SelectOption<WatermarkLayer>[] = [
  { value: 'behind', label: 'Behind drawings' },
  { value: 'over', label: 'Over drawings' },
]
type RotationChoice = '0' | '45' | 'custom'
const ROTATION_OPTIONS: readonly SelectOption<RotationChoice>[] = [
  { value: '0', label: '0°' },
  { value: '45', label: '45°' },
  { value: 'custom', label: 'Custom' },
]

/** Keep a preview's object URL alive long enough for the viewer to load it. */
const PREVIEW_URL_LIFETIME_MS = 60_000
const AUTOSAVE_TOO_BIG = 'With this image the project is too large to save in this browser. Use a smaller image.'

type OptionalTextProps = {
  label: string
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  max?: number
  className?: string
}

/** Free text that may be blank (title-block fields). */
function OptionalText({ label, value, onCommit, placeholder, max = PDF_LIMITS.fieldLength, className }: OptionalTextProps) {
  return (
    <CommitField<string>
      label={label}
      value={value}
      format={(v) => v}
      parse={(t) => (t.trim().length > max ? { ok: false, error: `At most ${max} characters` } : { ok: true, value: t.trim() })}
      onCommit={onCommit}
      placeholder={placeholder}
      inputMode="text"
      className={className}
      isFreeText
    />
  )
}

/** Multi-line cover notes, committed on blur. */
function NotesField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (): void => {
    if (draft === null) return
    const next = draft.trim().slice(0, PDF_LIMITS.notesLength)
    if (next !== value) onCommit(next)
    setDraft(null)
  }
  return (
    <div className="col-span-2 flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>Cover notes</Label>
      <textarea
        id={id}
        rows={3}
        maxLength={PDF_LIMITS.notesLength}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className="w-full min-w-0 resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </div>
  )
}

/** Build the plan book and show it in a new tab. */
function usePdfPreview(project: Project, result: PipelineResult): { isBusy: boolean; preview: () => Promise<void> } {
  const [isBusy, setIsBusy] = useState(false)
  const preview = async (): Promise<void> => {
    // Open the tab during the click so pop-up blockers allow it; fill it when the PDF is ready.
    const tab = window.open('', '_blank')
    if (!tab) {
      notify('error', 'Allow pop-ups for this page to preview the PDF.')
      return
    }
    tab.opener = null
    setIsBusy(true)
    try {
      const { buildPlanPdf } = await import('@/drawings/pdf')
      const bytes = await buildPlanPdf(project, result)
      const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }))
      tab.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), PREVIEW_URL_LIFETIME_MS)
    } catch (error: unknown) {
      tab.close()
      notify('error', `PDF preview failed: ${errorMessage(error)}`)
    } finally {
      setIsBusy(false)
    }
  }
  return { isBusy, preview }
}

function rotationChoice(deg: number, isCustom: boolean): RotationChoice {
  if (isCustom) return 'custom'
  return deg === 0 ? '0' : deg === 45 ? '45' : 'custom'
}

function WatermarkFields({ project }: { project: Project }) {
  const updatePdf = useDesigner((s) => s.updatePdfSettings)
  const updateWm = useDesigner((s) => s.updateWatermark)
  const [isCustomRotation, setIsCustomRotation] = useState(false)
  const pdf = resolvePdfSettings(project)
  const wm = pdf.watermark
  const rotation = rotationChoice(wm.rotationDeg, isCustomRotation)
  const fitsProject = (image: ImageDataUrl): string | null => (fitsAutosave(withPdfSettings(project, { watermarkImage: image })) ? null : AUTOSAVE_TOO_BIG)
  const chooseRotation = (choice: RotationChoice): void => {
    setIsCustomRotation(choice === 'custom')
    if (choice !== 'custom') updateWm({ rotationDeg: Number(choice) })
  }
  return (
    <>
      <CardCaption className="col-span-2 mt-1">Watermark</CardCaption>
      <div className="col-span-2">
        <CheckboxField label="Watermark" isChecked={wm.enabled} onChange={(enabled) => updateWm({ enabled })} />
      </div>
      {wm.enabled && (
        <>
          <SelectField<WatermarkKind> label="Watermark type" value={wm.kind} options={KIND_OPTIONS} onChange={(kind) => updateWm({ kind })} />
          {wm.kind === 'text' ? (
            <OptionalText label="Watermark text" value={wm.text} max={PDF_LIMITS.watermarkTextLength} placeholder="DRAFT" onCommit={(text) => updateWm({ text })} />
          ) : (
            <div />
          )}
          {wm.kind === 'image' && (
            <PdfImageField
              label="Watermark image"
              value={pdf.watermarkImage}
              emptyText="Logo"
              validate={fitsProject}
              onChange={(watermarkImage) => updatePdf({ watermarkImage })}
            />
          )}
          <NumberInput
            label="Opacity"
            suffix="%"
            value={Math.round(wm.opacity * 100)}
            min={PDF_LIMITS.opacity.min * 100}
            max={PDF_LIMITS.opacity.max * 100}
            onCommit={(pct) => updateWm({ opacity: pct / 100 })}
          />
          <NumberInput label="Size (page width)" suffix="%" value={wm.sizePercent} min={PDF_LIMITS.sizePercent.min} max={PDF_LIMITS.sizePercent.max} onCommit={(sizePercent) => updateWm({ sizePercent })} />
          <SelectField<RotationChoice> label="Rotation" value={rotation} options={ROTATION_OPTIONS} onChange={chooseRotation} />
          {rotation === 'custom' ? (
            <NumberInput label="Angle" suffix="°" value={wm.rotationDeg} min={PDF_LIMITS.rotationDeg.min} max={PDF_LIMITS.rotationDeg.max} onCommit={(rotationDeg) => updateWm({ rotationDeg })} />
          ) : (
            <div />
          )}
          <SelectField<WatermarkPlacement> label="Placement" value={wm.placement} options={PLACEMENT_OPTIONS} onChange={(placement) => updateWm({ placement })} />
          <SelectField<WatermarkLayer> label="Layer" value={wm.layer} options={LAYER_OPTIONS} onChange={(layer) => updateWm({ layer })} />
        </>
      )}
    </>
  )
}

function AdvancedFields({ project }: { project: Project }) {
  const update = useDesigner((s) => s.updatePdfSettings)
  const pdf = resolvePdfSettings(project)
  return (
    <>
      <OptionalText label="Designer" value={pdf.designer} onCommit={(designer) => update({ designer })} />
      <OptionalText label="Revision" value={pdf.revision} placeholder="Rev A" onCommit={(revision) => update({ revision })} />
      <OptionalText label="Address or contact" value={pdf.contact} onCommit={(contact) => update({ contact })} className="col-span-2" />
      <SelectField<PdfDateMode> label="Date" value={pdf.dateMode} options={DATE_OPTIONS} onChange={(dateMode) => update({ dateMode })} />
      {pdf.dateMode === 'fixed' ? (
        <CommitField<string>
          label="Fixed date"
          value={pdf.fixedDate}
          format={(v) => v}
          parse={(t) => (isIsoDate(t.trim()) ? { ok: true, value: t.trim() } : { ok: false, error: 'Use YYYY-MM-DD' })}
          onCommit={(fixedDate) => update({ fixedDate })}
          placeholder="YYYY-MM-DD"
          inputMode="text"
          error={isIsoDate(pdf.fixedDate) ? undefined : 'Enter the date to print'}
        />
      ) : (
        <div />
      )}
      <div className="col-span-2">
        <SelectField<PdfPageSize> label="Page size" value={pdf.pageSize} options={PAGE_SIZE_OPTIONS} onChange={(pageSize) => update({ pageSize })} />
      </div>
      <NotesField value={pdf.notes} onCommit={(notes) => update({ notes })} />
      <CardCaption className="col-span-2 mt-1">Sections</CardCaption>
      {PDF_SECTION_KEYS.map((key) => (
        <CheckboxField key={key} label={SECTION_LABELS[key]} isChecked={pdf.sections[key]} onChange={(on) => update({ sections: { ...pdf.sections, [key]: on } })} />
      ))}
      <WatermarkFields project={project} />
    </>
  )
}

function summaryOf(project: Project): string {
  const pdf = resolvePdfSettings(project)
  const sections = PDF_SECTION_KEYS.filter((k) => pdf.sections[k]).length
  const parts = ['PDF', pdf.pageSize === 'a4' ? 'A4' : 'Letter', `${sections} of ${PDF_SECTION_KEYS.length} sections`]
  if (pdf.watermark.enabled) parts.push('watermark')
  return parts.join(' · ')
}

type PlanBookCardProps = { project: Project; result: PipelineResult; exports: Exports }

/** 03·4 Plan book: what the PDF says, how it is branded, and the download. */
export function PlanBookCard({ project, result, exports }: PlanBookCardProps) {
  const update = useDesigner((s) => s.updatePdfSettings)
  const { isBusy: isPreviewBusy, preview } = usePdfPreview(project, result)
  const pdf = resolvePdfSettings(project)
  const fitsProject = (logo: ImageDataUrl): string | null => (fitsAutosave(withPdfSettings(project, { logo })) ? null : AUTOSAVE_TOO_BIG)

  return (
    <SpecCard index="03·4" title="Plan book" summary={summaryOf(project)} advanced={<AdvancedFields project={project} />}>
      <p className="text-xs text-muted-foreground">One PDF from the same drawings you see on screen: cover, elevations, panel details, sheet layouts, cut list, BOM and estimate.</p>
      <FieldGrid>
        <OptionalText label="Title" value={pdf.title} placeholder={project.name} onCommit={(title) => update({ title })} />
        <OptionalText label="Client" value={pdf.client} onCommit={(client) => update({ client })} />
        <OptionalText label="Company" value={pdf.company} onCommit={(company) => update({ company })} className="col-span-2" />
        <PdfImageField label="Logo" value={pdf.logo} validate={fitsProject} onChange={(logo) => update({ logo })} />
      </FieldGrid>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void exports.downloadPdf()} disabled={exports.isPdfBusy} aria-busy={exports.isPdfBusy}>
          {exports.isPdfBusy ? <Loader2Icon className="animate-spin" /> : <FileTextIcon />}
          {exports.isPdfBusy ? 'Building PDF…' : 'Download PDF'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void preview()} disabled={isPreviewBusy} aria-busy={isPreviewBusy}>
          {isPreviewBusy ? <Loader2Icon className="animate-spin" /> : <EyeIcon />}
          Preview
        </Button>
      </div>
    </SpecCard>
  )
}
