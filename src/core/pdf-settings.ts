/**
 * Plan-book PDF settings: defaults for projects saved without them, the
 * bounds shared by the validator, the editor and the renderer, and pure
 * immutable updates.
 */
import type { PdfSectionKey, PdfSettings, PdfWatermark, Project } from './types'

/** Bounds for `PdfSettings`; re-exported by the UI limits for the validator and inputs. */
export const PDF_LIMITS = {
  /** Watermark opacity as a fraction (5–50 %): drawings stay readable. */
  opacity: { min: 0.05, max: 0.5 },
  /** Watermark width as a percentage of the page width. */
  sizePercent: { min: 5, max: 100 },
  rotationDeg: { min: -180, max: 180 },
  /** Title-block fields (title, client, company, …). */
  fieldLength: 120,
  watermarkTextLength: 40,
  notesLength: 1000,
  /**
   * Decoded bytes per image. Two images as base64 stay under ~3 MB, which
   * keeps the localStorage autosave (≈5 MB per origin) working.
   */
  imageBytes: 1024 * 1024,
  /** Pixels per side; caps decode memory (pdf-lib decodes PNGs in full). */
  imageDimension: 4096,
} as const

export const PDF_SECTION_KEYS: readonly PdfSectionKey[] = ['cover', 'elevations', 'panels', 'sheets', 'cutList', 'bom', 'estimate']

export const DEFAULT_WATERMARK: Readonly<PdfWatermark> = {
  enabled: false,
  kind: 'text',
  text: 'DRAFT',
  opacity: 0.12,
  sizePercent: 60,
  rotationDeg: 45,
  placement: 'centre',
  layer: 'behind',
}

export const DEFAULT_PDF_SETTINGS: Readonly<PdfSettings> = {
  title: '',
  client: '',
  company: '',
  designer: '',
  contact: '',
  revision: '',
  dateMode: 'today',
  fixedDate: '',
  pageSize: 'letter',
  sections: { cover: true, elevations: true, panels: true, sheets: true, cutList: true, bom: true, estimate: true },
  notes: '',
  logo: null,
  watermarkImage: null,
  watermark: DEFAULT_WATERMARK,
}

/** The project's PDF settings, or the defaults for projects saved without them. */
export function resolvePdfSettings(project: Pick<Project, 'pdf'>): PdfSettings {
  return project.pdf ?? DEFAULT_PDF_SETTINGS
}

export function withPdfSettings(project: Project, patch: Partial<Omit<PdfSettings, 'watermark'>>): Project {
  return { ...project, pdf: { ...resolvePdfSettings(project), ...patch } }
}

export function withWatermark(project: Project, patch: Partial<PdfWatermark>): Project {
  const pdf = resolvePdfSettings(project)
  return { ...project, pdf: { ...pdf, watermark: { ...pdf.watermark, ...patch } } }
}

/** The title printed on the cover and in the title block. */
export function pdfDisplayTitle(project: Pick<Project, 'name'>, settings: PdfSettings): string {
  return settings.title.trim() || project.name
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar date written `YYYY-MM-DD`. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isoDay(date: Date): string {
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/** Date printed in the title block: the fixed date when chosen and valid, else `now`. */
export function titleBlockDate(settings: PdfSettings, now: Date): string {
  return settings.dateMode === 'fixed' && isIsoDate(settings.fixedDate) ? settings.fixedDate : isoDay(now)
}
