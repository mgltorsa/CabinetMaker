import type { BuildWarning, WarningLevel } from '@/core/types'
import type { ExportProblem } from '../lib/gcodeExport'

const LEVEL_LABEL: Record<WarningLevel, string> = { error: 'Error', warn: 'Warning', info: 'Note' }
const LEVEL_ORDER: Record<WarningLevel, number> = { error: 0, warn: 1, info: 2 }

type ExportProblemsProps = {
  problems: readonly ExportProblem[]
  onDismiss: () => void
}

/** Why the last G-code download was refused, grouped by sheet. */
export function ExportProblems({ problems, onDismiss }: ExportProblemsProps) {
  return (
    <section className="callout danger export-problems" role="alert" aria-labelledby="export-blocked-heading">
      <h3 id="export-blocked-heading">G-code not written</h3>
      <p>Fix these errors first; no files were downloaded.</p>
      <ul>
        {problems.map((p) => (
          <li key={p.label}>
            <strong>{p.label}</strong>
            <ul>
              {p.messages.map((m, i) => (
                <li key={`${i}:${m}`}>{m}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <button type="button" className="ghost small" onClick={onDismiss}>
        Dismiss
      </button>
    </section>
  )
}

/** CAM warnings of the previewed sheet, errors first. */
export function CamWarnings({ warnings }: { warnings: readonly BuildWarning[] }) {
  if (warnings.length === 0) return null
  const sorted = [...warnings].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  const hasErrors = sorted.some((w) => w.level === 'error')
  return (
    <section className={`callout ${hasErrors ? 'danger' : 'warn'}`} aria-labelledby="cam-warnings-heading">
      <h3 id="cam-warnings-heading">CAM warnings</h3>
      {hasErrors && <p>Errors block G-code download for this sheet.</p>}
      <ul>
        {sorted.map((w, i) => (
          <li key={`${w.code}:${i}`}>
            <strong>{LEVEL_LABEL[w.level]}:</strong> {w.message}
          </li>
        ))}
      </ul>
    </section>
  )
}
