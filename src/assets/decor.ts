/** Small decor pieces for counters, shelves and walls. */
import type { Vec3 } from '@/core/types'
import { bookRow } from './room'
import { ball, detail, post, span } from './shapes'
import type { AssetDef, Primitive } from './types'

/** Fruit colours for the bowl (apple, orange, lime). */
const FRUIT = ['#b8322a', '#e48a1f', '#7ea83a'] as const

function vase(s: Vec3): Primitive[] {
  const { y: h } = s
  const m = Math.min(s.x, s.z)
  const r = Math.min(m * 0.45, h * 0.32)
  return [
    ball('body', [0, r, 0], r),
    post('body', 0, 0, r * 1.5, h - r * 1.5, m * 0.14, { radiusTop: m * 0.2 }),
  ]
}

function books(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  // Every third book takes the asset colour; the rest keep their own.
  return bookRow(-w / 2, w, 0, h / 0.9, [-d / 2, d / 2], 1, 3)
}

function pictureFrame(s: Vec3): Primitive[] {
  const { x: w, y: h, z: d } = s
  const f = detail(Math.min(w, h), 0.06, 40)
  const mat = detail(Math.min(w, h), 0.08, 60)
  const zBack = -d / 2
  return [
    span('body', [-w / 2, w / 2], [h - f, h], [zBack, d / 2]),
    span('body', [-w / 2, w / 2], [0, f], [zBack, d / 2]),
    span('body', [-w / 2, -w / 2 + f], [f, h - f], [zBack, d / 2]),
    span('body', [w / 2 - f, w / 2], [f, h - f], [zBack, d / 2]),
    span('paper', [-w / 2 + f, w / 2 - f], [f, h - f], [zBack, zBack + d * 0.4]),
    span('paper', [-w / 2 + f + mat, 0], [f + mat, h - f - mat], [zBack, zBack + d * 0.5], '#2f4a6b'),
    span('paper', [0, w / 2 - f - mat], [f + mat, (h - f - mat + f + mat) / 2], [zBack, zBack + d * 0.5], '#c49a3a'),
    span('paper', [0, w / 2 - f - mat], [(h - f - mat + f + mat) / 2, h - f - mat], [zBack, zBack + d * 0.5], '#b56b4a'),
  ]
}

function bowl(s: Vec3): Primitive[] {
  const { y: h } = s
  const m = Math.min(s.x, s.z)
  const foot = h * 0.08
  const fruitR = Math.min(m * 0.14, h * 0.3)
  return [
    post('body', 0, 0, 0, foot, m * 0.22),
    post('body', 0, 0, foot, h - foot, m * 0.24, { radiusTop: m * 0.5, openEnded: true }),
    post('body', 0, 0, foot, foot, m * 0.24),
    ...FRUIT.map((c, i) => {
      const a = (i / FRUIT.length) * Math.PI * 2
      return ball('ceramic', [Math.cos(a) * m * 0.15, foot * 2 + fruitR, Math.sin(a) * m * 0.15], fruitR, c)
    }),
  ]
}

export const DECOR_ASSETS: readonly AssetDef[] = [
  { id: 'vase', name: 'Vase', category: 'decor', keywords: ['flowers', 'pot', 'ornament'], defaultSize: { x: 160, y: 300, z: 160 }, defaultColor: '#3f6e8c', mount: 'counter', build: vase },
  { id: 'books', name: 'Books', category: 'decor', keywords: ['book', 'shelf', 'library'], defaultSize: { x: 260, y: 230, z: 170 }, defaultColor: '#7d3b2f', mount: 'counter', build: books },
  { id: 'picture-frame', name: 'Picture frame', category: 'decor', keywords: ['art', 'painting', 'poster', 'photo'], defaultSize: { x: 600, y: 450, z: 30 }, defaultColor: '#2d2d30', mount: 'wall', defaultLift: 1350, build: pictureFrame },
  { id: 'bowl', name: 'Fruit bowl', category: 'decor', keywords: ['bowl', 'fruit', 'dish'], defaultSize: { x: 280, y: 120, z: 280 }, defaultColor: '#e9e4dc', mount: 'counter', build: bowl },
]
