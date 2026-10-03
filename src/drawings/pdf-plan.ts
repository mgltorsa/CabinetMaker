/**
 * Pure page plan for the PDF plan book. `buildPlanPdf` renders exactly these
 * pages, and `planPageCount` is this list's length, so the two cannot drift.
 *
 * Order: cover · per cabinet elevations (front + side) · panel details (grid)
 * · one page per nested sheet · cut list · BOM · estimate summary.
 */
import type { Drawing, Material, Project } from '@/core/types'
import { formatLength } from '@/core/units'
import type { PipelineResult } from '@/pipeline'
import { frontElevation } from './front-elevation'
import { panelDetail } from './panel-detail'
import { PAGE_SIZES, PANEL_GRID, tableRowsPerPage, type PageSize, type PageSizeName } from './pdf-layout'
import { sheetLayout } from './sheet-layout'
import { sideElevation } from './side-elevation'

export interface PlanOptions {
  /** Landscape page size; Letter by default. */
  pageSize?: PageSizeName
  /** Date printed in the title block and PDF metadata; now by default. */
  date?: Date
}

export type PlanSection = 'Cover' | 'Elevations' | 'Panel details' | 'Sheet layouts' | 'Cut list' | 'Bill of materials' | 'Estimate'

export interface TableColumn {
  header: string
  /** Relative width. */
  weight: number
  align: 'left' | 'right'
}

interface PageBase {
  section: PlanSection
  title: string
}

export interface CoverPage extends PageBase {
  kind: 'cover'
}

export interface DrawingsPage extends PageBase {
  kind: 'drawings'
  drawings: Drawing[]
  cols: number
  rows: number
  /** One scale for every drawing on the page (elevations) or each fitted alone. */
  commonScale: boolean
  /** Print each drawing's title above it (drawings without their own title text). */
  captions: boolean
}

export interface TablePage extends PageBase {
  kind: 'table'
  columns: TableColumn[]
  rows: string[][]
}

export interface EstimatePage extends PageBase {
  kind: 'estimate'
}

export type PlanPage = CoverPage | DrawingsPage | TablePage | EstimatePage

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function materialName(materials: readonly Material[], id: string): string {
  return materials.find((m) => m.id === id)?.name ?? id
}

function elevationPages(project: Project, result: PipelineResult): PlanPage[] {
  return project.cabinets.map((cabinet) => {
    const build = result.build.cabinets.find((b) => b.cabinetId === cabinet.id) ?? {
      cabinetId: cabinet.id,
      parts: result.build.parts.filter((p) => p.cabinetId === cabinet.id),
      hardware: [],
      warnings: [],
    }
    const drawings = [frontElevation(cabinet, build, project.units), sideElevation(cabinet, build, project.units)]
    return { kind: 'drawings', section: 'Elevations', title: `${cabinet.name} - elevations`, drawings, cols: 2, rows: 1, commonScale: true, captions: true }
  })
}

function panelPages(project: Project, result: PipelineResult): PlanPage[] {
  const details = result.build.parts.map((p) => panelDetail(p, project.units, { materialName: materialName(project.materials, p.materialId) }))
  const perPage = PANEL_GRID.cols * PANEL_GRID.rows
  const pages = chunk(details, perPage)
  return pages.map((drawings, i) => ({
    kind: 'drawings',
    section: 'Panel details',
    title: `Panel details ${i + 1} of ${pages.length}`,
    drawings,
    cols: PANEL_GRID.cols,
    rows: PANEL_GRID.rows,
    commonScale: false,
    captions: false,
  }))
}

function sheetPages(project: Project, result: PipelineResult): PlanPage[] {
  return result.nest.sheets.map((sheet) => {
    const material = project.materials.find((m) => m.id === sheet.materialId)
    const drawing = sheetLayout(sheet, result.partsById, project.units, {
      edgeTrim: project.nest.edgeTrim,
      materialName: material?.name ?? sheet.materialId,
      grained: material?.kind === 'sheet' ? material.grained : undefined,
    })
    return { kind: 'drawings', section: 'Sheet layouts', title: drawing.title, drawings: [drawing], cols: 1, rows: 1, commonScale: true, captions: false }
  })
}

const r = (header: string, weight: number): TableColumn => ({ header, weight, align: 'right' })
const l = (header: string, weight: number): TableColumn => ({ header, weight, align: 'left' })

function tablePages(section: PlanSection, title: string, columns: TableColumn[], rows: string[][], perPage: number): TablePage[] {
  const pages = rows.length === 0 ? [[]] : chunk(rows, perPage)
  return pages.map((pageRows, i) => ({
    kind: 'table',
    section,
    title: pages.length > 1 ? `${title} (${i + 1} of ${pages.length})` : title,
    columns,
    rows: pageRows,
  }))
}

function cutListRows(project: Project, result: PipelineResult): string[][] {
  const fmt = (v: number): string => formatLength(v, project.units)
  const cabName = (id: string): string => project.cabinets.find((c) => c.id === id)?.name ?? id
  return result.bom.parts.map((p, i) => [
    String(i + 1),
    cabName(p.cabinetId),
    p.name,
    materialName(project.materials, p.materialId),
    fmt(p.length),
    fmt(p.width),
    fmt(p.thickness),
    p.grain,
    String(p.opCount),
  ])
}

export function money(value: number, currency: string): string {
  const v = Number.isFinite(value) ? value : 0
  return `${currency} ${v.toFixed(2)}`
}

function bomRows(result: PipelineResult): string[][] {
  const cur = result.estimate.currency
  return result.bom.lines.map((line) => [
    line.category,
    line.description,
    line.manufacturer ?? '',
    line.sku ?? '',
    String(line.qty),
    line.unit,
    money(line.unitCost, cur),
    money(line.total, cur),
  ])
}

export function pageSizeOf(options: PlanOptions): PageSize {
  return PAGE_SIZES[options.pageSize ?? 'letter']
}

export function buildPagePlan(project: Project, result: PipelineResult, options: PlanOptions = {}): PlanPage[] {
  const perPage = tableRowsPerPage(pageSizeOf(options))
  const cutCols = [r('#', 0.5), l('Cabinet', 2), l('Part', 2.4), l('Material', 2.6), r('Length', 1.1), r('Width', 1.1), r('Thick', 0.9), l('Grain', 0.9), r('Ops', 0.6)]
  const bomCols = [l('Category', 1), l('Description', 3.2), l('Manufacturer', 1.4), l('SKU', 1.8), r('Qty', 0.7), l('Unit', 0.7), r('Unit cost', 1.3), r('Total', 1.3)]
  return [
    { kind: 'cover', section: 'Cover', title: 'Cover' },
    ...elevationPages(project, result),
    ...panelPages(project, result),
    ...sheetPages(project, result),
    ...tablePages('Cut list', 'Cut list', cutCols, cutListRows(project, result), perPage),
    ...tablePages('Bill of materials', 'Bill of materials', bomCols, bomRows(result), perPage),
    { kind: 'estimate', section: 'Estimate', title: 'Estimate summary' },
  ]
}
