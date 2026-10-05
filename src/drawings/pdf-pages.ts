/**
 * Non-drawing page content for the plan book: title block, cover, tables and
 * estimate summary. Coordinates are mm converted to pt at the call site.
 */
import { rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Project } from '@/core/types'
import { formatLength } from '@/core/units'
import type { PipelineResult } from '@/pipeline'
import {
  PT_PER_MM,
  TABLE_HEADER_HEIGHT,
  TABLE_ROW_HEIGHT,
  TABLE_TITLE_HEIGHT,
  contentFrame,
  pageFrame,
  titleBlockFrame,
  type Frame,
  type PageSize,
} from './pdf-layout'
import type { PdfFonts } from './pdf-drawing'
import { estimateDetailGroups, estimateTotalRows, type SummaryRow } from './pdf-estimate'
import { money, type PlanPage, type TablePage } from './pdf-plan'
import { fitWidth, toWinAnsi } from './pdf-text'

const INK = rgb(0.1, 0.1, 0.1)
const MUTED = rgb(0.42, 0.42, 0.42)
const RULE = rgb(0.75, 0.75, 0.75)
const WARN_FILL = rgb(1, 0.96, 0.86)
const WARN_BORDER = rgb(0.8, 0.55, 0.1)

/** Shown on the cover: CNC output in this app is preview quality only. */
export const CNC_SAFETY_NOTE =
  'CNC toolpaths and G-code from this project are a PREVIEW. Simulate every program and verify tools, ' +
  'feeds, zero and hold-down before running it on a machine. Manual ops (face B, edge bores) are listed per panel.'

const MAX_COVER_CABINETS = 12

const pt = (mm: number): number => mm * PT_PER_MM

interface Writer {
  page: PDFPage
  fonts: PdfFonts
}

function write(w: Writer, value: string, xMm: number, yMm: number, size: number, opts: { bold?: boolean; maxWidthMm?: number; align?: 'left' | 'right'; muted?: boolean } = {}): void {
  const font: PDFFont = opts.bold ? w.fonts.bold : w.fonts.regular
  const textValue = opts.maxWidthMm !== undefined ? fitWidth(font, value, size, pt(opts.maxWidthMm)) : toWinAnsi(value)
  const width = font.widthOfTextAtSize(textValue, size)
  const x = opts.align === 'right' ? pt(xMm) - width : pt(xMm)
  w.page.drawText(textValue, { x, y: pt(yMm), size, font, color: opts.muted ? MUTED : INK })
}

function box(page: PDFPage, f: Frame, borderWidth = 0.8): void {
  page.drawRectangle({ x: pt(f.x), y: pt(f.y), width: pt(f.w), height: pt(f.h), borderColor: INK, borderWidth })
}

function hline(page: PDFPage, x0: number, x1: number, y: number, color = RULE): void {
  page.drawLine({ start: { x: pt(x0), y: pt(y) }, end: { x: pt(x1), y: pt(y) }, thickness: 0.5, color })
}

export interface TitleBlockInfo {
  projectName: string
  title: string
  scale: string
  date: string
  units: string
  pageNo: number
  pageCount: number
}

export function drawFrameAndTitleBlock(w: Writer, size: PageSize, info: TitleBlockInfo): void {
  box(w.page, pageFrame(size), 1)
  const tb = titleBlockFrame(size)
  box(w.page, tb, 0.8)
  const cells: Array<[string, string, number]> = [
    ['Project', info.projectName, 3],
    ['Drawing', info.title, 3.4],
    ['Scale', info.scale, 2],
    ['Units', info.units, 1],
    ['Date', info.date, 1.2],
    ['Page', `${info.pageNo} of ${info.pageCount}`, 1],
  ]
  const total = cells.reduce((s, c) => s + c[2], 0)
  let x = tb.x
  cells.forEach(([label, value, weight], i) => {
    const cw = (tb.w * weight) / total
    if (i > 0) w.page.drawLine({ start: { x: pt(x), y: pt(tb.y) }, end: { x: pt(x), y: pt(tb.y + tb.h) }, thickness: 0.6, color: INK })
    write(w, label.toUpperCase(), x + 2, tb.y + tb.h - 4.5, 6, { muted: true })
    write(w, value, x + 2, tb.y + 3.5, 9, { bold: i < 2, maxWidthMm: cw - 4 })
    x += cw
  })
}

export function drawTablePage(w: Writer, size: PageSize, page: TablePage): void {
  const f = contentFrame(size)
  const top = f.y + f.h
  write(w, page.title, f.x, top - 7, 13, { bold: true, maxWidthMm: f.w })
  const total = page.columns.reduce((s, c) => s + c.weight, 0)
  const widths = page.columns.map((c) => (f.w * c.weight) / total)
  const lefts = widths.map((_, i) => f.x + widths.slice(0, i).reduce((s, v) => s + v, 0))
  const headerY = top - TABLE_TITLE_HEIGHT - TABLE_HEADER_HEIGHT
  const cell = (value: string, i: number, y: number, bold: boolean): void => {
    const col = page.columns[i]
    const left = lefts[i] ?? f.x
    const width = widths[i] ?? 0
    if (!col) return
    const x = col.align === 'right' ? left + width - 1.5 : left + 1.5
    write(w, value, x, y, 8, { bold, maxWidthMm: width - 3, align: col.align })
  }
  page.columns.forEach((c, i) => cell(c.header, i, headerY + 2, true))
  hline(w.page, f.x, f.x + f.w, headerY, INK)
  if (page.rows.length === 0) write(w, 'None.', f.x + 1.5, headerY - TABLE_ROW_HEIGHT + 1.5, 8, { muted: true })
  page.rows.forEach((row, ri) => {
    const y = headerY - (ri + 1) * TABLE_ROW_HEIGHT
    row.forEach((v, ci) => cell(v, ci, y + 1.5, false))
    hline(w.page, f.x, f.x + f.w, y)
  })
}

function contentsLines(plan: readonly PlanPage[]): string[] {
  const seen = new Map<string, number>()
  plan.forEach((p, i) => {
    if (!seen.has(p.section)) seen.set(p.section, i + 1)
  })
  return [...seen.entries()].filter(([s]) => s !== 'Cover').map(([s, n]) => `${s} ..... page ${n}`)
}

function coverFacts(project: Project, result: PipelineResult): string[] {
  const sheetsByMaterial = result.nest.summary.length > 0 ? result.nest.summary.map((s) => `${s.sheetCount} x ${s.materialId}`).join(', ') : `${result.nest.sheets.length}`
  const facts = [
    `Cabinets: ${project.cabinets.length}`,
    `Parts: ${result.build.parts.length}`,
    `Sheets: ${result.nest.sheets.length} (${sheetsByMaterial})`,
    `Materials: ${money(result.estimate.materialCost, result.estimate.currency)}   Hardware: ${money(result.estimate.hardwareCost, result.estimate.currency)}   Labor: ${money(result.estimate.laborCost, result.estimate.currency)}`,
    `Price: ${money(result.estimate.price, result.estimate.currency)}`,
  ]
  if (result.estimate.tax > 0) facts.push(`Total incl. tax: ${money(result.estimate.total, result.estimate.currency)}`)
  if (result.nest.unplaced.length > 0) facts.push(`WARNING: ${result.nest.unplaced.length} part(s) could not be placed on a sheet`)
  if (result.build.warnings.length > 0) facts.push(`Build warnings: ${result.build.warnings.length}`)
  return facts
}

export function drawCoverPage(w: Writer, size: PageSize, project: Project, result: PipelineResult, plan: readonly PlanPage[]): void {
  const f = contentFrame(size)
  const top = f.y + f.h
  write(w, 'Plan set', f.x + 4, top - 12, 11, { muted: true })
  write(w, project.name, f.x + 4, top - 24, 24, { bold: true, maxWidthMm: f.w - 8 })
  const colW = f.w / 2 - 8
  let y = top - 38
  write(w, 'Cabinets', f.x + 4, y, 12, { bold: true })
  const suffix = project.units === 'metric' ? ' mm' : ''
  project.cabinets.slice(0, MAX_COVER_CABINETS).forEach((c) => {
    y -= 6
    const dims = [c.width, c.height, c.depth].map((v) => formatLength(v, project.units)).join(' x ')
    write(w, `${c.name} (${c.type}) - W x H x D ${dims}${suffix}`, f.x + 4, y, 9, { maxWidthMm: colW })
  })
  if (project.cabinets.length > MAX_COVER_CABINETS) write(w, `... and ${project.cabinets.length - MAX_COVER_CABINETS} more`, f.x + 4, y - 6, 9, { muted: true })

  const rx = f.x + f.w / 2 + 4
  let ry = top - 38
  write(w, 'Totals', rx, ry, 12, { bold: true })
  coverFacts(project, result).forEach((line) => {
    ry -= 6
    write(w, line, rx, ry, 9, { maxWidthMm: colW })
  })
  ry -= 12
  write(w, 'Contents', rx, ry, 12, { bold: true })
  contentsLines(plan).forEach((line) => {
    ry -= 6
    write(w, line, rx, ry, 9, { maxWidthMm: colW })
  })

  const note: Frame = { x: f.x + 4, y: f.y + 4, w: f.w - 8, h: 18 }
  w.page.drawRectangle({ x: pt(note.x), y: pt(note.y), width: pt(note.w), height: pt(note.h), color: WARN_FILL, borderColor: WARN_BORDER, borderWidth: 1 })
  write(w, 'Safety', note.x + 3, note.y + note.h - 6, 10, { bold: true })
  const half = Math.ceil(CNC_SAFETY_NOTE.length / 2)
  const split = CNC_SAFETY_NOTE.indexOf(' ', half)
  const lines = split > 0 ? [CNC_SAFETY_NOTE.slice(0, split), CNC_SAFETY_NOTE.slice(split + 1)] : [CNC_SAFETY_NOTE]
  lines.forEach((line, i) => write(w, line, note.x + 3, note.y + note.h - 11 - i * 4.5, 8, { maxWidthMm: note.w - 6 }))
}

/** Left column: labor and extra charge details; right column: totals through tax. */
export function drawEstimatePage(w: Writer, size: PageSize, result: PipelineResult): void {
  const f = contentFrame(size)
  const est = result.estimate
  const top = f.y + f.h - 7
  write(w, 'Estimate summary', f.x, top, 13, { bold: true })
  const colW = f.w / 2 - 8
  const column = (x: number, rows: readonly SummaryRow[], startY: number): number => {
    let y = startY
    rows.forEach((r) => {
      y -= 6.5
      write(w, r.label, x + 2, y, 10, { bold: r.isBold, maxWidthMm: colW - 34 })
      write(w, r.amount, x + colW, y, 10, { bold: r.isBold, align: 'right' })
    })
    return y
  }

  let y = top - 4
  estimateDetailGroups(est).forEach((group) => {
    y -= 6
    write(w, group.heading, f.x + 2, y, 11, { bold: true })
    y = group.rows.length === 0 ? column(f.x, [{ label: `No ${group.heading.toLowerCase()} lines`, amount: '' }], y) : column(f.x, group.rows, y)
    y -= 2
  })

  const rx = f.x + f.w / 2 + 4
  write(w, 'Totals', rx + 2, top - 10, 11, { bold: true })
  const totalsEnd = column(rx, estimateTotalRows(est), top - 10)
  hline(w.page, rx, rx + colW, totalsEnd - 2, INK)
  write(w, 'Estimate only. Verify material, hardware prices and SKUs with your suppliers.', f.x + 2, f.y + 4, 8, { muted: true, maxWidthMm: f.w })
}
