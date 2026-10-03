'use client'

import type { BuildWarning, Project, WarningLevel } from '@/core/types'

const LEVEL_LABEL: Record<WarningLevel, string> = { error: 'Error', warn: 'Warning', info: 'Note' }
const LEVEL_ORDER: Record<WarningLevel, number> = { error: 0, warn: 1, info: 2 }

type WarningsPanelProps = {
  project: Project
  warnings: readonly BuildWarning[]
  /** Set when the pipeline itself threw. */
  pipelineError: string | null
}

export function WarningsPanel({ project, warnings, pipelineError }: WarningsPanelProps) {
  const sorted = [...warnings].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  const cabinetName = (id: string | undefined): string | undefined => (id === undefined ? undefined : project.cabinets.find((c) => c.id === id)?.name)
  const count = sorted.length + (pipelineError ? 1 : 0)

  return (
    <section className="warnings" aria-labelledby="warnings-heading">
      <h2 id="warnings-heading">
        Warnings <span className="badge">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="hint">No build warnings.</p>
      ) : (
        <ul>
          {pipelineError && (
            <li className="level-error">
              <span className="level">Error</span> The design could not be built: {pipelineError}
            </li>
          )}
          {sorted.map((w, i) => {
            const cab = cabinetName(w.cabinetId)
            return (
              <li key={`${w.code}:${w.partId ?? w.cabinetId ?? ''}:${i}`} className={`level-${w.level}`}>
                <span className="level">{LEVEL_LABEL[w.level]}</span>
                {cab && <span className="where">{cab}:</span>} {w.message}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
