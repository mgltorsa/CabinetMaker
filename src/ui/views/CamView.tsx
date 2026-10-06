'use client'

import { DownloadIcon, ShieldAlertIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { generateToolpaths } from '@/cam'
import type { CamResult, Project, Sheet } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { CamWarnings, ExportProblems } from '../cam/CamNotices'
import { ToolpathPreview } from '../cam/ToolpathPreview'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { NativeSelect } from '../components/ui/native-select'
import { downloadBlob } from '../lib/download'
import { exportGcode, type ExportProblem } from '../lib/gcodeExport'
import { sheetLabel } from '../lib/sheets'
import { errorMessage, notify } from '../toast'

const MULTI_DOWNLOAD_GAP_MS = 300

type CamOutcome = { ok: true; cam: CamResult } | { ok: false; error: string }

/** A refused export, tied to the project it was computed for so edits clear it. */
type BlockedExport = { project: Project; problems: ExportProblem[] }

type CamViewProps = {
  project: Project
  result: PipelineResult
}

export function CamView({ project, result }: CamViewProps) {
  const sheets = result.nest.sheets
  const [chosen, setChosen] = useState(0)
  const [blocked, setBlocked] = useState<BlockedExport | null>(null)
  const pickerId = useId()
  const index = Math.min(chosen, Math.max(sheets.length - 1, 0))
  const sheet = sheets[index]
  const { partsById } = result
  const { machine, tools } = project
  const partName = (id: string): string => partsById.get(id)?.name ?? id
  const problems = blocked?.project === project ? blocked.problems : null

  // Toolpath generation is the expensive step; recompute only for the chosen sheet.
  const outcome = useMemo((): CamOutcome | null => {
    if (!sheet) return null
    try {
      return { ok: true, cam: generateToolpaths({ sheet, parts: partsById, machine, tools }) }
    } catch (error: unknown) {
      return { ok: false, error: errorMessage(error) }
    }
  }, [sheet, partsById, machine, tools])

  const handleDownload = (targets: readonly Sheet[]): void => {
    // CAM runs for every target first; any error blocks the whole set.
    const out = exportGcode(project, targets, partsById)
    if (!out.ok) {
      setBlocked({ project, problems: out.problems })
      notify('error', 'G-code not written: fix the errors listed in the CAM view')
      return
    }
    setBlocked(null)
    // Browsers drop some of several downloads started in the same tick; space them out.
    out.files.forEach((f, i) => setTimeout(() => downloadBlob(f.text, f.name, 'text/plain'), i * MULTI_DOWNLOAD_GAP_MS))
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <Alert variant="destructive" role="complementary" aria-label="CNC safety warning">
        <ShieldAlertIcon />
        <AlertTitle>Preview only</AlertTitle>
        <AlertDescription>Generated G-code has not been proven on your machine. Simulate every file and check tool, feeds, zero and hold-down before cycle start.</AlertDescription>
      </Alert>

      {!sheet ? (
        <p className="text-sm text-muted-foreground">No nested sheets yet, so there is nothing to machine. See 03 Drawings & BOM → Cut plan.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-72 flex-col gap-1.5">
              <Label htmlFor={pickerId}>Sheet</Label>
              <NativeSelect id={pickerId} value={index} onChange={(e) => setChosen(Number(e.target.value))}>
                {sheets.map((s, i) => (
                  <option key={s.id} value={i}>
                    {sheetLabel(project, s)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button size="sm" onClick={() => handleDownload([sheet])}>
              <DownloadIcon /> Download {sheet.id} (.nc)
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleDownload(sheets)}>
              Download all sheets ({sheets.length} files)
            </Button>
          </div>

          {problems && <ExportProblems problems={problems} onDismiss={() => setBlocked(null)} />}

          {outcome && !outcome.ok && (
            <Alert variant="destructive">
              <AlertTitle>Toolpath generation failed</AlertTitle>
              <AlertDescription>{outcome.error}</AlertDescription>
            </Alert>
          )}

          {outcome?.ok && (
            <>
              {outcome.cam.toolpaths.length === 0 && <p className="text-sm text-muted-foreground">No toolpaths for this sheet yet.</p>}
              <ToolpathPreview
                sheet={sheet}
                toolpaths={outcome.cam.toolpaths}
                partsById={result.partsById}
                tools={project.tools}
                title={`Toolpaths for ${sheetLabel(project, sheet)}`}
              />
              <CamWarnings warnings={outcome.cam.warnings} />
              <section aria-labelledby="manual-ops-heading" className="flex flex-col gap-1.5">
                <h2 id="manual-ops-heading" className="font-mono text-sm font-semibold">
                  Manual operations ({outcome.cam.manualOps.length})
                </h2>
                {outcome.cam.manualOps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Everything on this sheet can be machined from face A.</p>
                ) : (
                  <ul className="list-disc pl-5 text-sm">
                    {outcome.cam.manualOps.map((op) => (
                      <li key={`${op.partId}:${op.opId}`}>
                        <strong>{partName(op.partId)}</strong> — {op.opId}: {op.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
