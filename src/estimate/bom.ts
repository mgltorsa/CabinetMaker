/**
 * Bill of materials: part schedule plus purchasable lines.
 *
 * Lines are ordered sheets → linear stock → hardware; within each category in
 * order of first appearance (nest sheets, `nest.linearPartIds`,
 * `build.hardware`). Line totals are rounded to cents. Anything that is not in
 * the project catalog still gets a line (so it is not silently dropped), with
 * `unitCost` 0 and its description flagged `(not in catalog)`. Negative or
 * non-finite catalog prices and quantities count as 0.
 */
import type { Bom, BomLine, HardwareItem, LinearMaterial, NestResult, Part, Project, ProjectBuild, SheetMaterial } from '@/core/types'
import { formatLength, round } from '@/core/units'
import { roundMoney } from './money'
import { buildPartSchedule } from './schedule'
import { nonNegative } from './settings'

export const NOT_IN_CATALOG = '(not in catalog)'

const MM_PER_M = 1000
/** Decimals kept on linear quantities in metres (1 mm). */
const METRE_DECIMALS = 3
/** Tolerance so float noise (4880.0000001 mm) does not buy an extra board. */
const BOARD_EPSILON = 1e-9

/** `2440 mm` / `96 1/16"`. */
function lengthText(mm: number, project: Project): string {
  const text = formatLength(mm, project.units)
  return project.units === 'metric' ? `${text} mm` : text
}

/** `2440 × 1220 mm` / `96 1/16" × 48 1/16"`. */
function sizeText(a: number, b: number, project: Project): string {
  const first = formatLength(a, project.units)
  return `${first} × ${lengthText(b, project)}`
}

function flagged(id: string): string {
  return `${id} ${NOT_IN_CATALOG}`
}

/** Group values by key, keeping first-appearance order of keys. */
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group) group.push(item)
    else groups.set(k, [item])
  }
  return groups
}

function findSheetMaterial(project: Project, id: string): SheetMaterial | undefined {
  const m = project.materials.find((x) => x.id === id)
  return m?.kind === 'sheet' ? m : undefined
}

function findLinearMaterial(project: Project, id: string): LinearMaterial | undefined {
  const m = project.materials.find((x) => x.id === id)
  return m?.kind === 'linear' ? m : undefined
}

function sheetLine(project: Project, materialId: string, count: number): BomLine {
  const material = findSheetMaterial(project, materialId)
  const unitCost = nonNegative(material?.costPerSheet ?? 0)
  const description = material
    ? `${material.name} (${sizeText(material.sheetLength, material.sheetWidth, project)})`
    : flagged(materialId)
  return { category: 'sheet', refId: materialId, description, qty: count, unit: 'sheet', unitCost, total: roundMoney(count * unitCost) }
}

export function sheetLines(project: Project, nest: NestResult): BomLine[] {
  const byMaterial = groupBy(nest.sheets, (s) => s.materialId)
  return [...byMaterial].map(([materialId, sheets]) => sheetLine(project, materialId, sheets.length))
}

function linearDescription(material: LinearMaterial, netMm: number, grossMm: number, waste: number, project: Project): string {
  const head = `${material.name}: ${round(netMm / MM_PER_M, METRE_DECIMALS)} m net + ${round(waste * 100, 1)}% waste`
  if (!(material.stockLength > 0)) return head
  const boards = Math.max(1, Math.ceil(grossMm / material.stockLength - BOARD_EPSILON))
  return `${head}, ${boards} × ${lengthText(material.stockLength, project)} board${boards === 1 ? '' : 's'}`
}

function linearLine(project: Project, materialId: string, parts: readonly Part[]): BomLine {
  const waste = nonNegative(project.estimate.linearWaste)
  const netMm = parts.reduce((acc, p) => acc + nonNegative(p.length), 0)
  const grossMm = netMm * (1 + waste)
  const qty = round(grossMm / MM_PER_M, METRE_DECIMALS)
  const material = findLinearMaterial(project, materialId)
  const unitCost = nonNegative(material?.costPerMetre ?? 0)
  const description = material ? linearDescription(material, netMm, grossMm, waste, project) : flagged(materialId)
  return { category: 'linear', refId: materialId, description, qty, unit: 'm', unitCost, total: roundMoney(qty * unitCost) }
}

export function linearLines(project: Project, build: ProjectBuild, nest: NestResult): BomLine[] {
  const partsById = new Map(build.parts.map((p) => [p.id, p]))
  const parts = nest.linearPartIds.flatMap((id) => partsById.get(id) ?? [])
  return [...groupBy(parts, (p) => p.materialId)].map(([materialId, group]) => linearLine(project, materialId, group))
}

function hardwareLine(item: HardwareItem | undefined, hardwareId: string, qty: number): BomLine {
  if (!item) {
    return { category: 'hardware', refId: hardwareId, description: flagged(hardwareId), qty, unit: 'pcs', unitCost: 0, total: 0 }
  }
  return {
    category: 'hardware',
    refId: hardwareId,
    description: item.name,
    manufacturer: item.manufacturer,
    sku: item.sku,
    qty,
    unit: 'pcs',
    unitCost: nonNegative(item.unitCost),
    total: roundMoney(qty * nonNegative(item.unitCost)),
  }
}

/** Aggregate usage by hardware id; non-positive / non-finite quantities count as 0 and empty lines are dropped. */
export function hardwareLines(project: Project, build: ProjectBuild): BomLine[] {
  const catalog = new Map(project.hardware.map((h) => [h.id, h]))
  const byId = groupBy(build.hardware, (h) => h.hardwareId)
  return [...byId]
    .map(([id, uses]) => hardwareLine(catalog.get(id), id, uses.reduce((acc, u) => acc + nonNegative(u.qty), 0)))
    .filter((line) => line.qty > 0)
}

export function buildBom(project: Project, build: ProjectBuild, nest: NestResult): Bom {
  return {
    parts: buildPartSchedule(project, build.parts),
    lines: [...sheetLines(project, nest), ...linearLines(project, build, nest), ...hardwareLines(project, build)],
  }
}
