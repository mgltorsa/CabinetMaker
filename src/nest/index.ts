/**
 * Nesting: parts → sheets per material, respecting grain, kerf and edge trim.
 *
 * - Parts are grouped by `materialId`. Linear-stock parts are not nested
 *   (`linearPartIds`); parts with an unknown material, invalid size or no
 *   possible fit on an empty sheet go to `unplaced` with a reason.
 * - Spacing rule and grain rule: see `./geometry`.
 * - Algorithm: MaxRects with several sort orders × fit heuristics × sheet
 *   choices; keeps the layout with the fewest sheets (see `./pack`). It is a
 *   heuristic, not an optimal nest. Output is deterministic for a given input.
 */
import type { Id, Material, NestMaterialSummary, NestResult, NestSettings, Part, Placement, Sheet, SheetMaterial } from '@/core/types'
import {
  allowedOrientations,
  describeSettingsError,
  EPS,
  formatMm,
  hasValidSize,
  placedArea,
  isGrainLocked,
  partGap,
  usableArea,
} from './geometry'
import { fitsEmptySheet, packBest, type NestItem } from './pack'

export { estimateCutCount } from './cuts'
export { validateNest } from './validate'

type Unplaced = NestResult['unplaced'][number]

type Classification =
  | { readonly kind: 'linear' }
  | { readonly kind: 'unplaced'; readonly reason: string }
  | { readonly kind: 'item'; readonly item: NestItem }

function classifySheetPart(part: Part, material: SheetMaterial, settings: NestSettings): Classification {
  const settingsError = describeSettingsError(settings)
  if (settingsError !== null) return { kind: 'unplaced', reason: settingsError }
  if (!hasValidSize(part)) {
    return { kind: 'unplaced', reason: `invalid part size ${part.length} × ${part.width} (must be finite and > 0)` }
  }
  const area = usableArea(material, settings)
  const usable = `${formatMm(area.width)} × ${formatMm(area.height)} mm`
  if (area.width <= EPS || area.height <= EPS) {
    return { kind: 'unplaced', reason: `edge trim ${formatMm(settings.edgeTrim)} mm leaves no usable area on "${material.name}"` }
  }
  const grainLocked = isGrainLocked(material, settings)
  const item: NestItem = { id: part.id, length: part.length, width: part.width, orientations: allowedOrientations(part, grainLocked) }
  if (fitsEmptySheet(item, area, partGap(settings))) return { kind: 'item', item }
  const grainNote = grainLocked && part.grain !== 'none' ? ` (rotation locked by ${part.grain} grain)` : ''
  return {
    kind: 'unplaced',
    reason: `part ${formatMm(part.length)} × ${formatMm(part.width)} mm does not fit the usable area ${usable} of "${material.name}"${grainNote}`,
  }
}

function classifyPart(part: Part, material: Material | undefined, settings: NestSettings): Classification {
  if (material === undefined) return { kind: 'unplaced', reason: `unknown material "${part.materialId}"` }
  if (material.kind === 'linear') return { kind: 'linear' }
  return classifySheetPart(part, material, settings)
}

function toSheet(material: SheetMaterial, placements: readonly Placement[], index: number): Sheet {
  return {
    id: `${material.id}#${index}`,
    materialId: material.id,
    index,
    length: material.sheetLength,
    width: material.sheetWidth,
    thickness: material.thickness,
    placements: [...placements],
    yield: placedArea(placements) / (material.sheetLength * material.sheetWidth),
  }
}

function summarize(material: SheetMaterial, sheets: readonly Sheet[]): NestMaterialSummary {
  const partCount = sheets.reduce((n, s) => n + s.placements.length, 0)
  const partArea = sheets.reduce((sum, s) => sum + placedArea(s.placements), 0)
  const sheetArea = sheets.length * material.sheetLength * material.sheetWidth
  return { materialId: material.id, sheetCount: sheets.length, partCount, yield: sheetArea === 0 ? 0 : partArea / sheetArea }
}

interface MaterialGroup {
  readonly material: SheetMaterial
  readonly items: NestItem[]
}

/** Sheet-material groups in `materials` order (first definition wins on duplicate ids). */
function emptyGroups(materials: readonly Material[]): Map<Id, MaterialGroup> {
  const groups = new Map<Id, MaterialGroup>()
  for (const material of materials) {
    if (material.kind === 'sheet' && !groups.has(material.id)) groups.set(material.id, { material, items: [] })
  }
  return groups
}

export function nestParts(parts: Part[], materials: Material[], settings: NestSettings): NestResult {
  const materialById = new Map<Id, Material>()
  for (const m of materials) if (!materialById.has(m.id)) materialById.set(m.id, m)
  const groups = emptyGroups(materials)
  const used = new Set<Id>()
  const linearPartIds: Id[] = []
  const unplaced: Unplaced[] = []
  const seen = new Set<Id>()

  for (const part of parts) {
    if (seen.has(part.id)) {
      unplaced.push({ partId: part.id, reason: `duplicate part id "${part.id}" (only the first is nested)` })
      continue
    }
    seen.add(part.id)
    const classification = classifyPart(part, materialById.get(part.materialId), settings)
    if (groups.has(part.materialId)) used.add(part.materialId)
    if (classification.kind === 'linear') linearPartIds.push(part.id)
    else if (classification.kind === 'unplaced') unplaced.push({ partId: part.id, reason: classification.reason })
    else groups.get(part.materialId)?.items.push(classification.item)
  }

  const sheets: Sheet[] = []
  const summary: NestMaterialSummary[] = []
  for (const { material, items } of groups.values()) {
    if (!used.has(material.id)) continue
    const layout = packBest(items, usableArea(material, settings), partGap(settings))
    const materialSheets = layout.map((placements, i) => toSheet(material, placements, i + 1))
    sheets.push(...materialSheets)
    summary.push(summarize(material, materialSheets))
  }
  return { sheets, linearPartIds, unplaced, summary }
}
