/**
 * Room furniture and fixtures: seating, beds, tables, doors, windows, storage,
 * plants and screens. Sizes are typical retail sizes (mm).
 */
import type { Vec3 } from '@/core/types'
import { ball, barX, barZ, detail, post, span } from './shapes'
import type { AssetDef, Primitive } from './types'

const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const

function sofa(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const legH = detail(h, 0.08, 80)
  const seatY = h * 0.45
  const backD = d * 0.22
  const armW = detail(w, 0.09, 180)
  const legR = detail(Math.min(w, d), 0.025, 22)
  const prims: Primitive[] = [
    span('body', [-w / 2, w / 2], [legH, seatY], [-d / 2, d / 2]),
    span('body', [-w / 2, w / 2], [seatY, h], [-d / 2, -d / 2 + backD]),
    span('body', [-w / 2, -w / 2 + armW], [seatY, h * 0.72], [-d / 2 + backD, d / 2]),
    span('body', [w / 2 - armW, w / 2], [seatY, h * 0.72], [-d / 2 + backD, d / 2]),
  ]
  const inner = w - 2 * armW
  const count = Math.min(4, Math.max(1, Math.round(inner / 700)))
  const pitch = inner / count
  const gap = detail(pitch, 0.02, 12)
  for (let i = 0; i < count; i++) {
    const x0 = -w / 2 + armW + pitch * i + gap / 2
    const x1 = x0 + pitch - gap
    prims.push(span('body', [x0, x1], [seatY, seatY + h * 0.12], [-d / 2 + backD, d / 2 - gap]))
    prims.push(span('body', [x0, x1], [seatY + h * 0.12, h * 0.92], [-d / 2 + backD, -d / 2 + backD + d * 0.14]))
  }
  for (const [cx, cz] of CORNERS) prims.push(post('wood', cx * (w / 2 - legR * 2), cz * (d / 2 - legR * 2), 0, legH, legR))
  return prims
}

function bed(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const legH = detail(h, 0.08, 80)
  const hb = detail(d, 0.04, 80)
  const frameTop = h * 0.3
  const inset = detail(Math.min(w, d), 0.02, 30)
  const mattressTop = h * 0.52
  const legR = detail(Math.min(w, d), 0.02, 25)
  const z0 = -d / 2 + hb
  const pillowD = (d - hb) * 0.16
  const prims: Primitive[] = [
    span('body', [-w / 2, w / 2], [0, h], [-d / 2, z0]),
    span('body', [-w / 2, w / 2], [legH, frameTop], [z0, d / 2]),
    span('white', [-w / 2 + inset, w / 2 - inset], [frameTop, mattressTop], [z0, d / 2 - inset]),
    span('soft', [-w / 2 + inset / 2, w / 2 - inset / 2], [frameTop + (mattressTop - frameTop) * 0.4, mattressTop + h * 0.03], [z0 + (d - hb) * 0.28, d / 2 - inset / 2]),
  ]
  const pillowW = (w - 2 * inset) / 2
  for (const side of [-1, 1]) {
    const cx = side * pillowW / 2
    prims.push(span('white', [cx - pillowW * 0.42, cx + pillowW * 0.42], [mattressTop, mattressTop + h * 0.1], [z0 + inset, z0 + inset + pillowD]))
  }
  for (const [cx, cz] of CORNERS) prims.push(post('wood', cx * (w / 2 - legR * 2), cz > 0 ? d / 2 - legR * 2 : z0 + legR * 2, 0, legH, legR))
  return prims
}

function diningTable(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const topT = detail(h, 0.05, 40)
  const leg = detail(Math.min(w, d), 0.06, 70)
  const inset = detail(Math.min(w, d), 0.05, 60)
  const apron = detail(h, 0.12, 90)
  const prims: Primitive[] = [
    span('body', [-w / 2, w / 2], [h - topT, h], [-d / 2, d / 2]),
    span('body', [-w / 2 + inset, w / 2 - inset], [h - topT - apron, h - topT], [-d / 2 + inset, d / 2 - inset]),
  ]
  for (const [cx, cz] of CORNERS) {
    const x = cx * (w / 2 - inset)
    const z = cz * (d / 2 - inset)
    prims.push(span('body', [x, x - cx * leg], [0, h - topT], [z, z - cz * leg]))
  }
  return prims
}

function chair(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const seatY = h * 0.5
  const seatT = detail(h, 0.045, 40)
  const leg = detail(Math.min(w, d), 0.07, 35)
  const backT = detail(d, 0.06, 30)
  const prims: Primitive[] = [span('body', [-w / 2, w / 2], [seatY - seatT, seatY], [-d / 2, d / 2])]
  for (const [cx, cz] of CORNERS) {
    const top = cz < 0 ? h : seatY - seatT
    prims.push(span('wood', [cx * w / 2, cx * (w / 2 - leg)], [0, top], [cz * d / 2, cz * (d / 2 - leg)]))
  }
  prims.push(span('body', [-w / 2 + leg, w / 2 - leg], [h * 0.68, h * 0.95], [-d / 2, -d / 2 + backT]))
  return prims
}

function rug(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const border = detail(Math.min(w, d), 0.07, 120)
  return [
    span('body', [-w / 2, w / 2], [0, h * 0.7], [-d / 2, d / 2]),
    span('fabric', [-w / 2 + border, w / 2 - border], [0, h], [-d / 2 + border, d / 2 - border]),
  ]
}

function door(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const casing = detail(w, 0.08, 70)
  const leverZone = d * 0.45
  const leafT = d - leverZone
  const r = Math.min(leverZone / 4, h * 0.006, w * 0.02)
  const hx = w / 2 - casing - detail(w, 0.08, 65)
  const hy = h * 0.48
  const leafFront = -d / 2 + leafT * 0.8
  const leverZ = d / 2 - r
  return [
    span('white', [-w / 2, -w / 2 + casing], [0, h], [-d / 2, -d / 2 + leafT]),
    span('white', [w / 2 - casing, w / 2], [0, h], [-d / 2, -d / 2 + leafT]),
    span('white', [-w / 2 + casing, w / 2 - casing], [h - casing, h], [-d / 2, -d / 2 + leafT]),
    span('body', [-w / 2 + casing, w / 2 - casing], [0, h - casing], [-d / 2, -d / 2 + leafT * 0.8]),
    barZ('metal', [hx, hy, (leafFront + leverZ) / 2], leverZ - leafFront, r),
    barX('metal', [hx - w * 0.05, hy, leverZ], w * 0.1, r),
  ]
}

function windowFrame(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const frame = detail(Math.min(w, h), 0.05, 60)
  const sill = detail(h, 0.04, 40)
  const depth = d * 0.6
  const z0 = -d / 2
  const mull = frame * 0.6
  return [
    span('white', [-w / 2, w / 2], [0, sill], [-d / 2, d / 2]),
    span('white', [-w / 2, -w / 2 + frame], [sill, h], [z0, z0 + depth]),
    span('white', [w / 2 - frame, w / 2], [sill, h], [z0, z0 + depth]),
    span('white', [-w / 2 + frame, w / 2 - frame], [h - frame, h], [z0, z0 + depth]),
    span('white', [-mull / 2, mull / 2], [sill, h - frame], [z0 + depth * 0.2, z0 + depth * 0.8]),
    span('glass', [-w / 2 + frame, w / 2 - frame], [sill, h - frame], [z0 + depth * 0.45, z0 + depth * 0.55]),
  ]
}

/** Book widths cycle through this pattern (fractions of the base book width). */
const BOOK_PATTERN = [1, 0.8, 1.2, 0.9, 1.1, 0.7, 1.3, 1]
const BOOK_HEIGHTS = [0.82, 0.7, 0.9, 0.76, 0.86, 0.72, 0.8, 0.88]
export const BOOK_COLORS = ['#7d3b2f', '#2f4a6b', '#c49a3a', '#476b4d', '#e6dccb', '#5a3d5c', '#a8562f', '#2d2d30']

/**
 * Upright books along x from `x0`, filling up to `fill` of `length`, standing
 * on `y0`. With `bodyEvery`, every n-th book takes the asset colour.
 */
export function bookRow(x0: number, length: number, y0: number, height: number, z: readonly [number, number], fill: number, bodyEvery = 0): Primitive[] {
  const base = Math.max(length / 30, 1e-3)
  const books: Primitive[] = []
  let x = x0
  for (let i = 0; x - x0 < length * fill; i++) {
    const bw = base * BOOK_PATTERN[i % BOOK_PATTERN.length]!
    if (x + bw > x0 + length) break
    const top = y0 + height * BOOK_HEIGHTS[i % BOOK_HEIGHTS.length]!
    const isBody = bodyEvery > 0 && i % bodyEvery === 0
    books.push(isBody ? span('body', [x, x + bw * 0.96], [y0, top], z) : span('paper', [x, x + bw * 0.96], [y0, top], z, BOOK_COLORS[i % BOOK_COLORS.length]))
    x += bw
  }
  return books
}

function bookshelf(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const t = detail(Math.min(w, h, d), 0.06, 18)
  const back = t / 2
  const shelves = Math.max(2, Math.round(h / 380))
  const gap = (h - t) / shelves
  const prims: Primitive[] = [
    span('body', [-w / 2, -w / 2 + t], [0, h], [-d / 2, d / 2]),
    span('body', [w / 2 - t, w / 2], [0, h], [-d / 2, d / 2]),
    span('body', [-w / 2 + t, w / 2 - t], [0, h], [-d / 2, -d / 2 + back]),
  ]
  for (let i = 0; i <= shelves; i++) {
    const y = i * gap
    prims.push(span('body', [-w / 2 + t, w / 2 - t], [y, y + t], [-d / 2 + back, d / 2]))
    if (i < shelves) prims.push(...bookRow(-w / 2 + t + (i % 2) * w * 0.12, w - 2 * t - w * 0.12, y + t, gap - t, [-d / 2 + back, d / 2 - d * 0.2], 0.6))
  }
  return prims
}

function plant(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const m = Math.min(w, d)
  const potH = h * 0.3
  const r = Math.min(m * 0.28, h * 0.17)
  return [
    post('ceramic', 0, 0, 0, potH, m * 0.27, { radiusTop: m * 0.35 }),
    post('soil', 0, 0, potH, Math.min(h * 0.02, 10), m * 0.32),
    post('wood', 0, 0, potH, h - potH - r, m * 0.025),
    ball('body', [0, h - r, 0], r),
    ball('body', [-m * 0.2, h - r * 2.2, m * 0.08], r * 0.95),
    ball('body', [m * 0.2, h - r * 2.4, -m * 0.06], r * 0.9),
    ball('body', [m * 0.02, h - r * 3.1, m * 0.15], r * 0.85),
  ]
}

function tv(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const bezel = detail(Math.min(w, h), 0.015, 12)
  const screenT = d * 0.15
  return [
    span('body', [-w / 2, w / 2], [0, h], [-d / 2 + d * 0.4, d / 2 - screenT]),
    span('body', [-w * 0.3, w * 0.3], [h * 0.2, h * 0.8], [-d / 2, -d / 2 + d * 0.4]),
    span('screen', [-w / 2 + bezel, w / 2 - bezel], [bezel, h - bezel], [d / 2 - screenT, d / 2]),
  ]
}

export const ROOM_ASSETS: readonly AssetDef[] = [
  { id: 'sofa', name: 'Sofa', category: 'room', keywords: ['couch', 'settee', 'seating', 'living'], defaultSize: { x: 2100, y: 850, z: 920 }, defaultColor: '#6f7f8f', mount: 'floor', build: sofa },
  { id: 'bed', name: 'Bed', category: 'room', keywords: ['bedroom', 'double', 'queen', 'mattress'], defaultSize: { x: 1640, y: 1050, z: 2150 }, defaultColor: '#8a6a4f', mount: 'floor-wall', build: bed },
  { id: 'dining-table', name: 'Dining table', category: 'room', keywords: ['table', 'kitchen table', 'desk'], defaultSize: { x: 1600, y: 750, z: 900 }, defaultColor: '#a0703f', mount: 'floor', build: diningTable },
  { id: 'chair', name: 'Chair', category: 'room', keywords: ['dining chair', 'seat'], defaultSize: { x: 450, y: 900, z: 520 }, defaultColor: '#a0703f', mount: 'floor', build: chair },
  { id: 'rug', name: 'Rug', category: 'room', keywords: ['carpet', 'mat'], defaultSize: { x: 2000, y: 12, z: 1400 }, defaultColor: '#b56b4a', mount: 'floor', castsShadow: false, build: rug },
  { id: 'door', name: 'Door', category: 'room', keywords: ['entry', 'interior door'], defaultSize: { x: 900, y: 2100, z: 60 }, defaultColor: '#c9b28f', mount: 'wall', defaultLift: 0, build: door },
  { id: 'window', name: 'Window', category: 'room', keywords: ['glazing', 'casement'], defaultSize: { x: 1200, y: 1200, z: 120 }, defaultColor: '#f4f2ee', mount: 'wall', defaultLift: 900, build: windowFrame },
  { id: 'bookshelf', name: 'Bookshelf', category: 'room', keywords: ['bookcase', 'shelves', 'storage'], defaultSize: { x: 900, y: 1800, z: 320 }, defaultColor: '#efe9df', mount: 'floor-wall', build: bookshelf },
  { id: 'plant', name: 'Plant', category: 'room', keywords: ['pot', 'tree', 'green'], defaultSize: { x: 480, y: 1200, z: 480 }, defaultColor: '#4f7d3a', mount: 'floor', build: plant },
  { id: 'tv', name: 'TV', category: 'room', keywords: ['television', 'screen', 'monitor'], defaultSize: { x: 1230, y: 710, z: 60 }, defaultColor: '#1d1d20', mount: 'wall', defaultLift: 1000, build: tv },
]
