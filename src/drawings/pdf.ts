/**
 * Multi-page plan book rendered with pdf-lib from the same `Drawing` model as
 * the screen. Pages come from `buildPagePlan`; `planPageCount` is that plan's
 * length, so the page count is known without rendering.
 */
import { PDFDocument, StandardFonts, type PDFPage } from 'pdf-lib'
import type { Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { drawDrawing, fitScale, scaleNote, type PdfFonts } from './pdf-drawing'
import { cellDrawingFrame, contentFrame, gridCells, PT_PER_MM, type PageSize } from './pdf-layout'
import { drawCoverPage, drawEstimatePage, drawFrameAndTitleBlock, drawTablePage } from './pdf-pages'
import { buildPagePlan, pageSizeOf, type DrawingsPage, type PlanOptions, type PlanPage } from './pdf-plan'
import { fitWidth } from './pdf-text'

export type { PlanOptions } from './pdf-plan'
export type { PageSizeName } from './pdf-layout'

const PRODUCER = 'CabinetMaker'

function isoDate(date: Date): string {
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/** Draws a drawings page; returns the scale note for the title block. */
function drawDrawingsPage(page: PDFPage, fonts: PdfFonts, size: PageSize, spec: DrawingsPage, project: Project): string {
  const cells = gridCells(contentFrame(size), spec.cols, spec.rows)
  const frames = spec.drawings.map((_, i) => cellDrawingFrame(cells[i] ?? contentFrame(size), spec.captions))
  const scales = spec.drawings.map((d, i) => fitScale(d, frames[i] ?? contentFrame(size)))
  const common = Math.min(...scales)
  spec.drawings.forEach((drawing, i) => {
    const cell = cells[i]
    const frame = frames[i]
    if (!cell || !frame) return
    if (spec.captions) {
      const caption = fitWidth(fonts.bold, drawing.title, 9, cell.w * PT_PER_MM - 8)
      page.drawText(caption, { x: (cell.x + 3) * PT_PER_MM, y: (cell.y + cell.h - 5) * PT_PER_MM, size: 9, font: fonts.bold })
    }
    drawDrawing(page, drawing, frame, spec.commonScale ? common : (scales[i] ?? common), fonts, project.units)
  })
  return spec.commonScale && Number.isFinite(common) ? scaleNote(common) : 'Not to scale'
}

function renderPage(page: PDFPage, fonts: PdfFonts, size: PageSize, spec: PlanPage, project: Project, result: PipelineResult, plan: readonly PlanPage[]): string {
  switch (spec.kind) {
    case 'cover':
      drawCoverPage({ page, fonts }, size, project, result, plan)
      return '-'
    case 'drawings':
      return drawDrawingsPage(page, fonts, size, spec, project)
    case 'table':
      drawTablePage({ page, fonts }, size, spec)
      return '-'
    case 'estimate':
      drawEstimatePage({ page, fonts }, size, result)
      return '-'
  }
}

/** Number of pages `buildPlanPdf` produces for the same inputs. */
export function planPageCount(project: Project, result: PipelineResult, options: PlanOptions = {}): number {
  return buildPagePlan(project, result, options).length
}

export async function buildPlanPdf(project: Project, result: PipelineResult, options: PlanOptions = {}): Promise<Uint8Array> {
  const size = pageSizeOf(options)
  const date = options.date ?? new Date()
  const plan = buildPagePlan(project, result, options)
  const doc = await PDFDocument.create()
  doc.setTitle(`${project.name} - plan set`)
  doc.setProducer(PRODUCER)
  doc.setCreator(PRODUCER)
  doc.setCreationDate(date)
  doc.setModificationDate(date)
  const fonts: PdfFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const units = project.units === 'metric' ? 'mm' : 'inches'
  plan.forEach((spec, i) => {
    const page = doc.addPage([size.width * PT_PER_MM, size.height * PT_PER_MM])
    const scale = renderPage(page, fonts, size, spec, project, result, plan)
    drawFrameAndTitleBlock({ page, fonts }, size, {
      projectName: project.name,
      title: spec.title,
      scale,
      date: isoDate(date),
      units,
      pageNo: i + 1,
      pageCount: plan.length,
    })
  })
  return doc.save()
}
