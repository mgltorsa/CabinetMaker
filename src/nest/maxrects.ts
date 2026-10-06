/**
 * MaxRects bin (Jukka Jylänki, "A Thousand Ways to Pack the Bin", 2010).
 *
 * Keeps the list of maximal free rectangles of one bin. Coordinates are local
 * to the bin (origin 0,0). The free list is private mutable state: packing is
 * a hot loop and the bin never escapes the packer, so copying it per insert
 * would cost a lot for nothing.
 */
import { EPS } from './geometry'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface Size {
  readonly w: number
  readonly h: number
}

/** Placement heuristics: score each candidate free rect, lower is better. */
export type FitHeuristic = 'best-short-side' | 'best-area' | 'bottom-left'

export interface FitScore {
  readonly primary: number
  readonly secondary: number
}

export interface FitCandidate {
  readonly rect: Rect
  readonly score: FitScore
  /** Index into the `sizes` passed to `findPosition` (i.e. which orientation). */
  readonly sizeIndex: number
}

export function compareScores(a: FitScore, b: FitScore): number {
  return a.primary - b.primary || a.secondary - b.secondary
}

function scoreFit(free: Rect, size: Size, heuristic: FitHeuristic): FitScore {
  const leftoverX = free.w - size.w
  const leftoverY = free.h - size.h
  const shortSide = Math.min(leftoverX, leftoverY)
  switch (heuristic) {
    case 'best-short-side':
      return { primary: shortSide, secondary: Math.max(leftoverX, leftoverY) }
    case 'best-area':
      return { primary: free.w * free.h - size.w * size.h, secondary: shortSide }
    case 'bottom-left':
      return { primary: free.y + size.h, secondary: free.x }
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.h <= outer.y + outer.h + EPS
  )
}

/** Free space left in `free` around `used` (up to four maximal pieces). */
function splitFree(free: Rect, used: Rect): Rect[] {
  const pieces: Rect[] = [
    { x: free.x, y: free.y, w: used.x - free.x, h: free.h },
    { x: used.x + used.w, y: free.y, w: free.x + free.w - (used.x + used.w), h: free.h },
    { x: free.x, y: free.y, w: free.w, h: used.y - free.y },
    { x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - (used.y + used.h) },
  ]
  return pieces.filter((r) => r.w > EPS && r.h > EPS)
}

/**
 * Drops new free rects contained in another free rect. Untouched rects were
 * already maximal and cannot sit inside a new piece (pieces are subsets of a
 * rect that was not contained in them), so only new pieces need checking.
 */
function pruneCreated(kept: readonly Rect[], created: readonly Rect[]): Rect[] {
  return created.filter((rect, i) => {
    if (kept.some((other) => contains(other, rect))) return false
    return !created.some((other, j) => j !== i && contains(other, rect) && (j < i || !contains(rect, other)))
  })
}

export class MaxRectsBin {
  private free: Rect[]

  constructor(width: number, height: number) {
    this.free = [{ x: 0, y: 0, w: width, h: height }]
  }

  get freeRects(): readonly Rect[] {
    return this.free
  }

  /** Best position over all free rects and sizes; ties keep the first found. */
  findPosition(sizes: readonly Size[], heuristic: FitHeuristic): FitCandidate | null {
    let best: FitCandidate | null = null
    for (const free of this.free) {
      for (const [sizeIndex, size] of sizes.entries()) {
        if (size.w > free.w + EPS || size.h > free.h + EPS) continue
        const score = scoreFit(free, size, heuristic)
        if (best === null || compareScores(score, best.score) < 0) {
          best = { rect: { x: free.x, y: free.y, w: size.w, h: size.h }, score, sizeIndex }
        }
      }
    }
    return best
  }

  /** Marks `used` as occupied. */
  place(used: Rect): void {
    const kept: Rect[] = []
    const created: Rect[] = []
    for (const free of this.free) {
      if (intersects(free, used)) created.push(...splitFree(free, used))
      else kept.push(free)
    }
    this.free = kept.concat(pruneCreated(kept, created))
  }
}
