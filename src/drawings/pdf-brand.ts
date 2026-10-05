/**
 * User branding images for the plan book. Stored images are untrusted: each is
 * re-validated (magic bytes, byte and pixel caps) before pdf-lib sees it, and
 * an image pdf-lib cannot read is skipped rather than failing the export.
 */
import type { PDFDocument, PDFImage } from 'pdf-lib'
import { decodeImageDataUrl } from '@/core/image'
import { PDF_LIMITS } from '@/core/pdf-settings'
import type { ImageDataUrl, PdfSettings } from '@/core/types'

export interface BrandImages {
  logo: PDFImage | null
  /** Image for an image watermark (the logo unless a separate one is set). */
  watermark: PDFImage | null
}

const IMAGE_LIMITS = { maxBytes: PDF_LIMITS.imageBytes, maxDimension: PDF_LIMITS.imageDimension }

/** Embed a PNG/JPEG data URL, or `null` when absent, invalid or unreadable. */
export async function embedBrandImage(doc: PDFDocument, value: ImageDataUrl | null): Promise<PDFImage | null> {
  if (!value) return null
  const decoded = decodeImageDataUrl(value, IMAGE_LIMITS)
  if (!decoded.ok) return null
  try {
    return decoded.info.kind === 'png' ? await doc.embedPng(decoded.bytes) : await doc.embedJpg(decoded.bytes)
  } catch {
    // Valid header, corrupt body: leave the image out.
    return null
  }
}

export async function embedBrandImages(doc: PDFDocument, settings: PdfSettings): Promise<BrandImages> {
  const logo = await embedBrandImage(doc, settings.logo)
  const wm = settings.watermark
  const wantsImage = wm.enabled && wm.kind === 'image'
  const watermark = !wantsImage ? null : settings.watermarkImage ? await embedBrandImage(doc, settings.watermarkImage) : logo
  return { logo, watermark }
}

/** Largest size with the image's aspect ratio that fits `boxW` × `boxH`. */
export function fitInBox(width: number, height: number, boxW: number, boxH: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0) || !(boxW > 0) || !(boxH > 0)) return { width: 0, height: 0 }
  const k = Math.min(boxW / width, boxH / height)
  return { width: width * k, height: height * k }
}
