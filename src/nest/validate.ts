/**
 * Independent checker for a `NestResult`. Used by tests and invariant checks;
 * shares only the geometry rules (`./geometry`) with the packer.
 */
import type { Id, Material, NestResult, NestSettings, Part, Placement, Sheet, SheetMaterial } from '@/core/types'
import { EPS, footprint, formatMm, isGrainLocked, isRotationAllowed, partGap, placedArea, usableArea } from './geometry'

const YIELD_TOLERANCE = 1e-9

function sheetMaterialOf(materials: ReadonlyMap<Id, Material>, id: Id): SheetMaterial | null {
  const material = materials.get(id)
  return material?.kind === 'sheet' ? material : null
}

function checkSheetRecord(sheet: Sheet, material: SheetMaterial): string[] {
  const errors: string[] = []
  const label = `sheet "${sheet.id}"`
  const expectedId = `${material.id}#${sheet.index}`
  if (sheet.id !== expectedId || !Number.isInteger(sheet.index) || sheet.index < 1) {
    errors.push(`${label}: id should be "${expectedId}" with index ≥ 1`)
  }
  if (sheet.length !== material.sheetLength || sheet.width !== material.sheetWidth) {
    errors.push(`${label}: size ${sheet.length} × ${sheet.width} does not match material ${material.sheetLength} × ${material.sheetWidth}`)
  }
  if (sheet.thickness !== material.thickness) {
    errors.push(`${label}: thickness ${sheet.thickness} does not match material ${material.thickness}`)
  }
  const expectedYield = placedArea(sheet.placements) / (material.sheetLength * material.sheetWidth)
  if (Math.abs(sheet.yield - expectedYield) > YIELD_TOLERANCE) {
    errors.push(`${label}: yield ${sheet.yield} does not match placed area (${expectedYield})`)
  }
  return errors
}

function checkPlacement(
  sheet: Sheet,
  placement: Placement,
  part: Part | undefined,
  material: SheetMaterial,
  settings: NestSettings,
): string[] {
  const label = `sheet "${sheet.id}"`
  if (part === undefined) return [`${label}: unknown part "${placement.partId}"`]
  const errors: string[] = []
  const name = `part "${part.id}"`
  if (part.materialId !== material.id) {
    errors.push(`${label}: ${name} has material "${part.materialId}" but is on a "${material.id}" sheet`)
  }
  const expected = footprint(part, placement.rotated)
  if (Math.abs(expected.sizeX - placement.sizeX) > EPS || Math.abs(expected.sizeY - placement.sizeY) > EPS) {
    errors.push(
      `${label}: ${name} placed size ${formatMm(placement.sizeX)} × ${formatMm(placement.sizeY)} ` +
        `does not match part (${formatMm(expected.sizeX)} × ${formatMm(expected.sizeY)}, rotated=${placement.rotated})`,
    )
  }
  if (!isRotationAllowed(part.grain, placement.rotated, isGrainLocked(material, settings))) {
    errors.push(`${label}: ${name} rotated=${placement.rotated} breaks ${part.grain} grain`)
  }
  const area = usableArea(material, settings)
  const outside =
    placement.x < area.x0 - EPS ||
    placement.y < area.y0 - EPS ||
    placement.x + placement.sizeX > area.x0 + area.width + EPS ||
    placement.y + placement.sizeY > area.y0 + area.height + EPS
  if (outside) errors.push(`${label}: ${name} is outside the usable area`)
  return errors
}

/** Sweep over x: only pairs whose x-ranges (plus gap) overlap are compared. */
function checkSpacing(sheet: Sheet, gap: number): string[] {
  const errors: string[] = []
  const byX = [...sheet.placements].sort((a, b) => a.x - b.x)
  for (const [i, a] of byX.entries()) {
    const reach = a.x + a.sizeX + gap - EPS
    for (let j = i + 1; j < byX.length; j++) {
      const b = byX[j]
      if (b === undefined || b.x >= reach) break
      const separatedY = a.y + a.sizeY + gap <= b.y + EPS || b.y + b.sizeY + gap <= a.y + EPS
      if (!separatedY) {
        errors.push(`sheet "${sheet.id}": parts "${a.partId}" and "${b.partId}" are too close (need ≥ ${formatMm(gap)} mm clear)`)
      }
    }
  }
  return errors
}

function checkSheets(
  result: NestResult,
  partById: ReadonlyMap<Id, Part>,
  materials: ReadonlyMap<Id, Material>,
  settings: NestSettings,
): string[] {
  const gap = partGap(settings)
  return result.sheets.flatMap((sheet) => {
    const material = sheetMaterialOf(materials, sheet.materialId)
    if (material === null) return [`sheet "${sheet.id}": unknown sheet material "${sheet.materialId}"`]
    return [
      ...checkSheetRecord(sheet, material),
      ...sheet.placements.flatMap((p) => checkPlacement(sheet, p, partById.get(p.partId), material, settings)),
      ...checkSpacing(sheet, gap),
    ]
  })
}

function checkSummary(result: NestResult): string[] {
  return result.summary.flatMap((summary) => {
    const sheets = result.sheets.filter((s) => s.materialId === summary.materialId)
    const partCount = sheets.reduce((n, s) => n + s.placements.length, 0)
    if (summary.sheetCount === sheets.length && summary.partCount === partCount) return []
    return [`summary "${summary.materialId}": counts ${summary.sheetCount} sheets / ${summary.partCount} parts, nest has ${sheets.length} / ${partCount}`]
  })
}

function checkCoverage(result: NestResult, parts: readonly Part[], materials: ReadonlyMap<Id, Material>): string[] {
  const placedCount = new Map<Id, number>()
  for (const p of result.sheets.flatMap((s) => s.placements)) placedCount.set(p.partId, (placedCount.get(p.partId) ?? 0) + 1)
  const unplaced = new Set(result.unplaced.map((u) => u.partId))
  const linear = new Set(result.linearPartIds)
  const errors: string[] = []
  const seen = new Set<Id>()
  for (const part of parts) {
    if (seen.has(part.id)) continue
    seen.add(part.id)
    const name = `part "${part.id}"`
    const placed = placedCount.get(part.id) ?? 0
    if (materials.get(part.materialId)?.kind === 'linear') {
      if (!linear.has(part.id) || placed > 0) errors.push(`${name} is linear stock: list it in linearPartIds and do not place it`)
      continue
    }
    if (linear.has(part.id)) errors.push(`${name} is in linearPartIds but is not linear stock`)
    if (placed > 1) errors.push(`${name} is placed ${placed} times`)
    if (placed === 1 && unplaced.has(part.id)) errors.push(`${name} is both placed and unplaced`)
    if (placed === 0 && !unplaced.has(part.id)) errors.push(`${name} is not placed and not listed as unplaced`)
  }
  return errors
}

/**
 * Checks a nest result against its inputs. Returns human-readable problems;
 * an empty array means the nest is valid. Checks: sheet records (id, size,
 * thickness, yield), placements inside the usable area with matching size and
 * grain, kerf + spacing between parts, summary counts, and that every
 * sheet-material part is placed exactly once or listed as unplaced.
 */
export function validateNest(result: NestResult, parts: Part[], materials: Material[], settings: NestSettings): string[] {
  const materialById = new Map(materials.map((m) => [m.id, m]))
  const partById = new Map<Id, Part>()
  for (const part of parts) if (!partById.has(part.id)) partById.set(part.id, part)
  return [
    ...checkSheets(result, partById, materialById, settings),
    ...checkSummary(result),
    ...checkCoverage(result, parts, materialById),
  ]
}
