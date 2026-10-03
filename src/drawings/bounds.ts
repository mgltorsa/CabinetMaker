/**
 * Model-space extents of a shape list, and the two-pass `makeDrawing` that
 * sizes text/dimension spacing from the final drawing extents.
 */
import type { Drawing, Mm, Shape, UnitSystem } from '@/core/types'
import { dimensionGeometry } from './dimension'
import { extentOf, styleForExtent, type DrawingStyle } from './style'
import { estimateTextWidth } from './text-metrics'

export { estimateTextWidth }

export type Bounds = Drawing['bounds']

interface Acc {
  minX: Mm
  minY: Mm
  maxX: Mm
  maxY: Mm
}

function add(acc: Acc, x: Mm, y: Mm): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  acc.minX = Math.min(acc.minX, x)
  acc.minY = Math.min(acc.minY, y)
  acc.maxX = Math.max(acc.maxX, x)
  acc.maxY = Math.max(acc.maxY, y)
}

function addText(acc: Acc, x: Mm, y: Mm, width: Mm, size: Mm, anchor: 'start' | 'middle' | 'end'): void {
  const left = anchor === 'start' ? x : anchor === 'middle' ? x - width / 2 : x - width
  add(acc, left, y - size * 0.25)
  add(acc, left + width, y + size)
}

function addShape(acc: Acc, s: Shape, style: DrawingStyle, units: UnitSystem): void {
  switch (s.type) {
    case 'line':
      add(acc, s.x1, s.y1)
      add(acc, s.x2, s.y2)
      return
    case 'rect':
      add(acc, s.x, s.y)
      add(acc, s.x + s.w, s.y + s.h)
      return
    case 'circle':
      add(acc, s.cx - s.r, s.cy - s.r)
      add(acc, s.cx + s.r, s.cy + s.r)
      return
    case 'polyline':
      s.points.forEach((p) => add(acc, p.x, p.y))
      return
    case 'text':
      addText(acc, s.x, s.y, estimateTextWidth(s.text, s.size), s.size, s.anchor)
      return
    case 'dim': {
      const g = dimensionGeometry(s, style, units)
      if (!g) return
      ;[...g.extensions, g.line].forEach((seg) => {
        add(acc, seg.x1, seg.y1)
        add(acc, seg.x2, seg.y2)
      })
      const half = estimateTextWidth(g.label.text, style.textSize) / 2 + style.textSize
      add(acc, g.label.x - half, g.label.y - half)
      add(acc, g.label.x + half, g.label.y + half)
      return
    }
  }
}

/** Bounds of all shapes; a unit box at the origin when nothing is drawable. */
export function computeBounds(shapes: readonly Shape[], style: DrawingStyle, units: UnitSystem): Bounds {
  const acc: Acc = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  shapes.forEach((s) => addShape(acc, s, style, units))
  if (!Number.isFinite(acc.minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  return {
    minX: acc.minX,
    minY: acc.minY,
    maxX: Math.max(acc.maxX, acc.minX + 1e-6),
    maxY: Math.max(acc.maxY, acc.minY + 1e-6),
  }
}

export type ShapeBuilder = (style: DrawingStyle) => Shape[]

/**
 * Build a drawing whose text sizes / dim spacing match what the renderers will
 * derive from its final bounds: lay out once from the content extent, then
 * again from the resulting bounds.
 */
export function makeDrawing(id: string, title: string, contentExtent: Mm, units: UnitSystem, build: ShapeBuilder): Drawing {
  const first = styleForExtent(contentExtent)
  const firstBounds = computeBounds(build(first), first, units)
  const style = styleForExtent(extentOf(firstBounds))
  const shapes = build(style)
  return { id, title, bounds: computeBounds(shapes, style, units), shapes }
}
