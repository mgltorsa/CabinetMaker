import type { Project, Sheet } from '@/core/types'
import { materialName } from './format'

/** Area-weighted yield across all sheets (0 when there are none). */
export function overallYield(sheets: readonly Sheet[]): number {
  const area = sheets.reduce((sum, s) => sum + s.length * s.width, 0)
  if (area === 0) return 0
  return sheets.reduce((sum, s) => sum + s.yield * s.length * s.width, 0) / area
}

/** `position` is 1-based across all sheets (matches the `.nc` file number). */
export function sheetLabel(project: Project, sheet: Sheet, position: number): string {
  return `Sheet ${position} — ${materialName(project, sheet.materialId)} #${sheet.index}`
}
