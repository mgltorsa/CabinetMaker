/**
 * Non-drawing page content for the plan book: title block, cover, tables and
 * estimate summary. Coordinates are mm converted to pt at the call site.
 */
import { rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
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
import { fitInBox } from './pdf-brand'
import type { PdfFonts } from './pdf-drawing'
import { estimateDetailGroups, estimateTotalRows, type SummaryRow } from './pdf-estimate'
import { money, type PlanPage, type TablePage } from './pdf-plan'
import { fitWidth, toWinAnsi, wrapText } from './pdf-text'

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

/** User branding shared by the title block and the cover (all optional). */
export interface BrandInfo {
  client?: string
  company?: string
  designer?: string
  /** Address or contact line. */
  contact?: string
  revision?: string
  logo?: PDFImage | null
}

export interface TitleBlockInfo extends BrandInfo {
  projectName: string
  title: string
  scale: string
  date: string
  units: string
  pageNo: number
  pageCount: number
}

/** Brand cell at the left of the title block (logo, company, contact). */
const BRAND_CELL_WIDTH = 64
const TITLE_LOGO_MAX_WIDTH = 22

type TitleCell = { label: string; value: string; weight: number; bold?: boolean }

const blank = (v: string | undefined): boolean => (v ?? '').trim() === ''

function drawLogo(page: PDFPage, logo: PDFImage, box: Frame, align: 'left' | 'right'): number {
  const fit = fitInBox(logo.width, logo.height, box.w, box.h)
  if (fit.width <= 0) return 0
  const x = align === 'left' ? box.x : box.x + box.w - fit.width
  page.drawImage(logo, { x: pt(x), y: pt(box.y + (box.h - fit.height) / 2), width: pt(fit.width), height: pt(fit.height) })
  return fit.width
}

function drawBrandCell(w: Writer, cell: Frame, info: BrandInfo): void {
  const logoWidth = info.logo ? drawLogo(w.page, info.logo, { x: cell.x + 2, y: cell.y + 2, w: TITLE_LOGO_MAX_WIDTH, h: cell.h - 4 }, 'left') : 0
  const x = cell.x + 2 + (logoWidth > 0 ? logoWidth + 2 : 0)
  const maxWidthMm = cell.x + cell.w - 2 - x
  const mid = cell.y + cell.h / 2
  if (!blank(info.company)) write(w, info.company ?? '', x, mid + 0.8, 8.5, { bold: true, maxWidthMm })
  if (!blank(info.contact)) write(w, info.contact ?? '', x, blank(info.company) ? mid - 1 : mid - 4, 6.5, { muted: true, maxWidthMm })
}

function drawCellRow(w: Writer, x0: number, x1: number, y: number, h: number, cells: readonly TitleCell[]): void {
  const total = cells.reduce((s, c) => s + c.weight, 0)
  let x = x0
  cells.forEach((c, i) => {
    const cw = ((x1 - x0) * c.weight) / total
    if (i > 0) w.page.drawLine({ start: { x: pt(x), y: pt(y) }, end: { x: pt(x), y: pt(y + h) }, thickness: 0.6, color: INK })
    write(w, c.label.toUpperCase(), x + 1.5, y + h - 2.8, 5.5, { muted: true })
    write(w, c.value, x + 1.5, y + 1.8, 8, { bold: c.bold, maxWidthMm: cw - 3 })
    x += cw
  })
}

export function drawFrameAndTitleBlock(w: Writer, size: PageSize, info: TitleBlockInfo): void {
  box(w.page, pageFrame(size), 1)
  const tb = titleBlockFrame(size)
  box(w.page, tb, 0.8)
  const hasBrand = Boolean(info.logo) || !blank(info.company) || !blank(info.contact)
  const x0 = hasBrand ? tb.x + BRAND_CELL_WIDTH : tb.x
  const x1 = tb.x + tb.w
  if (hasBrand) {
    drawBrandCell(w, { x: tb.x, y: tb.y, w: BRAND_CELL_WIDTH, h: tb.h }, info)
    w.page.drawLine({ start: { x: pt(x0), y: pt(tb.y) }, end: { x: pt(x0), y: pt(tb.y + tb.h) }, thickness: 0.6, color: INK })
  }
  const rowH = tb.h / 2
  w.page.drawLine({ start: { x: pt(x0), y: pt(tb.y + rowH) }, end: { x: pt(x1), y: pt(tb.y + rowH) }, thickness: 0.6, color: INK })
  drawCellRow(w, x0, x1, tb.y + rowH, rowH, [
    { label: 'Project', value: info.projectName, weight: 3, bold: true },
    { label: 'Client', value: info.client ?? '', weight: 2.2 },
    { label: 'Designer', value: info.designer ?? '', weight: 1.6 },
    { label: 'Rev', value: info.revision ?? '', weight: 0.8 },
    { label: 'Date', value: info.date, weight: 1.1 },
  ])
  drawCellRow(w, x0, x1, tb.y, rowH, [
    { label: 'Drawing', value: info.title, weight: 3.4, bold: true },
    { label: 'Scale', value: info.scale, weight: 2.3 },
    { label: 'Units', value: info.units, weight: 1 },
    { label: 'Page', value: `${info.pageNo} of ${info.pageCount}`, weight: 1 },
  ])
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

/** Cover branding: the title-block fields plus a display title and notes. */
export interface CoverBrand extends BrandInfo {
  /** Defaults to the project name. */
  title?: string
  notes?: string
}

const COVER_LOGO = { w: 70, h: 30 }
const COVER_LINE = 6
const NOTE_LINE = 4.5
const MAX_NOTE_LINES = 8
/** Top of the safety note box above the content frame bottom. */
const SAFETY_TOP = 22

/** Logo top-right; returns the width it takes from the title line (mm). */
function drawCoverLogo(w: Writer, f: Frame, logo: PDFImage | null | undefined): number {
  if (!logo) return 0
  const top = f.y + f.h
  const used = drawLogo(w.page, logo, { x: f.x + f.w - 4 - COVER_LOGO.w, y: top - 2 - COVER_LOGO.h, w: COVER_LOGO.w, h: COVER_LOGO.h }, 'right')
  return used > 0 ? used + 6 : 0
}

/** Company and contact lines under the title; returns the lowest baseline used. */
function drawCoverBrandLines(w: Writer, x: number, y: number, maxWidthMm: number, brand: CoverBrand): number {
  let last = y + 7
  if (!blank(brand.company)) {
    write(w, brand.company ?? '', x, y, 12, { bold: true, maxWidthMm })
    last = y
  }
  const details = [
    blank(brand.client) ? '' : `Client: ${brand.client ?? ''}`,
    blank(brand.designer) ? '' : `Designer: ${brand.designer ?? ''}`,
    blank(brand.revision) ? '' : (brand.revision ?? ''),
    brand.contact ?? '',
  ].filter((v) => v.trim() !== '')
  if (details.length > 0) {
    last -= blank(brand.company) ? 7 : 5.5
    write(w, details.join('   '), x, last, 9.5, { muted: true, maxWidthMm })
  }
  return last
}

/** Notes box in the left column, just above the safety note; returns its top (or the floor when empty). */
function drawCoverNotes(w: Writer, f: Frame, widthMm: number, notes: string | undefined): number {
  const floor = f.y + SAFETY_TOP + 4
  const lines = blank(notes) ? [] : wrapText(w.fonts.regular, notes ?? '', 9, pt(widthMm - 6), MAX_NOTE_LINES)
  if (lines.length === 0) return floor
  const h = 8 + lines.length * NOTE_LINE
  const top = floor + h
  w.page.drawRectangle({ x: pt(f.x + 4), y: pt(floor), width: pt(widthMm), height: pt(h), borderColor: RULE, borderWidth: 0.6 })
  write(w, 'Notes', f.x + 7, top - 5, 10, { bold: true })
  lines.forEach((line, i) => write(w, line, f.x + 7, top - 10 - i * NOTE_LINE, 9))
  return top + 2
}

export function drawCoverPage(w: Writer, size: PageSize, project: Project, result: PipelineResult, plan: readonly PlanPage[], brand: CoverBrand = {}): void {
  const f = contentFrame(size)
  const top = f.y + f.h
  const logoWidth = drawCoverLogo(w, f, brand.logo)
  write(w, 'Plan set', f.x + 4, top - 12, 11, { muted: true })
  write(w, blank(brand.title) ? project.name : (brand.title ?? ''), f.x + 4, top - 24, 24, { bold: true, maxWidthMm: f.w - 8 - logoWidth })
  const brandBottom = drawCoverBrandLines(w, f.x + 4, top - 32, f.w - 8 - logoWidth, brand)
  const colTop = Math.min(top - 38, brandBottom - 9)
  const colW = f.w / 2 - 8

  const floor = drawCoverNotes(w, f, colW, brand.notes)
  let y = colTop
  write(w, 'Cabinets', f.x + 4, y, 12, { bold: true })
  const suffix = project.units === 'metric' ? ' mm' : ''
  const fit = Math.max(Math.floor((colTop - floor) / COVER_LINE), 0)
  const cabinets = project.cabinets
  const shown = cabinets.length <= Math.min(MAX_COVER_CABINETS, fit) ? cabinets.length : Math.max(Math.min(MAX_COVER_CABINETS, fit - 1), 0)
  cabinets.slice(0, shown).forEach((c) => {
    y -= COVER_LINE
    const dims = [c.width, c.height, c.depth].map((v) => formatLength(v, project.units)).join(' x ')
    write(w, `${c.name} (${c.type}) - W x H x D ${dims}${suffix}`, f.x + 4, y, 9, { maxWidthMm: colW })
  })
  if (cabinets.length > shown) write(w, `... and ${cabinets.length - shown} more`, f.x + 4, y - COVER_LINE, 9, { muted: true })

  const rx = f.x + f.w / 2 + 4
  let ry = colTop
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

  const note: Frame = { x: f.x + 4, y: f.y + 4, w: f.w - 8, h: SAFETY_TOP - 4 }
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
