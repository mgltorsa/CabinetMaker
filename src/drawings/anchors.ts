/**
 * Where `renderSvg` puts the label of each tagged (editable) dimension or
 * note, so a UI can lay HTML controls over the SVG. Positions use the SVG's
 * own coordinate system (viewBox user units, Y down) and the same geometry
 * code as the renderer, so the two cannot drift apart.
 */
import type { Drawing, DrawingDimId, Mm, UnitSystem } from '@/core/types'
import { dimensionGeometry } from './dimension'
import type { DimShape, TextShape } from './shapes'
import { styleForDrawing, type DrawingStyle } from './style'
import { svgViewBox, type SvgOptions, type ViewBox } from './svg'
import { estimateTextWidth } from './text-metrics'

/** Height of a label's visual middle above its baseline, as a fraction of the font size. */
const MID_HEIGHT = 0.35

export interface LabelAnchor {
  id: DrawingDimId
  /** The label as rendered (before XML escaping). */
  text: string
  /** The `<text>` element's `x` / `y` attributes (viewBox units, Y down). */
  x: number
  y: number
  /** The `<text>` element's clockwise `rotate()` angle in degrees (0 or ±90 for elevations). */
  rotation: number
  fontSize: number
  /**
   * The label's visual box as fractions (0..1) of the viewBox, from its
   * top-left: centre (`cx`, `cy`) and the unrotated text length (`w`, of the
   * width) and line height (`h`, of the height). Rotate by `rotation` about
   * the centre to cover the drawn label.
   */
  box: { cx: number; cy: number; w: number; h: number }
}

interface ModelLabel {
  /** Text position, model space (+Y up). */
  x: Mm
  y: Mm
  /** Counter-clockwise, model space. */
  angleDeg: number
  text: string
  /** Offset of the text's horizontal middle from `x` along the text direction. */
  along: Mm
}

function dimLabel(d: DimShape, style: DrawingStyle, units: UnitSystem): ModelLabel | null {
  const g = dimensionGeometry(d, style, units)
  return g ? { ...g.label, along: 0 } : null
}

function noteLabel(t: TextShape): ModelLabel {
  const width = estimateTextWidth(t.text, t.size)
  const along = t.anchor === 'start' ? width / 2 : t.anchor === 'end' ? -width / 2 : 0
  return { x: t.x, y: t.y, angleDeg: 0, text: t.text, along }
}

function toAnchor(id: DrawingDimId, label: ModelLabel, fontSize: Mm, vb: ViewBox): LabelAnchor {
  const rad = (label.angleDeg * Math.PI) / 180
  // Visual middle: along the text direction to its centre, then up from the baseline.
  const cx = label.x + Math.cos(rad) * label.along - Math.sin(rad) * fontSize * MID_HEIGHT
  const cy = label.y + Math.sin(rad) * label.along + Math.cos(rad) * fontSize * MID_HEIGHT
  const rotation = label.angleDeg === 0 ? 0 : -label.angleDeg
  return {
    id,
    text: label.text,
    x: label.x,
    y: -label.y,
    rotation,
    fontSize,
    box: {
      cx: (cx - vb.x) / vb.w,
      cy: (-cy - vb.y) / vb.h,
      w: estimateTextWidth(label.text, fontSize) / vb.w,
      h: fontSize / vb.h,
    },
  }
}

/** Label anchors of every dimension / note that carries an `id`, in drawing order. */
export function editableAnchors(drawing: Drawing, options: SvgOptions): LabelAnchor[] {
  const vb = svgViewBox(drawing)
  const style = styleForDrawing(drawing)
  return drawing.shapes.flatMap((s): LabelAnchor[] => {
    if (s.type === 'dim' && s.id !== undefined) {
      const label = dimLabel(s, style, options.units)
      return label ? [toAnchor(s.id, label, style.textSize, vb)] : []
    }
    if (s.type === 'text' && s.id !== undefined) return [toAnchor(s.id, noteLabel(s), s.size, vb)]
    return []
  })
}
