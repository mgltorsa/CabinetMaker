/**
 * Drawer fronts, drawer boxes and slides.
 *
 * Slide: the cabinet's chosen slide (`hardware.slideId`) when it is of the
 * construction's mount and fits the interior depth (behind the front, in
 * front of the back/nailer) minus `drawer.rearClearance`; otherwise, with a
 * warning, the longest fitting catalog slide of the chosen family (same
 * manufacturer and mount) or of the mount. One pair per drawer. Box: length =
 * slide length; width from the slide's width rule (undermount: inside width =
 * opening − deduction, so the outside width follows the side thickness;
 * side-mount: outside width = opening − 2 × side clearance); height = clear
 * opening − slide top/bottom clearance. Sides run
 * the full box length; front and back sit between them (into dados when the
 * drawer joinery is dado); the bottom is captured in grooves `bottomRecess`
 * above the lower edge.
 *
 * Face A: fronts −Z (inside); box sides face inward, box front faces the back,
 * box back faces the front, bottom faces up.
 */
import type { BuildWarning, HardwareItem, Mm, SignedAxis, WarningLevel } from '@/core/types'
import {
  MIN_DRAWER_BOX_HEIGHT,
  MIN_DRAWER_BOX_WIDTH,
  MIN_PART_SIZE,
  RUNNER_HOLE_DEPTH,
  RUNNER_HOLE_DIAMETER,
  RUNNER_HOLE_REAR_MARGIN,
  RUNNER_HOLE_SYSTEM32_STEPS,
  SIDE_MOUNT_CLEARANCES,
  SYSTEM32_PITCH,
  SYSTEM32_SETBACK,
  UNDERMOUNT_CLEARANCES,
  type SlideClearances,
  type SlideWidthRule,
} from './constants'
import { emptyResult, mergeResults, warning, type BuildContext, type RuleResult } from './context'
import { dadoDepth } from './dims'
import { boxOf, makePart, span, spanMid, spanSize, type FramedPart, type Span } from './geometry'
import { chooseSlide, findHardware, type SlideChoice } from './hardware'
import { jointOps, type Fasteners, type JointSpec } from './joinery'
import type { BayLayout } from './layout'
import type { PlacedOp } from './ops'
import { panelHoles, type SectionFaces, type SectionUnit } from './panelHoles'
import { drawerPulls } from './pulls'

export function buildDrawers(ctx: BuildContext, units: readonly SectionUnit[], fasteners: Fasteners): RuleResult {
  const { cabinet, dims: d, catalog } = ctx
  const drawerBays = units.flatMap((u) => u.layout.bays.filter((b) => b.bay.kind === 'drawer').map((bay) => ({ bay, unit: u })))
  if (drawerBays.length === 0) return emptyResult()
  const c = cabinet.construction.drawer
  const available = d.frontZ.lo - d.rearLimitZ - c.rearClearance
  const choice = chooseSlide(catalog, c.slideMount, cabinet.hardware.slideId, available)
  const slide = choice.slide
  const pull = findHardware(catalog, cabinet.hardware.pullId, 'pull')
  const warnings = slideWarnings(ctx, choice, available)
  const results = drawerBays.map(({ bay, unit }) => {
    const front = buildFront(ctx, bay, pull)
    if (!slide || !front) return front ?? emptyResult()
    return mergeResults(front, buildBox(ctx, bay, slide, unit, fasteners))
  })
  return mergeResults(...results, { ...emptyResult(), warnings })
}

function slideWarnings(ctx: BuildContext, choice: SlideChoice, available: Mm): BuildWarning[] {
  const { cabinet, mats } = ctx
  const mount = cabinet.construction.drawer.slideMount
  const requestedId = cabinet.hardware.slideId
  const { slide, requested, reason } = choice
  const depth = Math.round(available)
  const add = (level: WarningLevel, code: string, message: string): BuildWarning => warning(cabinet.id, level, code, message)
  const out: BuildWarning[] = []
  if (reason === 'unknown') out.push(add('warn', 'unknown-hardware', `Slide ${requestedId} is not in the catalog`))
  if (!slide) {
    const why = choice.candidates.length === 0 ? `The catalog has no ${mount} slides` : `No ${mount} slide fits the ${depth} mm available depth`
    return [...out, add('warn', 'no-slide-fits', `${why}; drawer boxes omitted`)]
  }
  if (reason === 'too-long' && requested) {
    out.push(add('warn', 'slide-too-long', `${requested.name} (${requested.props.length ?? '?'} mm) does not fit the ${depth} mm available depth; using ${slide.name}`))
  }
  if (reason === 'mount-mismatch' && requested) {
    out.push(add('info', 'slide-mount-mismatch', `${requested.name} is not a ${mount} slide; using ${slide.name}`))
  }
  const cl = clearancesFor(ctx)
  if (mats.drawerBox.thickness > cl.maxSideThickness) {
    out.push(add('warn', 'drawer-side-thickness', `Drawer-box sides are ${mats.drawerBox.thickness} mm; ${mount} runners take sides up to ${cl.maxSideThickness} mm`))
  }
  return out
}

/**
 * Outside drawer-box width for a clear opening width. Inside-located runners
 * (undermount) fix the inside width, so the outside width follows the actual
 * side thickness; side-mount runners fix the outside width.
 */
function drawerBoxOutsideWidth(rule: SlideWidthRule, openingWidth: Mm, sideThickness: Mm): Mm {
  return rule.basis === 'inside' ? openingWidth - rule.deduction + 2 * sideThickness : openingWidth - rule.deduction
}

function buildFront(ctx: BuildContext, b: BayLayout, pull: HardwareItem | undefined): RuleResult | null {
  const { cabinet, dims: d, mats } = ctx
  if (spanSize(b.front.x) < MIN_PART_SIZE || spanSize(b.front.y) < MIN_PART_SIZE) return null
  const front = makePart({
    cabinetId: cabinet.id,
    role: `drawer-front-${b.section + 1}-${b.index + 1}`,
    name: `Drawer front ${b.section + 1}.${b.index + 1}`,
    group: 'front',
    materialId: mats.front.id,
    grain: mats.front.grain,
    bounds: boxOf(b.front.x, b.front.y, d.frontZ),
    length: '+x',
    faceA: '-z',
  })
  const pulls = drawerPulls(front, b.front, pull)
  return { parts: [front], ops: pulls.ops, hardware: pulls.hardware, warnings: [] }
}

function clearancesFor(ctx: BuildContext): SlideClearances {
  return ctx.cabinet.construction.drawer.slideMount === 'undermount' ? UNDERMOUNT_CLEARANCES : SIDE_MOUNT_CLEARANCES
}

function buildBox(ctx: BuildContext, b: BayLayout, slide: HardwareItem, unit: SectionUnit, fasteners: Fasteners): RuleResult {
  const { cabinet, dims: d, mats } = ctx
  const cl = clearancesFor(ctx)
  const name = `Drawer ${b.section + 1}.${b.index + 1}`
  const dt = mats.drawerBox.thickness
  const clearX = unit.layout.clearX
  const outsideW = drawerBoxOutsideWidth(cl.width, spanSize(clearX), dt)
  const by = span(b.openingY.lo + cl.bottomClearance, b.openingY.hi - cl.topClearance)
  const bottomY = span(by.lo + cl.bottomRecess, by.lo + cl.bottomRecess + mats.drawerBottom.thickness)
  const tooNarrow = outsideW - 2 * dt < MIN_DRAWER_BOX_WIDTH || outsideW > spanSize(clearX)
  if (spanSize(by) < MIN_DRAWER_BOX_HEIGHT || bottomY.hi > by.hi - dt || tooNarrow) {
    return { ...emptyResult(), warnings: [warning(cabinet.id, 'warn', 'drawer-box-too-small', `${name}: opening too small for a drawer box; box omitted`)] }
  }
  const length = slide.props.length ?? 0
  const bx = span(spanMid(clearX) - outsideW / 2, spanMid(clearX) + outsideW / 2)
  const bz = span(d.frontZ.lo - length, d.frontZ.lo)
  const parts = boxParts(ctx, b, { bx, by, bz, bottomY })
  const joints = boxJoints(ctx, parts).map((j) => jointOps(j, fasteners))
  const runners = d.faceFrame ? [] : runnerHoles(ctx, b, by, length, unit.faces)
  return {
    parts: [parts.left, parts.right, parts.front, parts.back, parts.bottom],
    ops: [...joints.flatMap((j) => j.ops), ...runners],
    hardware: [{ hardwareId: slide.id, qty: 1, note: 'Drawer slide pairs' }, ...joints.flatMap((j) => j.hardware)],
    warnings: [],
  }
}

interface BoxSpans {
  bx: Span
  by: Span
  bz: Span
  bottomY: Span
}

interface BoxParts {
  left: FramedPart
  right: FramedPart
  front: FramedPart
  back: FramedPart
  bottom: FramedPart
}

function boxParts(ctx: BuildContext, b: BayLayout, s: BoxSpans): BoxParts {
  const { cabinet, mats } = ctx
  const dt = mats.drawerBox.thickness
  const dda = cabinet.construction.drawer.joinery === 'dado' ? dadoDepth(dt) : 0
  const gd = dadoDepth(dt)
  const prefix = `drawer-${b.section + 1}-${b.index + 1}`
  const name = `Drawer ${b.section + 1}.${b.index + 1}`
  const make = (role: string, label: string, bx: Span, by: Span, bz: Span, length: SignedAxis, faceA: SignedAxis, bottom = false): FramedPart => {
    const m = bottom ? mats.drawerBottom : mats.drawerBox
    return makePart({ cabinetId: cabinet.id, role: `${prefix}-${role}`, name: `${name} ${label}`, group: 'drawer-box', materialId: m.id, grain: m.grain, bounds: boxOf(bx, by, bz), length, faceA })
  }
  const innerX = span(s.bx.lo + dt - dda, s.bx.hi - dt + dda)
  return {
    left: make('side-left', 'left side', span(s.bx.lo, s.bx.lo + dt), s.by, s.bz, '+z', '+x'),
    right: make('side-right', 'right side', span(s.bx.hi - dt, s.bx.hi), s.by, s.bz, '+z', '-x'),
    front: make('front', 'box front', innerX, s.by, span(s.bz.hi - dt, s.bz.hi), '+x', '-z'),
    back: make('back', 'box back', innerX, s.by, span(s.bz.lo, s.bz.lo + dt), '+x', '+z'),
    bottom: make('bottom', 'bottom', span(s.bx.lo + dt - gd, s.bx.hi - dt + gd), s.bottomY, span(s.bz.lo + dt - gd, s.bz.hi - dt + gd), '+x', '+y', true),
  }
}

function boxJoints(ctx: BuildContext, p: BoxParts): JointSpec[] {
  const method = ctx.cabinet.construction.drawer.joinery
  const groove = { method: 'dado' as const, purpose: 'bottom-groove' as const, inserted: p.bottom }
  return [
    { receiver: p.left, inserted: p.front, normal: '+x', along: 'y', method },
    { receiver: p.left, inserted: p.back, normal: '+x', along: 'y', method },
    { receiver: p.right, inserted: p.front, normal: '-x', along: 'y', method },
    { receiver: p.right, inserted: p.back, normal: '-x', along: 'y', method },
    { ...groove, receiver: p.left, normal: '+x', along: 'z' },
    { ...groove, receiver: p.right, normal: '-x', along: 'z' },
    { ...groove, receiver: p.front, normal: '-z', along: 'x' },
    { ...groove, receiver: p.back, normal: '+z', along: 'x' },
  ]
}

/** Runner screw holes on both section panels at System 32 points behind the front. */
function runnerHoles(ctx: BuildContext, b: BayLayout, by: Span, slideLength: number, faces: SectionFaces): PlacedOp[] {
  const { dims: d } = ctx
  const cl = clearancesFor(ctx)
  const y = Math.min(b.openingY.lo + cl.runnerHoleHeight, spanMid(by))
  const zs = RUNNER_HOLE_SYSTEM32_STEPS.map((k) => SYSTEM32_SETBACK + k * SYSTEM32_PITCH)
    .filter((back) => back <= slideLength - RUNNER_HOLE_REAR_MARGIN)
    .map((back) => d.interiorFrontZ - back)
  const points = zs.map((z) => ({ y, z }))
  const spec = { diameter: RUNNER_HOLE_DIAMETER, depth: RUNNER_HOLE_DEPTH, purpose: 'slide' as const }
  return [...panelHoles(faces.left, points, spec), ...panelHoles(faces.right, points, spec)]
}
