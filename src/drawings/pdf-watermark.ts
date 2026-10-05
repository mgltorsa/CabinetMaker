/**
 * Page watermark (text or image) in pt. pdf-lib rotates text and images about
 * their origin, so each item is positioned by its centre and the origin is
 * derived from the rotation. Items are scaled down until their rotated
 * bounding box fits inside the page margin, so nothing is drawn off the page.
 */
import { degrees, rgb, type PDFFont, type PDFImage, type PDFPageDrawImageOptions, type PDFPageDrawTextOptions } from 'pdf-lib'
import { PDF_LIMITS } from '@/core/pdf-settings'
import type { PdfWatermark, WatermarkPlacement } from '@/core/types'
import { toWinAnsi } from './pdf-text'

/** The part of `PDFPage` the watermark uses (lets tests record draw calls). */
export interface WatermarkTarget {
  getSize(): { width: number; height: number }
  drawText(text: string, options?: PDFPageDrawTextOptions): void
  drawImage(image: PDFImage, options?: PDFPageDrawImageOptions): void
}

export interface WatermarkSources {
  /** Font for a text watermark. */
  text: PDFFont | null
  image: PDFImage | null
}

export interface Extent {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** Clear space kept between a watermark and the paper edge (pt). */
const MARGIN_PT = 18
/** Space between tiles as a fraction of the tile's rotated extent. */
const TILE_GAP = 0.6
/** Tiles per row / column; more adds file size, not legibility. */
const MAX_TILES_PER_AXIS = 8
const WATERMARK_GREY = rgb(0.45, 0.45, 0.45)

const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : lo)

/** Axis-aligned extent of a `width` × `height` box rotated by `deg`. */
export function rotatedExtent(width: number, height: number, deg: number): Extent {
  const r = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  return { width: width * c + height * s, height: width * s + height * c }
}

/** Origin that puts the centre of a `width` × `height` box rotated by `deg` (about the origin) at `centre`. */
export function originForCentre(centre: Point, width: number, height: number, deg: number): Point {
  const r = (deg * Math.PI) / 180
  return {
    x: centre.x - (width / 2) * Math.cos(r) + (height / 2) * Math.sin(r),
    y: centre.y - (width / 2) * Math.sin(r) - (height / 2) * Math.cos(r),
  }
}

function axisCentres(span: number, extent: number): number[] {
  const usable = span - 2 * MARGIN_PT - extent
  if (usable <= 0) return [span / 2]
  const step = extent * (1 + TILE_GAP)
  const count = Math.min(Math.floor(usable / step) + 1, MAX_TILES_PER_AXIS)
  const pitch = count > 1 ? Math.max(step, usable / (count - 1)) : 0
  const used = pitch * (count - 1)
  return Array.from({ length: count }, (_, i) => span / 2 - used / 2 + i * pitch)
}

/** Centres for one item of rotated `extent` on a page of `page` size. */
export function watermarkCentres(page: Extent, extent: Extent, placement: WatermarkPlacement): Point[] {
  switch (placement) {
    case 'centre':
      return [{ x: page.width / 2, y: page.height / 2 }]
    case 'corner':
      return [{ x: page.width - MARGIN_PT - extent.width / 2, y: page.height - MARGIN_PT - extent.height / 2 }]
    case 'tiled': {
      const xs = axisCentres(page.width, extent.width)
      const ys = axisCentres(page.height, extent.height)
      return ys.flatMap((y) => xs.map((x) => ({ x, y })))
    }
  }
}

/** Scale (≤ 1) that makes the rotated item fit inside the page margin. */
function fitFactor(page: Extent, width: number, height: number, deg: number): number {
  const e = rotatedExtent(width, height, deg)
  const room = { width: Math.max(page.width - 2 * MARGIN_PT, 1), height: Math.max(page.height - 2 * MARGIN_PT, 1) }
  return Math.min(1, room.width / Math.max(e.width, 1e-9), room.height / Math.max(e.height, 1e-9))
}

interface Item {
  width: number
  height: number
  draw: (origin: Point) => void
}

function layout(page: Extent, wm: PdfWatermark, item: Item, deg: number): void {
  const extent = rotatedExtent(item.width, item.height, deg)
  watermarkCentres(page, extent, wm.placement).forEach((centre) => item.draw(originForCentre(centre, item.width, item.height, deg)))
}

/** Draw `wm` on `page`; draws nothing when it is off or has nothing to show. */
export function drawWatermark(page: WatermarkTarget, wm: PdfWatermark, sources: WatermarkSources): void {
  if (!wm.enabled) return
  const size = page.getSize()
  const opacity = clamp(wm.opacity, PDF_LIMITS.opacity.min, PDF_LIMITS.opacity.max)
  const deg = clamp(wm.rotationDeg, PDF_LIMITS.rotationDeg.min, PDF_LIMITS.rotationDeg.max)
  const rotate = degrees(deg)
  const target = (size.width * clamp(wm.sizePercent, PDF_LIMITS.sizePercent.min, PDF_LIMITS.sizePercent.max)) / 100

  if (wm.kind === 'text') {
    const font = sources.text
    const text = toWinAnsi(wm.text).trim()
    if (!font || text === '') return
    const w1 = font.widthOfTextAtSize(text, 1)
    const h1 = font.heightAtSize(1, { descender: false })
    if (!(w1 > 0)) return
    const base = target / w1
    const fontSize = base * fitFactor(size, w1 * base, h1 * base, deg)
    layout(size, wm, {
      width: w1 * fontSize,
      height: h1 * fontSize,
      draw: ({ x, y }) => page.drawText(text, { x, y, size: fontSize, font, color: WATERMARK_GREY, opacity, rotate }),
    }, deg)
    return
  }

  const image = sources.image
  if (!image || !(image.width > 0) || !(image.height > 0)) return
  const h0 = (target * image.height) / image.width
  const k = fitFactor(size, target, h0, deg)
  const width = target * k
  const height = h0 * k
  layout(size, wm, { width, height, draw: ({ x, y }) => page.drawImage(image, { x, y, width, height, opacity, rotate }) }, deg)
}
