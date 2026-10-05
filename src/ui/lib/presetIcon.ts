/**
 * Line icons for the preset picker, drawn from each preset's real engine
 * output (outline, fronts, shelves, rods, pull marks) so the icon always matches
 * what the preset builds.
 */
import { DEFAULT_HARDWARE, DEFAULT_MATERIALS } from '@/core/defaults'
import type { CabinetType, Part } from '@/core/types'
import { buildCabinet } from '@/engine'
import { createPreset } from '@/engine/presets'

export interface IconRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PresetIcon {
  /** viewBox width/height (the icon is drawn in a unit box, aspect preserved). */
  width: number
  height: number
  outline: IconRect
  fronts: IconRect[]
  /** Horizontal lines (shelves seen through open bays). */
  lines: { x1: number; x2: number; y: number }[]
  /** Short pull marks. */
  pulls: { x1: number; y1: number; x2: number; y2: number }[]
  /** Hanging rods, drawn even behind doors (they say what the preset is for). */
  rods: { x1: number; x2: number; y: number }[]
}

const SIZE = 40

export function presetIcon(type: CabinetType): PresetIcon {
  const cabinet = createPreset(type)
  const build = buildCabinet(cabinet, { materials: DEFAULT_MATERIALS, hardware: DEFAULT_HARDWARE })
  const s = SIZE / Math.max(cabinet.width, cabinet.height)
  const width = cabinet.width * s
  const height = cabinet.height * s
  // Wall cabinets are built at their hanging height; draw from the cabinet's own bottom.
  const baseY = Math.min(...build.parts.map((p) => p.bounds.min.y), cabinet.floorHeight)
  // Drawing Y is down; cabinet Y is up.
  const rect = (p: Part): IconRect => ({
    x: p.bounds.min.x * s,
    y: height - (p.bounds.max.y - baseY) * s,
    w: (p.bounds.max.x - p.bounds.min.x) * s,
    h: (p.bounds.max.y - p.bounds.min.y) * s,
  })
  const fronts = build.parts.filter((p) => p.group === 'front')
  const frontBoxes = fronts.map(rect)
  const coveredByFront = (y: number, x1: number, x2: number): boolean =>
    frontBoxes.some((f) => y >= f.y && y <= f.y + f.h && x1 < f.x + f.w && x2 > f.x)
  const lines = build.parts
    .filter((p) => p.group === 'shelf')
    .map(rect)
    .map((r) => ({ x1: r.x, x2: r.x + r.w, y: r.y + r.h / 2 }))
    .filter((l) => !coveredByFront(l.y, l.x1, l.x2))
  const pulls = fronts.map((p) => {
    const r = rect(p)
    const isDrawer = p.role.includes('drawer')
    if (isDrawer) return { x1: r.x + r.w * 0.38, y1: r.y + r.h * 0.5, x2: r.x + r.w * 0.62, y2: r.y + r.h * 0.5 }
    const nearRight = r.x + r.w / 2 < width / 2 || p.role.endsWith('-1')
    const x = nearRight ? r.x + r.w - 2 : r.x + 2
    return { x1: x, y1: r.y + r.h * 0.42, x2: x, y2: r.y + r.h * 0.58 }
  })
  const rods = build.parts
    .filter((p) => p.group === 'rod')
    .map(rect)
    .map((r) => ({ x1: r.x, x2: r.x + r.w, y: r.y + r.h / 2 }))
  return { width, height, outline: { x: 0, y: 0, w: width, h: height }, fronts: frontBoxes, lines, pulls, rods }
}
