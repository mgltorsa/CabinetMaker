/**
 * Pull meshes for the GLB export as a few axis-aligned boxes per pull (the
 * exporter writes boxes only; fronts are axis-aligned, so pull frames are too).
 * Same shapes as the 3D view (`src/ui/views/PullMesh.tsx`), simplified:
 * bar = rod + two posts, knob = post + head, cup = back + top + hood,
 * edge / J-profile = flange over the grip edge + lip. Custom handles export a
 * bar placeholder (the imported model is not embedded).
 */
import type { ResolvedHandle } from '@/core/handles'
import type { PullPlacement } from '@/core/pull-placement'
import type { Mm, Vec3 } from '@/core/types'

/** A box in cabinet space (mm): centre relative to the pull centre, and full size. */
export interface PullBox {
  offset: Vec3
  size: Vec3
}

/** Bar posts and knob posts as a share of the bar diameter / knob diameter. */
const BAR_POST_SHARE = 0.8
const KNOB_POST_SHARE = 0.4
const KNOB_POST_HEIGHT_SHARE = 0.55
const CUP_HOOD_SHARE = 0.55
/** Thin sheets stay visible. */
const MIN_SHEET: Mm = 1.5

type Range = readonly [Mm, Mm]

/** Box spanning u (along), v (up), w (normal) ranges of the pull frame, as an axis-aligned cabinet-space box. */
function frameBox(p: PullPlacement, u: Range, v: Range, w: Range): PullBox {
  const corner = (a: Mm, b: Mm, c: Mm): Vec3 => ({
    x: p.along.x * a + p.up.x * b + p.normal.x * c,
    y: p.along.y * a + p.up.y * b + p.normal.y * c,
    z: p.along.z * a + p.up.z * b + p.normal.z * c,
  })
  const lo = corner(u[0], v[0], w[0])
  const hi = corner(u[1], v[1], w[1])
  const keys = ['x', 'y', 'z'] as const
  const offset = { x: 0, y: 0, z: 0 }
  const size = { x: 0, y: 0, z: 0 }
  for (const k of keys) {
    offset[k] = (lo[k] + hi[k]) / 2 || 0
    size[k] = Math.abs(hi[k] - lo[k])
  }
  return { offset, size }
}

const sym = (half: Mm): Range => [-half, half]

/** Hole positions along the pull (u), relative to its centre. */
function holeUs(p: PullPlacement): Mm[] {
  return p.holes.map((h) => (h.x - p.centre.x) * p.along.x + (h.y - p.centre.y) * p.along.y + (h.z - p.centre.z) * p.along.z)
}

function barBoxes(p: PullPlacement, h: ResolvedHandle): PullBox[] {
  const r = h.diameter / 2
  const post = r * BAR_POST_SHARE
  const rodBottom = Math.max(h.projection - r, 0)
  return [
    frameBox(p, sym(p.length / 2), sym(r), [rodBottom, h.projection + r]),
    ...(rodBottom > 0 ? holeUs(p).map((u) => frameBox(p, [u - post, u + post], sym(post), [0, rodBottom])) : []),
  ]
}

function knobBoxes(p: PullPlacement, h: ResolvedHandle): PullBox[] {
  const r = h.diameter / 2
  const post = h.projection * KNOB_POST_HEIGHT_SHARE
  return [frameBox(p, sym(r * KNOB_POST_SHARE), sym(r * KNOB_POST_SHARE), [0, post]), frameBox(p, sym(r), sym(r), [post, h.projection])]
}

function cupBoxes(p: PullPlacement, h: ResolvedHandle): PullBox[] {
  const t = Math.max(h.diameter, MIN_SHEET)
  const half = h.width / 2
  const hood = h.width * CUP_HOOD_SHARE
  return [
    frameBox(p, sym(p.length / 2), sym(half), [0, t]),
    frameBox(p, sym(p.length / 2), [half - t, half], [0, h.projection]),
    frameBox(p, sym(p.length / 2), [half - hood, half], [h.projection - t, h.projection]),
  ]
}

function profileBoxes(p: PullPlacement, h: ResolvedHandle, frontThickness: Mm): PullBox[] {
  const t = Math.max(h.diameter, MIN_SHEET)
  const e = p.edgeDistance
  return [
    frameBox(p, sym(p.length / 2), [e, e + t], [-frontThickness, h.projection]),
    frameBox(p, sym(p.length / 2), [e + t - h.width, e + t], [h.projection - t, h.projection]),
  ]
}

/** The boxes of one pull; `offset`s are relative to the placement's centre. */
export function pullBoxes(p: PullPlacement, h: ResolvedHandle, frontThickness: Mm): PullBox[] {
  switch (h.style) {
    case 'knob':
      return knobBoxes(p, h)
    case 'cup':
      return cupBoxes(p, h)
    case 'edge':
    case 'j-profile':
      return profileBoxes(p, h, frontThickness)
    case 'custom':
    case 'bar':
      return barBoxes(p, h)
  }
}
