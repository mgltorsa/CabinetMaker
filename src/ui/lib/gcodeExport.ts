/**
 * G-code export for one or more nested sheets. All-or-nothing: CAM runs for
 * every requested sheet first, and any error-level CAM warning, CAM failure or
 * G-code failure blocks the whole export with a list of problems per sheet.
 */
import { emitGcode, generateToolpaths } from '@/cam'
import type { Part, Project, Sheet } from '@/core/types'
import { errorMessage } from '../toast'
import { sheetFilename, slugify } from './download'
import { lengthLabel, materialName } from './format'
import { toolSetupProblems } from './machineTools'
import { sheetLabel } from './sheets'

export interface GcodeFile {
  name: string
  text: string
}

export interface ExportProblem {
  /** Sheet label (as in the picker) or `Machine & tools`. */
  label: string
  messages: string[]
}

export type GcodeExport = { ok: true; files: GcodeFile[] } | { ok: false; problems: ExportProblem[] }

const SETUP_LABEL = 'Machine & tools'

/** Banner material text, e.g. `18 mm plywood, 18 mm` (G-code is always metric). */
function materialDescription(project: Project, sheet: Sheet): string {
  return `${materialName(project, sheet.materialId)}, ${lengthLabel(sheet.thickness, 'metric')}`
}

type Step<T> = { ok: true; value: T } | { ok: false; messages: string[] }
type SheetRun<T> = { ok: true; values: T[] } | { ok: false; problems: ExportProblem[] }

/** Run `step` for every sheet (a throw counts as a failure); all values, or every failure. */
function forEverySheet<T>(project: Project, sheets: readonly Sheet[], step: (sheet: Sheet, i: number) => Step<T>): SheetRun<T> {
  const values: T[] = []
  const problems: ExportProblem[] = []
  sheets.forEach((sheet, i) => {
    let r: Step<T>
    try {
      r = step(sheet, i)
    } catch (error: unknown) {
      r = { ok: false, messages: [errorMessage(error)] }
    }
    if (r.ok) values.push(r.value)
    else problems.push({ label: sheetLabel(project, sheet), messages: r.messages })
  })
  return problems.length === 0 ? { ok: true, values } : { ok: false, problems }
}

export function exportGcode(project: Project, sheets: readonly Sheet[], partsById: ReadonlyMap<string, Part>): GcodeExport {
  const { machine, tools } = project
  const setup = toolSetupProblems(machine, tools)
  if (setup.length > 0) return { ok: false, problems: [{ label: SETUP_LABEL, messages: setup }] }

  const cams = forEverySheet(project, sheets, (sheet) => {
    const cam = generateToolpaths({ sheet, parts: partsById, machine, tools })
    const errors = cam.warnings.filter((w) => w.level === 'error').map((w) => w.message)
    return errors.length > 0 ? { ok: false, messages: errors } : { ok: true, value: cam }
  })
  if (!cams.ok) return cams

  const slug = slugify(project.name)
  const files = forEverySheet(project, sheets, (sheet, i) => {
    const options = { programName: `${project.name} ${sheet.id}`, sheetId: sheet.id, material: materialDescription(project, sheet) }
    const text = emitGcode(cams.values[i]!.toolpaths, machine, tools, options)
    return { ok: true, value: { name: sheetFilename(slug, sheet), text } }
  })
  return files.ok ? { ok: true, files: files.values } : files
}
