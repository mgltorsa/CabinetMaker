/**
 * `Drawing` → standalone SVG string. Model Y is up; SVG Y is down, so every
 * point is written as (x, -y). Text is never mirrored. All text is escaped:
 * part, cabinet and project names are user input.
 */
import type { Drawing, Shape, UnitSystem } from '@/core/types'
import { dimensionGeometry, type Segment } from './dimension'
import type { DimShape } from './shapes'
import { LAYER_STYLES, safeFill, styleForDrawing, type DrawingStyle, type LayerStyle } from './style'

export interface SvgOptions {
  units: UnitSystem
  /** Output width in CSS px; height follows the aspect ratio. */
  widthPx?: number
}

const DEFAULT_WIDTH_PX = 800
/** Whitespace around the drawing bounds as a fraction of the larger extent. */
const MARGIN_FRACTION = 0.04
const FONT_FAMILY = 'Helvetica, Arial, sans-serif'

/** Characters not allowed in XML 1.0 (C0 controls except tab/LF/CR, lone surrogates, U+FFFE/FFFF). */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Escape text for XML element content and attribute values. */
export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Deterministic number formatting (2 decimals, no -0, non-finite → 0). */
export function num(v: number): string {
  if (!Number.isFinite(v)) return '0'
  const r = Math.round(v * 100) / 100
  return String(Object.is(r, -0) ? 0 : r)
}

function strokeAttrs(ls: LayerStyle): string {
  const dash = ls.dash ? ` stroke-dasharray="${ls.dash.join(' ')}"` : ''
  return `stroke="${ls.color}" stroke-width="${ls.strokeWidth}"${dash} vector-effect="non-scaling-stroke"`
}

function segment(s: Segment, attrs: string): string {
  return `<line x1="${num(s.x1)}" y1="${num(-s.y1)}" x2="${num(s.x2)}" y2="${num(-s.y2)}" ${attrs}/>`
}

const ANCHORS: ReadonlySet<string> = new Set(['start', 'middle', 'end'])

function textEl(x: number, y: number, size: number, anchor: string, value: string, color: string, angleDeg = 0): string {
  const safeAnchor = ANCHORS.has(anchor) ? anchor : 'start'
  const rot = angleDeg !== 0 ? ` transform="rotate(${num(-angleDeg)} ${num(x)} ${num(-y)})"` : ''
  return `<text x="${num(x)}" y="${num(-y)}" font-size="${num(size)}" font-family="${FONT_FAMILY}" text-anchor="${safeAnchor}" fill="${color}"${rot}>${escapeXml(value)}</text>`
}

function dimEl(d: DimShape, style: DrawingStyle, units: UnitSystem): string {
  const g = dimensionGeometry(d, style, units)
  if (!g) return ''
  const ls = LAYER_STYLES.dim
  const attrs = strokeAttrs(ls)
  const lines = [...g.extensions, g.line, ...g.arrows].map((s) => segment(s, attrs)).join('')
  const label = textEl(g.label.x, g.label.y, style.textSize, 'middle', g.label.text, ls.color, g.label.angleDeg)
  return `<g class="dim">${lines}${label}</g>`
}

function shapeEl(s: Shape, style: DrawingStyle, units: UnitSystem): string {
  if (s.type === 'dim') return dimEl(s, style, units)
  const ls: LayerStyle = Object.hasOwn(LAYER_STYLES, s.layer) ? LAYER_STYLES[s.layer] : LAYER_STYLES.outline
  switch (s.type) {
    case 'line':
      return segment(s, strokeAttrs(ls))
    case 'rect': {
      const fill = safeFill(s.fill) ?? 'none'
      return `<rect x="${num(s.x)}" y="${num(-(s.y + s.h))}" width="${num(Math.abs(s.w))}" height="${num(Math.abs(s.h))}" fill="${fill}" ${strokeAttrs(ls)}/>`
    }
    case 'circle':
      return `<circle cx="${num(s.cx)}" cy="${num(-s.cy)}" r="${num(Math.abs(s.r))}" fill="none" ${strokeAttrs(ls)}/>`
    case 'polyline': {
      const pts = s.points.map((p) => `${num(p.x)},${num(-p.y)}`).join(' ')
      const tag = s.closed ? 'polygon' : 'polyline'
      return `<${tag} points="${pts}" fill="none" ${strokeAttrs(ls)}/>`
    }
    case 'text':
      return textEl(s.x, s.y, s.size, s.anchor, s.text, ls.color)
  }
}

export function renderSvg(drawing: Drawing, options: SvgOptions): string {
  const { minX, minY, maxX, maxY } = drawing.bounds
  const w = Number.isFinite(maxX - minX) && maxX > minX ? maxX - minX : 1
  const h = Number.isFinite(maxY - minY) && maxY > minY ? maxY - minY : 1
  const margin = Math.max(w, h) * MARGIN_FRACTION
  const vbW = w + margin * 2
  const vbH = h + margin * 2
  const widthPx = options.widthPx !== undefined && options.widthPx > 0 ? options.widthPx : DEFAULT_WIDTH_PX
  const heightPx = (widthPx * vbH) / vbW
  const style = styleForDrawing(drawing)
  const title = escapeXml(drawing.title)
  const body = drawing.shapes.map((s) => shapeEl(s, style, options.units)).join('\n')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(minX - margin)} ${num(-maxY - margin)} ${num(vbW)} ${num(vbH)}" width="${num(widthPx)}" height="${num(heightPx)}" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    `<rect x="${num(minX - margin)}" y="${num(-maxY - margin)}" width="${num(vbW)}" height="${num(vbH)}" fill="#ffffff"/>`,
    body,
    '</svg>',
  ].join('\n')
}
