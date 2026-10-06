/**
 * Page geometry for the plan book, in mm (PDF coordinates: origin bottom-left,
 * +Y up). Shared by the pure page planner and the pdf-lib renderer so the
 * planned page count is exactly what gets rendered.
 */
import type { Mm } from '@/core/types'

export type PageSizeName = 'letter' | 'a4'

export interface PageSize {
  width: Mm
  height: Mm
}

/** Landscape sizes. Letter 11 × 8.5 in; ISO A4 297 × 210 mm. */
export const PAGE_SIZES: Readonly<Record<PageSizeName, PageSize>> = {
  letter: { width: 279.4, height: 215.9 },
  a4: { width: 297, height: 210 },
}

export const PT_PER_MM = 72 / 25.4

export const PAGE_MARGIN: Mm = 10
/** Two 9 mm rows of cells plus a brand cell (logo, company, contact). */
export const TITLE_BLOCK_HEIGHT: Mm = 18
/** Gap between the content area and the title block. */
export const CONTENT_GAP: Mm = 4

export const TABLE_TITLE_HEIGHT: Mm = 10
export const TABLE_HEADER_HEIGHT: Mm = 7
export const TABLE_ROW_HEIGHT: Mm = 5.2

/** Panel details per page; 2 × 2 keeps dimension text legible on Letter/A4. */
export const PANEL_GRID = { cols: 2, rows: 2 } as const
export const CELL_CAPTION_HEIGHT: Mm = 6
export const CELL_PADDING: Mm = 3

export interface Frame {
  x: Mm
  y: Mm
  w: Mm
  h: Mm
}

export function pageFrame(size: PageSize): Frame {
  return { x: PAGE_MARGIN, y: PAGE_MARGIN, w: size.width - PAGE_MARGIN * 2, h: size.height - PAGE_MARGIN * 2 }
}

export function titleBlockFrame(size: PageSize): Frame {
  const f = pageFrame(size)
  return { x: f.x, y: f.y, w: f.w, h: TITLE_BLOCK_HEIGHT }
}

/** Area above the title block. */
export function contentFrame(size: PageSize): Frame {
  const f = pageFrame(size)
  const y = f.y + TITLE_BLOCK_HEIGHT + CONTENT_GAP
  return { x: f.x + 2, y, w: f.w - 4, h: f.y + f.h - 2 - y }
}

export function tableRowsPerPage(size: PageSize): number {
  const usable = contentFrame(size).h - TABLE_TITLE_HEIGHT - TABLE_HEADER_HEIGHT
  return Math.max(1, Math.floor(usable / TABLE_ROW_HEIGHT))
}

/** Split a frame into a cols × rows grid, row-major from the top-left. */
export function gridCells(frame: Frame, cols: number, rows: number): Frame[] {
  const w = frame.w / cols
  const h = frame.h / rows
  return Array.from({ length: cols * rows }, (_, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    return { x: frame.x + c * w, y: frame.y + frame.h - (r + 1) * h, w, h }
  })
}

/** Drawing area of a grid cell, below its caption when it has one. */
export function cellDrawingFrame(cell: Frame, caption: boolean): Frame {
  const captionHeight = caption ? CELL_CAPTION_HEIGHT : 0
  return {
    x: cell.x + CELL_PADDING,
    y: cell.y + CELL_PADDING,
    w: Math.max(cell.w - CELL_PADDING * 2, 1),
    h: Math.max(cell.h - captionHeight - CELL_PADDING * 2, 1),
  }
}
