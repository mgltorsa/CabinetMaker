/**
 * Render a neutral `Drawing` onto a pdf-lib page inside a frame. PDF space is
 * already +Y up, so model coordinates map with a scale and offset only.
 */
import { degrees, rgb, type Color, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Drawing, Mm, Shape, UnitSystem } from '@/core/types'
import { dimensionGeometry, type Segment } from './dimension'
import { PT_PER_MM, type Frame } from './pdf-layout'
import { toWinAnsi } from './pdf-text'
import { hexToRgb, LAYER_STYLES, safeFill, styleForDrawing, type DrawingStyle, type LayerStyle } from './style'

/** Smallest text size printed, in pt; smaller labels are enlarged to this. */
const MIN_TEXT_PT = 4
/** Line weights are specified for screens; print slightly finer. */
const PRINT_WEIGHT = 0.6
const PRINT_DASH = 0.5

export interface PdfFonts {
  regular: PDFFont
  bold: PDFFont
}

/** pt per model mm so the drawing fits `frame` (mm). */
export function fitScale(drawing: Drawing, frame: Frame): number {
  const { minX, minY, maxX, maxY } = drawing.bounds
  const w = Math.max(maxX - minX, 1e-6)
  const h = Math.max(maxY - minY, 1e-6)
  return Math.min((frame.w * PT_PER_MM) / w, (frame.h * PT_PER_MM) / h)
}

/** Human scale note for a pt-per-mm factor, e.g. `1:10`. */
export function scaleNote(ptPerMm: number): string {
  const paperPerModel = ptPerMm / PT_PER_MM
  if (!Number.isFinite(paperPerModel) || paperPerModel <= 0) return 'Not to scale'
  const n = 1 / paperPerModel
  const shown = n >= 10 ? Math.round(n).toString() : n.toFixed(1)
  return `approx. 1:${shown} - do not scale`
}

function colorOf(hex: string): Color {
  const c = hexToRgb(hex)
  return rgb(c.r, c.g, c.b)
}

interface Ctx {
  page: PDFPage
  fonts: PdfFonts
  units: UnitSystem
  style: DrawingStyle
  s: number
  ox: number
  oy: number
}

function px(ctx: Ctx, x: Mm): number {
  return ctx.ox + x * ctx.s
}
function py(ctx: Ctx, y: Mm): number {
  return ctx.oy + y * ctx.s
}

function stroke(ls: LayerStyle): { thickness: number; color: Color; dashArray?: number[] } {
  const base = { thickness: ls.strokeWidth * PRINT_WEIGHT, color: colorOf(ls.color) }
  return ls.dash ? { ...base, dashArray: ls.dash.map((d) => d * PRINT_DASH) } : base
}

function seg(ctx: Ctx, sg: Segment, ls: LayerStyle): void {
  ctx.page.drawLine({ start: { x: px(ctx, sg.x1), y: py(ctx, sg.y1) }, end: { x: px(ctx, sg.x2), y: py(ctx, sg.y2) }, ...stroke(ls) })
}

function label(ctx: Ctx, x: Mm, y: Mm, value: string, sizeMm: Mm, anchor: string, angleDeg: number, color: string): void {
  const textValue = toWinAnsi(value)
  const size = Math.max(sizeMm * ctx.s, MIN_TEXT_PT)
  const width = ctx.fonts.regular.widthOfTextAtSize(textValue, size)
  const shift = anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0
  const rad = (angleDeg * Math.PI) / 180
  ctx.page.drawText(textValue, {
    x: px(ctx, x) - Math.cos(rad) * shift,
    y: py(ctx, y) - Math.sin(rad) * shift,
    size,
    font: ctx.fonts.regular,
    color: colorOf(color),
    rotate: degrees(angleDeg),
  })
}

function drawShape(ctx: Ctx, sh: Shape): void {
  if (sh.type === 'dim') {
    const g = dimensionGeometry(sh, ctx.style, ctx.units)
    if (!g) return
    ;[...g.extensions, g.line, ...g.arrows].forEach((sg) => seg(ctx, sg, LAYER_STYLES.dim))
    label(ctx, g.label.x, g.label.y, g.label.text, ctx.style.textSize, 'middle', g.label.angleDeg, LAYER_STYLES.dim.color)
    return
  }
  const ls: LayerStyle = Object.hasOwn(LAYER_STYLES, sh.layer) ? LAYER_STYLES[sh.layer] : LAYER_STYLES.outline
  switch (sh.type) {
    case 'line':
      seg(ctx, sh, ls)
      return
    case 'rect': {
      const fill = safeFill(sh.fill)
      const st = stroke(ls)
      ctx.page.drawRectangle({
        x: px(ctx, sh.x),
        y: py(ctx, sh.y),
        width: sh.w * ctx.s,
        height: sh.h * ctx.s,
        borderColor: st.color,
        borderWidth: st.thickness,
        ...(st.dashArray ? { borderDashArray: st.dashArray } : {}),
        ...(fill ? { color: colorOf(fill) } : {}),
      })
      return
    }
    case 'circle': {
      const st = stroke(ls)
      ctx.page.drawCircle({
        x: px(ctx, sh.cx),
        y: py(ctx, sh.cy),
        size: Math.abs(sh.r) * ctx.s,
        borderColor: st.color,
        borderWidth: st.thickness,
        ...(st.dashArray ? { borderDashArray: st.dashArray } : {}),
      })
      return
    }
    case 'polyline': {
      const pts = sh.closed && sh.points.length > 2 ? [...sh.points, sh.points[0]] : sh.points
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        if (a && b) seg(ctx, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, ls)
      }
      return
    }
    case 'text':
      label(ctx, sh.x, sh.y, sh.text, sh.size, sh.anchor, 0, ls.color)
      return
  }
}

const finite = (v: number): boolean => Number.isFinite(v)

function isDrawable(sh: Shape): boolean {
  switch (sh.type) {
    case 'line':
    case 'dim':
      return [sh.x1, sh.y1, sh.x2, sh.y2].every(finite)
    case 'rect':
      return [sh.x, sh.y, sh.w, sh.h].every(finite)
    case 'circle':
      return [sh.cx, sh.cy, sh.r].every(finite)
    case 'polyline':
      return sh.points.every((p) => finite(p.x) && finite(p.y))
    case 'text':
      return [sh.x, sh.y, sh.size].every(finite)
  }
}

/** Draw `drawing` centred in `frame` (mm) at `ptPerMm`. */
export function drawDrawing(page: PDFPage, drawing: Drawing, frame: Frame, ptPerMm: number, fonts: PdfFonts, units: UnitSystem): void {
  const { minX, minY, maxX, maxY } = drawing.bounds
  if (!Number.isFinite(ptPerMm) || ptPerMm <= 0 || ![minX, minY, maxX, maxY].every(Number.isFinite)) return
  const w = (maxX - minX) * ptPerMm
  const h = (maxY - minY) * ptPerMm
  const fx = frame.x * PT_PER_MM
  const fy = frame.y * PT_PER_MM
  const ox = fx + (frame.w * PT_PER_MM - w) / 2 - minX * ptPerMm
  const oy = fy + (frame.h * PT_PER_MM - h) / 2 - minY * ptPerMm
  const ctx: Ctx = { page, fonts, units, style: styleForDrawing(drawing), s: ptPerMm, ox, oy }
  drawing.shapes.filter(isDrawable).forEach((sh) => drawShape(ctx, sh))
}
