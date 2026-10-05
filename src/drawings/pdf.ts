/**
 * Multi-page plan book rendered with pdf-lib from the same `Drawing` model as
 * the screen. Pages come from `buildPagePlan`; `planPageCount` is that plan's
 * length, so the page count is known without rendering. Title block, cover,
 * branding, watermark, sections and page size follow `project.pdf`.
 */
import { PDFDocument, StandardFonts, type PDFPage } from 'pdf-lib'
import { pdfDisplayTitle, resolvePdfSettings, titleBlockDate } from '@/core/pdf-settings'
import type { PdfSettings, Project } from '@/core/types'
import type { PipelineResult } from '@/pipeline'
import { drawDrawing, fitScale, scaleNote, type PdfFonts } from './pdf-drawing'
import { cellDrawingFrame, contentFrame, gridCells, PT_PER_MM, type PageSize } from './pdf-layout'
import { embedBrandImages } from './pdf-brand'
import { drawCoverPage, drawEstimatePage, drawFrameAndTitleBlock, drawTablePage, type CoverBrand } from './pdf-pages'
import { buildPagePlan, pageSizeOf, type DrawingsPage, type PlanOptions, type PlanPage } from './pdf-plan'
import { fitWidth } from './pdf-text'
import { drawWatermark, type WatermarkSources } from './pdf-watermark'

export type { PlanOptions } from './pdf-plan'
export type { PageSizeName } from './pdf-layout'

const PRODUCER = 'CabinetMaker'

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

function renderPage(page: PDFPage, fonts: PdfFonts, size: PageSize, spec: PlanPage, project: Project, result: PipelineResult, plan: readonly PlanPage[], brand: CoverBrand): string {
  switch (spec.kind) {
    case 'cover':
      drawCoverPage({ page, fonts }, size, project, result, plan, brand)
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

/** Title, author, subject and keywords from the PDF settings (searchable in PDF viewers). */
function setMetadata(doc: PDFDocument, title: string, settings: PdfSettings, date: Date): void {
  const company = settings.company.trim()
  const client = settings.client.trim()
  const author = settings.designer.trim() || company
  doc.setTitle(`${title} - plan set`)
  if (author) doc.setAuthor(author)
  doc.setSubject(['Plan set', client && `for ${client}`, company && `by ${company}`].filter(Boolean).join(' '))
  doc.setKeywords([company, client, settings.revision.trim(), 'cabinet plans'].filter(Boolean))
  doc.setProducer(PRODUCER)
  doc.setCreator(PRODUCER)
  doc.setCreationDate(date)
  doc.setModificationDate(date)
}

export async function buildPlanPdf(project: Project, result: PipelineResult, options: PlanOptions = {}): Promise<Uint8Array> {
  const settings = resolvePdfSettings(project)
  const size = pageSizeOf(options, project)
  const now = options.date ?? new Date()
  const plan = buildPagePlan(project, result, options)
  const title = pdfDisplayTitle(project, settings)
  const doc = await PDFDocument.create()
  setMetadata(doc, title, settings, now)
  const fonts: PdfFonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const images = await embedBrandImages(doc, settings)
  const watermark: WatermarkSources = { text: fonts.bold, image: images.watermark }
  const { client, company, designer, contact, revision, notes } = settings
  const brand: CoverBrand = { title, client, company, designer, contact, revision, notes, logo: images.logo }
  const behind = settings.watermark.layer === 'behind'
  const units = project.units === 'metric' ? 'mm' : 'inches'
  const date = titleBlockDate(settings, now)
  plan.forEach((spec, i) => {
    const page = doc.addPage([size.width * PT_PER_MM, size.height * PT_PER_MM])
    if (behind) drawWatermark(page, settings.watermark, watermark)
    const scale = renderPage(page, fonts, size, spec, project, result, plan, brand)
    drawFrameAndTitleBlock({ page, fonts }, size, {
      ...brand,
      projectName: title,
      title: spec.title,
      scale,
      date,
      units,
      pageNo: i + 1,
      pageCount: plan.length,
    })
    if (!behind) drawWatermark(page, settings.watermark, watermark)
  })
  return doc.save()
}
