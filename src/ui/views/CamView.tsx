'use client'

import { useId, useMemo, useState } from 'react'
import type { CamResult, Machine, Part, Project, Sheet, Tool } from '@/core/types'
import { emitGcode, generateToolpaths } from '@/cam'
import type { PipelineResult } from '@/pipeline'
import { MachineSettings } from '../cam/MachineSettings'
import { ToolpathPreview } from '../cam/ToolpathPreview'
import { downloadBlob, sheetFilename, slugify } from '../lib/download'
import { sheetLabel } from '../lib/sheets'
import { errorMessage, notify } from '../toast'

const MULTI_DOWNLOAD_GAP_MS = 300

type CamOutcome = { ok: true; cam: CamResult } | { ok: false; error: string }

function camFor(sheet: Sheet, parts: ReadonlyMap<string, Part>, machine: Machine, tools: Tool[]): CamResult {
  return generateToolpaths({ sheet, parts, machine, tools })
}

/** G-code text for one sheet; `position` is the 1-based sheet number. */
function gcodeFor(project: Project, sheet: Sheet, result: PipelineResult, position: number): string {
  const cam = camFor(sheet, result.partsById, project.machine, project.tools)
  return emitGcode(cam.toolpaths, project.machine, project.tools, { programName: `${project.name} sheet ${position}` })
}

type CamViewProps = {
  project: Project
  result: PipelineResult
}

export function CamView({ project, result }: CamViewProps) {
  const sheets = result.nest.sheets
  const [chosen, setChosen] = useState(0)
  const pickerId = useId()
  const index = Math.min(chosen, Math.max(sheets.length - 1, 0))
  const sheet = sheets[index]
  const slug = slugify(project.name)
  const { partsById } = result
  const { machine, tools } = project
  const partName = (id: string): string => partsById.get(id)?.name ?? id

  // Toolpath generation is the expensive step; recompute only for the chosen sheet.
  const outcome = useMemo((): CamOutcome | null => {
    if (!sheet) return null
    try {
      return { ok: true, cam: camFor(sheet, partsById, machine, tools) }
    } catch (error: unknown) {
      return { ok: false, error: errorMessage(error) }
    }
  }, [sheet, partsById, machine, tools])

  const downloadSheets = (targets: readonly { sheet: Sheet; position: number }[]): void => {
    let files: { name: string; text: string }[]
    try {
      // Generate everything first so a failure never leaves a partial set.
      files = targets.map((t) => ({ name: sheetFilename(slug, t.position), text: gcodeFor(project, t.sheet, result, t.position) }))
    } catch (error: unknown) {
      notify('error', `G-code export failed: ${errorMessage(error)}`)
      return
    }
    // Browsers drop some of several downloads started in the same tick; space them out.
    files.forEach((f, i) => setTimeout(() => downloadBlob(f.text, f.name, 'text/plain'), i * MULTI_DOWNLOAD_GAP_MS))
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
                    {sheetLabel(project, s, i + 1)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => downloadSheets([{ sheet, position: index + 1 }])}>
              Download sheet {index + 1} (.nc)
            </button>
            <button type="button" className="secondary" onClick={() => downloadSheets(sheets.map((s, i) => ({ sheet: s, position: i + 1 })))}>
              Download all sheets ({sheets.length} files)
            </button>
          </div>

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
                title={`Toolpaths for ${sheetLabel(project, sheet, index + 1)}`}
              />
              {outcome.cam.warnings.length > 0 && (
                <section className="callout warn" aria-labelledby="cam-warnings-heading">
                  <h3 id="cam-warnings-heading">CAM warnings</h3>
                  <ul>
                    {outcome.cam.warnings.map((w, i) => (
                      <li key={`${w.code}:${i}`}>{w.message}</li>
                    ))}
                  </ul>
                </section>
              )}
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
