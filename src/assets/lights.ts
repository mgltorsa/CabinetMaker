/**
 * Light assets: a fixture shape plus a light source. Fixtures never cast
 * shadows (`castsShadow: false`) so they do not trap their own light.
 *
 * Nominal intensities are three.js physical units for a scene in metres
 * (point / spot: candela; rect: nits), tuned by eye against the viewer's
 * evening lighting rather than taken from a datasheet.
 */
import type { Vec3 } from '@/core/types'
import { ball, barZ, detail, post, span } from './shapes'
import type { AssetDef, LightSource, Primitive } from './types'

/** Warm white (≈ 2700–3000 K) as an sRGB tint. */
const WARM = '#ffd9a8'
/** Neutral white (≈ 4000 K) for task lighting. */
const NEUTRAL = '#fff1de'
/** Light range (mm): the falloff window ends here. */
const RANGE = 8000

function pendantParts(s: Vec3): { shadeH: number; bulbY: number; bulbR: number } {
  const m = Math.min(s.x, s.z)
  const shadeH = Math.min(s.y * 0.4, m * 0.7)
  return { shadeH, bulbY: shadeH * 0.45, bulbR: Math.min(m * 0.12, shadeH * 0.25) }
}

function pendant(s: Vec3): Primitive[] {
  const { y: h } = s
  const m = Math.min(s.x, s.z)
  const { shadeH, bulbY, bulbR } = pendantParts(s)
  const canopy = detail(h, 0.03, 25)
  const cap = Math.min(shadeH * 0.06, 6)
  return [
    post('metal', 0, 0, h - canopy, canopy, m * 0.2),
    post('dark', 0, 0, shadeH, h - canopy - shadeH, detail(m, 0.012, 4)),
    post('body', 0, 0, 0, shadeH, m * 0.5, { radiusTop: m * 0.18, openEnded: true }),
    post('body', 0, 0, shadeH - cap, cap, m * 0.18),
    ball('emitter', [0, bulbY, 0], bulbR),
  ]
}

function ceilingLight(s: Vec3): Primitive[] {
  const { y: h } = s
  const m = Math.min(s.x, s.z)
  return [post('metal', 0, 0, h * 0.8, h * 0.2, m * 0.3), post('emitter', 0, 0, 0, h * 0.8, m * 0.42, { radiusTop: m * 0.5 })]
}

function downlight(s: Vec3): Primitive[] {
  const { y: h } = s
  const m = Math.min(s.x, s.z)
  return [post('white', 0, 0, h * 0.4, h * 0.6, m * 0.5), post('emitter', 0, 0, 0, h * 0.4, m * 0.36)]
}

function floorLampParts(s: Vec3): { shadeH: number; bulbY: number; bulbR: number } {
  const m = Math.min(s.x, s.z)
  const shadeH = Math.min(s.y * 0.22, m * 0.8)
  return { shadeH, bulbY: s.y - shadeH * 0.55, bulbR: Math.min(m * 0.1, shadeH * 0.3) }
}

function floorLamp(s: Vec3): Primitive[] {
  const { y: h } = s
  const m = Math.min(s.x, s.z)
  const { shadeH, bulbY, bulbR } = floorLampParts(s)
  const base = detail(h, 0.02, 25)
  const poleTop = h - shadeH * 0.5
  return [
    post('metal', 0, 0, 0, base, m * 0.42),
    post('metal', 0, 0, base, poleTop - base, detail(m, 0.035, 12)),
    post('body', 0, 0, h - shadeH, shadeH, m * 0.5, { radiusTop: m * 0.38, openEnded: true }),
    ball('emitter', [0, bulbY, 0], bulbR),
  ]
}

function sconceParts(s: Vec3): { r: number; zc: number; bulbR: number } {
  const r = Math.min(s.x / 2, s.z * 0.35)
  return { r, zc: s.z / 2 - r, bulbR: Math.min(r * 0.35, s.y * 0.15) }
}

function wallSconce(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const { r, zc, bulbR } = sconceParts(s)
  const plate = detail(d, 0.08, 15)
  return [
    span('metal', [-w * 0.3, w * 0.3], [h * 0.3, h * 0.7], [-d / 2, -d / 2 + plate]),
    barZ('metal', [0, h * 0.5, (-d / 2 + plate + zc) / 2], zc - (-d / 2 + plate), detail(Math.min(w, h), 0.03, 8)),
    post('body', 0, zc, h * 0.08, h * 0.92, r, { openEnded: true }),
    ball('emitter', [0, h * 0.5, zc], bulbR),
  ]
}

function ledStrip(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const end = detail(w, 0.01, 6)
  return [span('metal', [-w / 2, w / 2], [h * 0.35, h], [-d / 2, d / 2]), span('emitter', [-w / 2 + end, w / 2 - end], [0, h * 0.35], [-d * 0.35, d * 0.35])]
}

const point = (position: LightSource['position'], intensity: number, color = WARM): LightSource => ({ kind: 'point', position, intensity, color, distance: RANGE })

export const LIGHT_ASSETS: readonly AssetDef[] = [
  {
    id: 'pendant',
    name: 'Pendant light',
    category: 'lights',
    keywords: ['lamp', 'hanging', 'island light'],
    defaultSize: { x: 360, y: 800, z: 360 },
    defaultColor: '#2f3a35',
    mount: 'ceiling',
    castsShadow: false,
    build: pendant,
    light: (s) => point([0, pendantParts(s).bulbY, 0], 2.2),
  },
  {
    id: 'ceiling-light',
    name: 'Ceiling light',
    category: 'lights',
    keywords: ['flush mount', 'lamp', 'overhead'],
    defaultSize: { x: 420, y: 110, z: 420 },
    defaultColor: '#d9d6cf',
    mount: 'ceiling',
    castsShadow: false,
    build: ceilingLight,
    light: (s) => point([0, s.y * 0.2, 0], 3, NEUTRAL),
  },
  {
    id: 'downlight',
    name: 'Recessed downlight',
    category: 'lights',
    keywords: ['spot', 'can light', 'pot light', 'lamp'],
    defaultSize: { x: 90, y: 20, z: 90 },
    defaultColor: '#f4f2ee',
    mount: 'ceiling',
    castsShadow: false,
    build: downlight,
    light: () => ({ kind: 'spot', position: [0, 0, 0], intensity: 6, color: NEUTRAL, distance: RANGE, angle: 0.62 }),
  },
  {
    id: 'floor-lamp',
    name: 'Floor lamp',
    category: 'lights',
    keywords: ['lamp', 'standard lamp', 'reading'],
    defaultSize: { x: 440, y: 1650, z: 440 },
    defaultColor: '#e9e0cf',
    mount: 'floor',
    castsShadow: false,
    build: floorLamp,
    light: (s) => point([0, floorLampParts(s).bulbY, 0], 1.6),
  },
  {
    id: 'wall-sconce',
    name: 'Wall sconce',
    category: 'lights',
    keywords: ['lamp', 'wall light', 'bracket'],
    defaultSize: { x: 160, y: 280, z: 200 },
    defaultColor: '#e9e0cf',
    mount: 'wall',
    defaultLift: 1650,
    castsShadow: false,
    build: wallSconce,
    light: (s) => {
      const { zc } = sconceParts(s)
      return point([0, s.y * 0.5, zc], 1.2)
    },
  },
  {
    id: 'led-strip',
    name: 'Under-cabinet LED strip',
    category: 'lights',
    keywords: ['led', 'strip', 'task light', 'tape', 'under cabinet', 'lamp'],
    defaultSize: { x: 600, y: 12, z: 24 },
    defaultColor: '#c9ccd0',
    mount: 'under-cabinet',
    castsShadow: false,
    build: ledStrip,
    light: (s) => ({ kind: 'rect', position: [0, 0, 0], intensity: 40, color: NEUTRAL, distance: 0, width: s.x * 0.95, depth: s.z * 0.7 }),
  },
]
