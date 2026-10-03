import type { Project, Sheet } from '@/core/types'
import { materialName } from './format'

/** Area-weighted yield across all sheets (0 when there are none). */
export function overallYield(sheets: readonly Sheet[]): number {
  const area = sheets.reduce((sum, s) => sum + s.length * s.width, 0)
  if (area === 0) return 0
  return sheets.reduce((sum, s) => sum + s.yield * s.length * s.width, 0) / area
}

/** `Sheet 1 (ply-18#1) — 18 mm plywood`: numbered per material, like the drawings, PDF and `.nc` file. */
export function sheetLabel(project: Project, sheet: Sheet): string {
  return `Sheet ${sheet.index} (${sheet.id}) — ${materialName(project, sheet.materialId)}`
}
