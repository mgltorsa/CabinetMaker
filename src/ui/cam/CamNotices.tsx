import type { BuildWarning, WarningLevel } from '@/core/types'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
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
    <Alert variant="destructive" aria-labelledby="export-blocked-heading">
      <AlertTitle>
        <h2 id="export-blocked-heading">G-code not written</h2>
      </AlertTitle>
      <AlertDescription>
        <p>Fix these errors first; no files were downloaded.</p>
        <ul className="list-disc pl-4">
          {problems.map((p) => (
            <li key={p.label}>
              <strong>{p.label}</strong>
              <ul className="list-[circle] pl-4">
                {p.messages.map((m, i) => (
                  <li key={`${i}:${m}`}>{m}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/** CAM warnings of the previewed sheet, errors first. */
export function CamWarnings({ warnings }: { warnings: readonly BuildWarning[] }) {
  if (warnings.length === 0) return null
  const sorted = [...warnings].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  const hasErrors = sorted.some((w) => w.level === 'error')
  return (
    <Alert variant={hasErrors ? 'destructive' : 'warning'} role="region" aria-labelledby="cam-warnings-heading">
      <AlertTitle>
        <h2 id="cam-warnings-heading">CAM warnings</h2>
      </AlertTitle>
      <AlertDescription>
        {hasErrors && <p>Errors block G-code download for this sheet.</p>}
        <ul className="list-disc pl-4">
          {sorted.map((w, i) => (
            <li key={`${w.code}:${i}`}>
              <strong>{LEVEL_LABEL[w.level]}:</strong> {w.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
