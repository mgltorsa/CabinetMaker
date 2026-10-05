/**
 * Validator for the optional `project.pdf` settings. Images are untrusted:
 * only PNG/JPEG data URLs whose magic bytes match, within the byte and pixel
 * caps, so an imported project cannot smuggle SVG/HTML or a decompression bomb.
 */
import { decodeImageDataUrl } from '@/core/image'
import { isIsoDate } from '@/core/pdf-settings'
import type { ImageDataUrl, PdfSettings, PdfWatermark } from '@/core/types'
import { PDF_LIMITS } from './limits'
import { bool, type Check, nullable, numIn, obj, oneOf, str } from './schema'

function text(max: number): Check<string> {
  return (v, p) => str(v, p) ?? ((v as string).length > max ? `${p} must be at most ${max} characters` : null)
}

const IMAGE_LIMITS = { maxBytes: PDF_LIMITS.imageBytes, maxDimension: PDF_LIMITS.imageDimension }

const image: Check<ImageDataUrl> = (v, p) => {
  if (typeof v !== 'string') return `${p} must be a string`
  const decoded = decodeImageDataUrl(v, IMAGE_LIMITS)
  return decoded.ok ? null : `${p} ${decoded.error}`
}

const fixedDate: Check<string> = (v, p) => (typeof v === 'string' && (v === '' || isIsoDate(v)) ? null : `${p} must be blank or a date written YYYY-MM-DD`)

const field = text(PDF_LIMITS.fieldLength)

const watermark = obj<PdfWatermark>({
  enabled: bool,
  kind: oneOf('image', 'text'),
  text: text(PDF_LIMITS.watermarkTextLength),
  opacity: numIn(PDF_LIMITS.opacity),
  sizePercent: numIn(PDF_LIMITS.sizePercent),
  rotationDeg: numIn(PDF_LIMITS.rotationDeg),
  placement: oneOf('centre', 'tiled', 'corner'),
  layer: oneOf('behind', 'over'),
})

export const pdfSettings = obj<PdfSettings>({
  title: field,
  client: field,
  company: field,
  designer: field,
  contact: field,
  revision: field,
  dateMode: oneOf('today', 'fixed'),
  fixedDate,
  pageSize: oneOf('letter', 'a4'),
  sections: obj<PdfSettings['sections']>({
    cover: bool,
    elevations: bool,
    panels: bool,
    sheets: bool,
    cutList: bool,
    bom: bool,
    estimate: bool,
  }),
  notes: text(PDF_LIMITS.notesLength),
  logo: nullable(image),
  watermarkImage: nullable(image),
  watermark,
})
