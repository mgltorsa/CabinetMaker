/**
 * Physical invariants of every preset under every construction option: the
 * numbers a cabinetmaker would check with a tape measure. These guard the
 * whole rules engine against "it builds, but the parts are wrong".
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import { panelToCabinet } from '@/core/panel'
import type { BackConstruction, Cabinet, CabinetBuild, ConstructionStyle, HoleOp, JoineryType, Part, ToeKickType } from '@/core/types'
import { HINGE_COUNT_BY_HEIGHT, HINGE_COUNT_MAX, SYSTEM32_PITCH } from './constants'
import { buildCabinet } from './index'
import { createPreset, PRESETS } from './presets'

const EPS = 0.01
const ctx = { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE }
const STYLES: ConstructionStyle[] = ['frameless-overlay', 'frameless-inset', 'face-frame-overlay', 'face-frame-inset']
const JOINERY: JoineryType[] = ['none', 'dowel', 'domino', 'dado']
const BACKS: BackConstruction[] = ['captured', 'applied']
const KICKS: ToeKickType[] = ['none', 'panel', 'full']

function variant(type: Cabinet['type'], style: ConstructionStyle, joinery: JoineryType, back: BackConstruction, kick: ToeKickType): Cabinet {
  const cab = createPreset(type)
  cab.id = 'cab'
  cab.construction.style = style
  cab.construction.joinery = joinery
  cab.construction.back.construction = back
  // Wall cabinets hang; keep their kick off so the envelope check stays simple.
  cab.construction.toeKick.type = type === 'wall' ? 'none' : kick
  return cab
}

const variants: [string, Cabinet][] = PRESETS.flatMap((p) =>
  STYLES.flatMap((style) =>
    JOINERY.flatMap((j) => BACKS.flatMap((b) => KICKS.map((k): [string, Cabinet] => [`${p.type}/${style}/${j}/${b}/${k}`, variant(p.type, style, j, b, k)]))),
  ),
)

const fronts = (b: CabinetBuild): Part[] => b.parts.filter((p) => p.group === 'front')
const holes = (p: Part, purpose: HoleOp['purpose']): HoleOp[] => p.ops.filter((o): o is HoleOp => o.kind === 'hole' && o.purpose === purpose)
const size = (p: Part, axis: 'x' | 'y' | 'z'): number => p.bounds.max[axis] - p.bounds.min[axis]

function overlapArea(a: Part, b: Part): number {
  const dx = Math.min(a.bounds.max.x, b.bounds.max.x) - Math.max(a.bounds.min.x, b.bounds.min.x)
  const dy = Math.min(a.bounds.max.y, b.bounds.max.y) - Math.max(a.bounds.min.y, b.bounds.min.y)
  return dx > EPS && dy > EPS ? dx * dy : 0
}

describe.each(variants)('physical invariants: %s', (_name, cabinet) => {
  const build = buildCabinet(cabinet, ctx)
  const errors = build.warnings.filter((w) => w.level === 'error')

  it('builds without errors', () => {
    expect(errors).toEqual([])
  })

  it('cuts every part from its material thickness, and bounds agree with the cut size', () => {
    for (const p of build.parts) {
      const m = DEFAULT_MATERIALS.find((x) => x.id === p.materialId)
      expect(m, p.id).toBeDefined()
      expect(p.thickness, p.id).toBeCloseTo(m!.thickness, 6)
      expect(size(p, p.axes.thickness), p.id).toBeCloseTo(p.thickness, 6)
      expect(size(p, p.axes.length), p.id).toBeCloseTo(p.length, 6)
      expect(size(p, p.axes.width), p.id).toBeCloseTo(p.width, 6)
    }
  })

  it('keeps the carcass inside the W × H envelope and the declared depth', () => {
    const y0 = cabinet.floorHeight
    const isFaceFrame = cabinet.construction.style.startsWith('face-frame')
    const faceFrameThickness = isFaceFrame ? (DEFAULT_MATERIALS.find((m) => m.id === cabinet.construction.faceFrameMaterialId)?.thickness ?? 0) : 0
    for (const p of build.parts) {
      if (p.group === 'top') continue // countertops may overhang by design
      expect(p.bounds.min.x, p.id).toBeGreaterThanOrEqual(-EPS)
      expect(p.bounds.max.x, p.id).toBeLessThanOrEqual(cabinet.width + EPS)
      expect(p.bounds.min.y, p.id).toBeGreaterThanOrEqual(y0 - EPS)
      expect(p.bounds.max.y, p.id).toBeLessThanOrEqual(y0 + cabinet.height + EPS)
      expect(p.bounds.min.z, p.id).toBeGreaterThanOrEqual(-EPS)
      if (p.group === 'carcass' || p.group === 'shelf' || p.group === 'divider' || p.group === 'back' || p.group === 'stretcher') {
        expect(p.bounds.max.z, p.id).toBeLessThanOrEqual(cabinet.depth + EPS)
      }
      if (p.group === 'drawer-box') {
        // Face-frame drawer boxes run through the frame opening up to its front face.
        expect(p.bounds.max.z, p.id).toBeLessThanOrEqual(cabinet.depth + faceFrameThickness + EPS)
      }
    }
  })

  it('never overlaps two fronts, and keeps at least the "between" reveal', () => {
    const fs = fronts(build)
    const gap = cabinet.construction.reveal.between
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i]!
        const b = fs[j]!
        expect(overlapArea(a, b), `${a.role} × ${b.role}`).toBe(0)
        const dx = Math.max(b.bounds.min.x - a.bounds.max.x, a.bounds.min.x - b.bounds.max.x)
        const dy = Math.max(b.bounds.min.y - a.bounds.max.y, a.bounds.min.y - b.bounds.max.y)
        expect(Math.max(dx, dy), `gap ${a.role} / ${b.role}`).toBeGreaterThanOrEqual(gap - EPS)
      }
    }
  })

  it('fits each door with the right number of hinges, cups lined up with their plates', () => {
    const doors = fronts(build).filter((p) => holes(p, 'hinge-cup').length > 0)
    const plateYs = build.parts.flatMap((p) => holes(p, 'hinge-plate').map((h) => panelToCabinet(p, h.x, h.y, 0).y))
    for (const door of doors) {
      const cups = holes(door, 'hinge-cup')
      const h = size(door, 'y')
      const expected = HINGE_COUNT_BY_HEIGHT.find((r) => h <= r.maxHeight)?.count ?? HINGE_COUNT_MAX
      expect(cups, door.role).toHaveLength(expected)
      const c = cabinet.construction.hinge
      for (const cup of cups) {
        const at = panelToCabinet(door, cup.x, cup.y, 0)
        const fromEdge = Math.min(at.x - door.bounds.min.x, door.bounds.max.x - at.x)
        expect(fromEdge, `${door.role} cup edge distance`).toBeCloseTo(c.cupEdgeDistance + c.cupDiameter / 2, 3)
        expect(cup.diameter).toBeCloseTo(c.cupDiameter, 6)
        expect(cup.depth).toBeLessThan(door.thickness)
        // Frameless plates: a plate hole pair centred on every cup height (±16 mm = half the 32 mm pitch).
        if (!cabinet.construction.style.startsWith('face-frame')) {
          expect(plateYs.some((y) => Math.abs(y - at.y) <= 16 + EPS), `${door.role} plate for cup at y=${at.y}`).toBe(true)
        }
      }
    }
  })

  it('drills shelf pins on a 32 mm pitch, mirrored on facing panels', () => {
    const byPanel = build.parts
      .map((p) => ({ p, ys: holes(p, 'shelf-pin').map((h) => Math.round(panelToCabinet(p, h.x, h.y, 0).y * 100) / 100) }))
      .filter((x) => x.ys.length > 0)
    for (const { p, ys } of byPanel) {
      const unique = [...new Set(ys)].sort((a, b) => a - b)
      for (let i = 1; i < unique.length; i++) {
        const step = unique[i]! - unique[i - 1]!
        expect(Math.abs(step / cabinet.construction.shelfPins.spacing - Math.round(step / cabinet.construction.shelfPins.spacing)), `${p.role} pitch`).toBeLessThan(0.01)
      }
    }
    const left = byPanel.find((x) => x.p.role === 'side-left')
    const right = byPanel.find((x) => x.p.role === 'side-right')
    if (left && right && cabinet.sections.length === 1) {
      expect(new Set(left.ys)).toEqual(new Set(right.ys))
    }
    expect(cabinet.construction.shelfPins.spacing).toBe(SYSTEM32_PITCH)
  })

  it('makes every drawer box exactly as deep as its slide and lower than its front', () => {
    const boxes = new Map<string, Part[]>()
    for (const p of build.parts.filter((x) => x.group === 'drawer-box')) {
      const key = p.role.replace(/-(side-left|side-right|front|back|bottom)$/, '')
      boxes.set(key, [...(boxes.get(key) ?? []), p])
    }
    const slideUsage = build.hardware.find((h) => DEFAULT_HARDWARE.find((x) => x.id === h.hardwareId)?.kind === 'slide')
    const slide = DEFAULT_HARDWARE.find((x) => x.id === slideUsage?.hardwareId)
    for (const [key, parts] of boxes) {
      const sides = parts.filter((p) => p.role.endsWith('side-left') || p.role.endsWith('side-right'))
      expect(sides, key).toHaveLength(2)
      if (slide?.props.length !== undefined && cabinet.construction.drawer.slideMount === 'undermount') {
        // Undermount boxes are as long as the slide (nominal length).
        expect(sides[0]!.length, `${key} side length`).toBeCloseTo(slide.props.length, 1)
      }
      const front = fronts(build).find((f) => f.role === `drawer-front-${key.replace(/^drawer-/, '')}`)
      if (front) {
        const boxTop = Math.max(...parts.map((p) => p.bounds.max.y))
        expect(boxTop, `${key} below its front top`).toBeLessThanOrEqual(front.bounds.max.y + EPS)
      }
    }
  })
})

describe('width changes propagate exactly', () => {
  it.each(PRESETS.map((p) => p.type))('%s: +100 mm wider moves width-bound parts by 100 mm (split across columns and doors)', (type) => {
    const a = createPreset(type)
    a.id = 'cab'
    const b = { ...a, width: a.width + 100 }
    const pa = new Map(buildCabinet(a, ctx).parts.map((p) => [p.role, p]))
    const pb = new Map(buildCabinet(b, ctx).parts.map((p) => [p.role, p]))
    // Same parts, except structural members spaced by length (kick sleepers) may be added.
    const core = (m: Map<string, Part>): string[] => [...m.keys()].filter((r) => !r.startsWith('kick-sleeper')).sort()
    expect(core(pb)).toEqual(core(pa))
    const right = pb.get('side-right')
    if (right) expect(right.bounds.max.x - pa.get('side-right')!.bounds.max.x).toBeCloseTo(100, 6)
    // Total front width grows by exactly 100 mm (shared by however many fronts sit side by side).
    const rowWidth = (m: Map<string, Part>): number => {
      const fs = [...m.values()].filter((p) => p.group === 'front')
      const lowest = Math.min(...fs.map((p) => p.bounds.min.y))
      return fs.filter((p) => Math.abs(p.bounds.min.y - lowest) < EPS).reduce((n, p) => n + size(p, 'x'), 0)
    }
    if ([...pa.values()].some((p) => p.group === 'front')) expect(rowWidth(pb) - rowWidth(pa)).toBeCloseTo(100, 6)
  })
})
