/**
 * Small constructors for the neutral `Shape` model (mm, +Y up). Generators use
 * these instead of object literals so every shape carries an explicit layer.
 */
import type { DrawingLayer, Mm, Shape, Vec2 } from '@/core/types'

export type LineShape = Extract<Shape, { type: 'line' }>
export type RectShape = Extract<Shape, { type: 'rect' }>
export type CircleShape = Extract<Shape, { type: 'circle' }>
export type PolylineShape = Extract<Shape, { type: 'polyline' }>
export type TextShape = Extract<Shape, { type: 'text' }>
export type DimShape = Extract<Shape, { type: 'dim' }>
export type TextAnchor = TextShape['anchor']

/** Axis-aligned range in drawing space. */
export interface Range2 {
  x0: Mm
  x1: Mm
  y0: Mm
  y1: Mm
}

export function line(x1: Mm, y1: Mm, x2: Mm, y2: Mm, layer: DrawingLayer = 'outline'): LineShape {
  return { type: 'line', x1, y1, x2, y2, layer }
}

/** Rectangle from two corners in any order. */
export function rect(r: Range2, layer: DrawingLayer = 'outline', fill?: string): RectShape {
  const x = Math.min(r.x0, r.x1)
  const y = Math.min(r.y0, r.y1)
  const base: RectShape = { type: 'rect', x, y, w: Math.abs(r.x1 - r.x0), h: Math.abs(r.y1 - r.y0), layer }
  return fill === undefined ? base : { ...base, fill }
}

export function circle(cx: Mm, cy: Mm, r: Mm, layer: DrawingLayer = 'outline'): CircleShape {
  return { type: 'circle', cx, cy, r, layer }
}

export function polyline(points: readonly Vec2[], closed: boolean, layer: DrawingLayer = 'outline'): PolylineShape {
  return { type: 'polyline', points: points.map((p) => ({ x: p.x, y: p.y })), closed, layer }
}

export function text(
  x: Mm,
  y: Mm,
  value: string,
  size: Mm,
  anchor: TextAnchor = 'start',
  layer: DrawingLayer = 'text',
): TextShape {
  return { type: 'text', x, y, text: value, size, anchor, layer }
}

/**
 * Dimension between two points. The dimension line sits `offset` mm along the
 * left-hand normal of (p1 → p2): for a left-to-right dim a positive offset is
 * above, for a bottom-to-top dim a positive offset is to the left.
 */
export function dim(x1: Mm, y1: Mm, x2: Mm, y2: Mm, offset: Mm, label?: string): DimShape {
  const base: DimShape = { type: 'dim', x1, y1, x2, y2, offset }
  return label === undefined ? base : { ...base, label }
}

/** Arrow from `from` to `to` (head at `to`) drawn as three lines. */
export function arrow(from: Vec2, to: Vec2, head: Mm, layer: DrawingLayer = 'text'): LineShape[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return []
  const ux = dx / len
  const uy = dy / len
  const bx = to.x - ux * head
  const by = to.y - uy * head
  const w = head * 0.4
  return [
    line(from.x, from.y, to.x, to.y, layer),
    line(to.x, to.y, bx - uy * w, by + ux * w, layer),
    line(to.x, to.y, bx + uy * w, by - ux * w, layer),
  ]
}

/** Closed obround (slot) centred at (cx, cy), long axis horizontal or vertical. */
export function obround(cx: Mm, cy: Mm, length: Mm, width: Mm, axis: 'x' | 'y', layer: DrawingLayer): PolylineShape {
  const r = Math.min(length, width) / 2
  const half = Math.max(length / 2 - r, 0)
  const steps = 8
  const points: Vec2[] = []
  for (let end = 0; end < 2; end++) {
    const sign = end === 0 ? 1 : -1
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / steps + (end === 0 ? 0 : Math.PI)
      const u = sign * half + r * Math.cos(a)
      const v = r * Math.sin(a)
      points.push(axis === 'x' ? { x: cx + u, y: cy + v } : { x: cx + v, y: cy + u })
    }
  }
  return polyline(points, true, layer)
}
