/**
 * Part profiles: one outside cut per placed part, tool centre offset by the
 * tool radius around the footprint.
 *
 * Direction: **clockwise seen from above** (+X right, +Y up). With an M3
 * (clockwise) spindle the part edge is then on the right of the tool's travel,
 * which is climb milling on the part.
 *
 * Depth: tabs on ⇒ `thickness + throughCutExtra`, and every pass that goes
 * below the tab top rises to `-(thickness - tabs.thickness)` across each tab
 * window; tabs off ⇒ `thickness - onionSkin`.
 */
import type { BuildWarning, Mm, Vec3 } from '@/core/types'
import { MIN_TABS_PER_PART } from './constants'
import { partWarning, sheetToolpath, type PartContext } from './context'
import { formatForMessage as f } from './format'
import { depthLevels } from './geometry'
import type { PlannedToolpath } from './types'

export interface ProfilePlan {
  toolpath: PlannedToolpath | null
  warnings: BuildWarning[]
}

interface Side {
  from: { x: Mm; y: Mm }
  to: { x: Mm; y: Mm }
  /** Length of the part edge this side runs along. */
  edgeLength: Mm
}

/** Tool-centre windows [t0, t1] (distance from the side start) where the cut rises over a tab. */
type Window = readonly [Mm, Mm]

interface TabPlan {
  /** Machine Z of the tab top, or null for an onion-skin profile. */
  tabZ: Mm | null
  totalDepth: Mm
  warnings: BuildWarning[]
}

function tabPlan(ctx: PartContext): TabPlan {
  const { tabs, throughCutExtra, onionSkin } = ctx.machine
  const t = ctx.stockThickness
  const onion = { tabZ: null, totalDepth: t - onionSkin }
  if (!tabs.enabled) return { ...onion, warnings: [] }
  const valid = tabs.thickness > 0 && tabs.thickness < t && tabs.width > 0 && tabs.spacing > 0
  if (!valid) {
    const message = `Tab settings (thickness ${f(tabs.thickness)}, width ${f(tabs.width)}, spacing ${f(tabs.spacing)}) do not fit ${f(t)} mm stock; using a ${f(onionSkin)} mm onion skin instead`
    return { ...onion, warnings: [partWarning(ctx, 'error', 'cam/tabs-invalid', message)] }
  }
  return { tabZ: -(t - tabs.thickness), totalDepth: t + Math.max(0, throughCutExtra), warnings: [] }
}

/** Clockwise tool-centre rectangle in panel space, starting at the (−r, −r) corner. */
function profileSides(length: Mm, width: Mm, r: Mm): Side[] {
  const a = { x: -r, y: -r }
  const b = { x: -r, y: width + r }
  const c = { x: length + r, y: width + r }
  const d = { x: length + r, y: -r }
  return [
    { from: a, to: b, edgeLength: width },
    { from: b, to: c, edgeLength: length },
    { from: c, to: d, edgeLength: width },
    { from: d, to: a, edgeLength: length },
  ]
}

/** Evenly spaced tab windows on one side; none when even one does not fit. */
function sideWindows(edgeLength: Mm, r: Mm, ctx: PartContext): Window[] {
  const { spacing, width } = ctx.machine.tabs
  const windowLength = width + 2 * r
  const wanted = Math.max(1, Math.round(edgeLength / spacing))
  const count = Math.min(wanted, Math.floor(edgeLength / windowLength))
  return Array.from({ length: count }, (_, i) => {
    const centre = r + (edgeLength * (i + 0.5)) / count
    return [centre - windowLength / 2, centre + windowLength / 2] as const
  })
}

function along(side: Side, t: Mm): { x: Mm; y: Mm } {
  const len = Math.hypot(side.to.x - side.from.x, side.to.y - side.from.y)
  const k = t / len
  return { x: side.from.x + (side.to.x - side.from.x) * k, y: side.from.y + (side.to.y - side.from.y) * k }
}

function sidePoints(side: Side, windows: readonly Window[], z: Mm, tabZ: Mm | null): Vec3[] {
  const raised = tabZ !== null && z < tabZ ? windows : []
  const tabPoints = raised.flatMap(([t0, t1]) => {
    const p0 = along(side, t0)
    const p1 = along(side, t1)
    const top = tabZ ?? z
    return [
      { ...p0, z },
      { ...p0, z: top },
      { ...p1, z: top },
      { ...p1, z },
    ]
  })
  return [{ ...side.from, z }, ...tabPoints, { ...side.to, z }]
}

export function planProfile(ctx: PartContext): ProfilePlan {
  const tool = ctx.tools.profile
  if (!tool) {
    const message = `Part ${ctx.part.id} is not profiled: no usable profile tool`
    return { toolpath: null, warnings: [partWarning(ctx, 'error', 'cam/profile-skipped', message)] }
  }
  const tabs = tabPlan(ctx)
  if (!(tabs.totalDepth > 0)) {
    const message = `Part ${ctx.part.id} is not profiled: onion skin ${f(ctx.machine.onionSkin)} mm leaves nothing to cut in ${f(ctx.stockThickness)} mm stock`
    return { toolpath: null, warnings: [...tabs.warnings, partWarning(ctx, 'error', 'cam/profile-skipped', message)] }
  }
  const r = tool.diameter / 2
  const sides = profileSides(ctx.part.length, ctx.part.width, r)
  const windows = sides.map((s) => (tabs.tabZ === null ? [] : sideWindows(s.edgeLength, r, ctx)))
  const passes = depthLevels(tabs.totalDepth, tool.stepDown).map((depth) =>
    sides.flatMap((side, i) => sidePoints(side, windows[i] ?? [], -depth, tabs.tabZ)),
  )
  const warnings = [...tabs.warnings]
  const tabTotal = windows.reduce((n, w) => n + w.length, 0)
  if (tabs.tabZ !== null && tabTotal < MIN_TABS_PER_PART) {
    const message = `Part ${ctx.part.id} only fits ${tabTotal} tab(s); it may move when cut free`
    warnings.push(partWarning(ctx, 'warn', 'cam/tabs-insufficient', message))
  }
  if (tabs.totalDepth > tool.fluteLength) {
    const message = `Profile of ${ctx.part.id} is ${f(tabs.totalDepth)} mm deep but T${tool.number} flutes are ${f(tool.fluteLength)} mm long`
    warnings.push(partWarning(ctx, 'error', 'cam/flute-length', message))
  }
  return { toolpath: sheetToolpath(ctx, 'profile', 'profile', 'profile', tool, passes), warnings }
}
