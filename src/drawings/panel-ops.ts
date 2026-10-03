/**
 * Panel-space op → drawing shapes. Face A ops are on the 'op' layer; face B
 * and edge ops are 'hidden' (they cannot be cut from face A on a flatbed).
 */
import type { DrawingLayer, Mm, Op, Part, Shape, Vec2 } from '@/core/types'
import { circle, line, obround, polyline, rect, type Range2 } from './shapes'

const EPS: Mm = 1e-6

export function isEdgeFace(face: Op['face']): boolean {
  return face !== 'A' && face !== 'B'
}

function layerFor(op: Op): DrawingLayer {
  return op.face === 'A' ? 'op' : 'hidden'
}

function dadoShape(op: Extract<Op, { kind: 'dado' }>, layer: DrawingLayer): Shape {
  const hw = op.width / 2
  if (Math.abs(op.y1 - op.y2) < EPS) return rect({ x0: op.x1, x1: op.x2, y0: op.y1 - hw, y1: op.y1 + hw }, layer)
  if (Math.abs(op.x1 - op.x2) < EPS) return rect({ x0: op.x1 - hw, x1: op.x1 + hw, y0: op.y1, y1: op.y2 }, layer)
  const len = Math.hypot(op.x2 - op.x1, op.y2 - op.y1)
  const nx = (-(op.y2 - op.y1) / len) * hw
  const ny = ((op.x2 - op.x1) / len) * hw
  const pts: Vec2[] = [
    { x: op.x1 + nx, y: op.y1 + ny },
    { x: op.x2 + nx, y: op.y2 + ny },
    { x: op.x2 - nx, y: op.y2 - ny },
    { x: op.x1 - nx, y: op.y1 - ny },
  ]
  return polyline(pts, true, layer)
}

function faceShapes(op: Op, layer: DrawingLayer): Shape[] {
  switch (op.kind) {
    case 'hole':
      return [circle(op.x, op.y, op.diameter / 2, layer)]
    case 'dado':
      return [dadoShape(op, layer)]
    case 'mortise':
      return [obround(op.x, op.y, op.length, op.width, op.axis, layer)]
  }
}

/** Span along the edge an edge op occupies. */
function edgeSpan(op: Op): [Mm, Mm] {
  switch (op.kind) {
    case 'hole':
      return [op.x - op.diameter / 2, op.x + op.diameter / 2]
    case 'mortise':
      return [op.x - op.length / 2, op.x + op.length / 2]
    case 'dado':
      return [Math.min(op.x1, op.x2), Math.max(op.x1, op.x2)]
  }
}

interface EdgeGeometry {
  r: Range2
  c: [Mm, Mm, Mm, Mm]
}

function edgeGeometry(face: Op['face'], a0: Mm, a1: Mm, depth: Mm, part: Part): EdgeGeometry | null {
  const mid = (a0 + a1) / 2
  const { length: L, width: W } = part
  switch (face) {
    case 'edge-x0':
      return { r: { x0: 0, x1: depth, y0: a0, y1: a1 }, c: [0, mid, depth, mid] }
    case 'edge-x1':
      return { r: { x0: L - depth, x1: L, y0: a0, y1: a1 }, c: [L - depth, mid, L, mid] }
    case 'edge-y0':
      return { r: { x0: a0, x1: a1, y0: 0, y1: depth }, c: [mid, 0, mid, depth] }
    case 'edge-y1':
      return { r: { x0: a0, x1: a1, y0: W - depth, y1: W }, c: [mid, W - depth, mid, W] }
    default:
      return null
  }
}

/**
 * Edge ops: x is the position along the edge; the bore runs `depth` into the
 * panel from that edge. Drawn as a hidden rectangle plus a centreline.
 */
function edgeShapes(op: Op, part: Part): Shape[] {
  const [a0, a1] = edgeSpan(op)
  const g = edgeGeometry(op.face, a0, a1, op.depth, part)
  if (!g) return []
  return [rect(g.r, 'hidden'), line(g.c[0], g.c[1], g.c[2], g.c[3], 'hidden')]
}

export function opShapes(op: Op, part: Part): Shape[] {
  return isEdgeFace(op.face) ? edgeShapes(op, part) : faceShapes(op, layerFor(op))
}
