'use client'

import { useId, useMemo, useState } from 'react'
import { generateToolpaths } from '@/cam'
import type { CamResult, Project, Sheet } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { CamWarnings, ExportProblems } from '../cam/CamNotices'
import { MachineSettings } from '../cam/MachineSettings'
import { ToolpathPreview } from '../cam/ToolpathPreview'
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
    <div className="cam-view view-pad">
      <aside className="callout danger" aria-label="CNC safety warning">
        <strong>Preview only.</strong> Generated G-code has not been proven on your machine. Simulate every file and check tool, feeds, zero and hold-down
        before cycle start.
      </aside>

      {!sheet ? (
        <p className="empty">No nested sheets yet, so there is nothing to machine. See the Cut plan tab.</p>
      ) : (
        <>
          <div className="cam-toolbar">
            <div className="field">
              <label htmlFor={pickerId}>Sheet</label>
              <select id={pickerId} value={index} onChange={(e) => setChosen(Number(e.target.value))}>
                {sheets.map((s, i) => (
                  <option key={s.id} value={i}>
                    {sheetLabel(project, s)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => handleDownload([sheet])}>
              Download {sheet.id} (.nc)
            </button>
            <button type="button" className="secondary" onClick={() => handleDownload(sheets)}>
              Download all sheets ({sheets.length} files)
            </button>
          </div>

          {problems && <ExportProblems problems={problems} onDismiss={() => setBlocked(null)} />}

          {outcome && !outcome.ok && (
            <div className="view-error" role="alert">
              <strong>Toolpath generation failed</strong>
              <p>{outcome.error}</p>
            </div>
          )}

          {outcome?.ok && (
            <>
              {outcome.cam.toolpaths.length === 0 && <p className="empty">No toolpaths for this sheet yet.</p>}
              <ToolpathPreview
                sheet={sheet}
                toolpaths={outcome.cam.toolpaths}
                partsById={result.partsById}
                tools={project.tools}
                title={`Toolpaths for ${sheetLabel(project, sheet)}`}
              />
              <CamWarnings warnings={outcome.cam.warnings} />
              <section aria-labelledby="manual-ops-heading">
                <h3 id="manual-ops-heading" className="view-title">
                  Manual operations ({outcome.cam.manualOps.length})
                </h3>
                {outcome.cam.manualOps.length === 0 ? (
                  <p className="hint">Everything on this sheet can be machined from face A.</p>
                ) : (
                  <ul className="plain-list">
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

      <MachineSettings machine={project.machine} tools={project.tools} units={project.units} />
    </div>
  )
}
