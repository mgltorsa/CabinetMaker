/**
 * Carcass: sides, bottom, full top or stretchers, dividers, fixed partitions,
 * rear nailers and their joints.
 *
 * Construction: sides run full height; top, bottom, stretchers and nailers
 * fit between them (frameless style, also used behind face frames). Dividers
 * fit between bottom and top; partitions between the section's panels. With
 * dado joinery each fitted panel runs `dims.dado` into its dados.
 *
 * Face A (inside faces, where nearly every op lands): sides and dividers face
 * +X/−X inward (dividers: +X), bottom faces up, top and stretchers face down,
 * nailers face the front, partitions face up.
 */
import type { BuildWarning, JoineryType, SignedAxis } from '@/core/types'
import { emptyResult, mergeResults, warning, type BuildContext, type RuleResult } from './context'
import { box, boxOf, span, makePart, type FramedPart, type PartSpec, type Span } from './geometry'
import type { SectionLayout } from './layout'
import { jointOps, type Fasteners, type JointSpec } from './joinery'
import { sectionFaces, type SectionPanels, type SectionUnit } from './panelHoles'

export interface Carcass {
  result: RuleResult
  sideLeft: FramedPart
  sideRight: FramedPart
  bottom: FramedPart
  /** Full top, or front and rear stretchers. */
  topMembers: FramedPart[]
  dividers: FramedPart[]
  /** Every section's layout with the inside faces of its side/divider panels. */
  units: SectionUnit[]
}

const EPS = 0.01

export function buildCarcass(ctx: BuildContext, fasteners: Fasteners): Carcass {
  const { cabinet, dims: d, layout, mats } = ctx
  const c = cabinet.construction
  const panel = (role: string, name: string, b: PartSpec['bounds'], length: SignedAxis, faceA: SignedAxis, group: PartSpec['group'] = 'carcass'): FramedPart =>
    makePart({ cabinetId: cabinet.id, role, name, group, materialId: mats.carcass.id, grain: mats.carcass.grain, bounds: b, length, faceA })

  const z = span(d.rearZ, d.D)
  const sideY = span(d.sideY0, d.yT)
  const fitX = span(d.interiorX.lo - d.dado, d.interiorX.hi + d.dado)
  const sideLeft = panel('side-left', 'Left side', boxOf(span(d.carcassX.lo, d.carcassX.lo + d.t), sideY, z), '+y', '+x')
  const sideRight = panel('side-right', 'Right side', boxOf(span(d.carcassX.hi - d.t, d.carcassX.hi), sideY, z), '+y', '-x')
  const bottom = panel('bottom', 'Bottom', boxOf(fitX, span(d.yB, d.yB + d.t), z), '+x', '+y')
  const topY = span(d.yT - d.t, d.yT)
  const sw = c.stretcherWidth
  const topMembers =
    d.top === 'full-top'
      ? [panel('top', 'Top', boxOf(fitX, topY, z), '+x', '-y')]
      : [
          panel('stretcher-front', 'Front stretcher', boxOf(fitX, topY, span(d.D - sw, d.D)), '+x', '-y', 'stretcher'),
          panel('stretcher-rear', 'Rear stretcher', boxOf(fitX, topY, span(d.rearZ, d.rearZ + sw)), '+x', '-y', 'stretcher'),
        ]
  const innerZ = span(d.rearLimitZ, d.D)
  const dividers = layout.dividers.map((x, i) =>
    panel(`divider-${i + 1}`, `Divider ${i + 1}`, boxOf(x, span(d.interiorY.lo - d.dado, d.interiorY.hi + d.dado), innerZ), '+y', '+x', 'divider'),
  )
  // Divider i sits between section i and i + 1, so a section's neighbours are dividers i − 1 and i.
  const panelsOf = (i: number): SectionPanels => ({ left: dividers[i - 1] ?? sideLeft, right: dividers[i] ?? sideRight })
  const units = layout.sections.map((s, i) => ({ layout: s, panels: panelsOf(i) }))
  const partitions = buildPartitions(ctx, units, panel, innerZ)
  const nailers = buildNailers(ctx, panel)

  const joints = carcassJoints(c.joinery, { sideLeft, sideRight, bottom, topMembers, dividers }, partitions.parts)
  const jointResults = joints.map((j) => jointOps(j, fasteners))
  const result = mergeResults(
    { ...emptyResult(), parts: [sideLeft, sideRight, bottom, ...topMembers, ...dividers, ...partitions.parts.map((p) => p.part), ...nailers] },
    { ...emptyResult(), ops: jointResults.flatMap((r) => r.ops), hardware: jointResults.flatMap((r) => r.hardware), warnings: partitions.warnings },
  )
  const faced = units.map((u) => ({ layout: u.layout, faces: sectionFaces(u.panels, u.layout) }))
  return { result, sideLeft, sideRight, bottom, topMembers, dividers, units: faced }
}

interface JointMembers {
  sideLeft: FramedPart
  sideRight: FramedPart
  bottom: FramedPart
  topMembers: readonly FramedPart[]
  dividers: readonly FramedPart[]
}

/** Top/bottom/stretchers into the sides, dividers into bottom and top, partitions into their section panels. */
function carcassJoints(method: JoineryType, m: JointMembers, partitions: Partitions['parts']): JointSpec[] {
  const joint = (receiver: FramedPart, inserted: FramedPart, normal: SignedAxis): JointSpec => ({
    receiver,
    inserted,
    normal,
    along: 'z',
    method,
    doubleSided: receiver.group === 'divider',
  })
  return [
    ...[m.bottom, ...m.topMembers].flatMap((p) => [joint(m.sideLeft, p, '+x'), joint(m.sideRight, p, '-x')]),
    ...m.dividers.flatMap((div) => [joint(m.bottom, div, '+y'), ...m.topMembers.map((t) => joint(t, div, '-y'))]),
    ...partitions.flatMap(({ part, panels }) => [joint(panels.left, part, '+x'), joint(panels.right, part, '-x')]),
  ]
}

type PanelFn = (role: string, name: string, b: PartSpec['bounds'], length: SignedAxis, faceA: SignedAxis, group?: PartSpec['group']) => FramedPart

function inside(s: Span, outer: Span): boolean {
  return s.lo >= outer.lo - EPS && s.hi <= outer.hi + EPS
}

interface Partitions {
  parts: { part: FramedPart; panels: SectionPanels }[]
  warnings: BuildWarning[]
}

function buildPartitions(ctx: BuildContext, units: readonly { layout: SectionLayout; panels: SectionPanels }[], panel: PanelFn, innerZ: Span): Partitions {
  const { dims: d, cabinet } = ctx
  const parts: Partitions['parts'] = []
  const warnings: BuildWarning[] = []
  for (const { layout: s, panels } of units) {
    for (const [k, y] of s.partitions.entries()) {
      // A partition pushed outside the interior would collide with the bottom/top: skip it.
      if (!inside(y, d.interiorY)) {
        warnings.push(warning(cabinet.id, 'info', 'partition-skipped', `Section ${s.index + 1}: partition ${k + 1} is too close to the top or bottom; omitted`))
        continue
      }
      const x = span(s.carcassX.lo - d.dado, s.carcassX.hi + d.dado)
      parts.push({ part: panel(`partition-${s.index + 1}-${k + 1}`, `Fixed shelf ${s.index + 1}.${k + 1}`, boxOf(x, y, innerZ), '+x', '+y'), panels })
    }
  }
  return { parts, warnings }
}

function buildNailers(ctx: BuildContext, panel: PanelFn): FramedPart[] {
  const { dims: d } = ctx
  const z = span(d.backFrontZ, d.backFrontZ + d.t)
  const nw = d.nailers.width
  const out: FramedPart[] = []
  if (d.nailers.top) {
    out.push(panel('nailer-top', 'Top rear nailer', box(d.interiorX.lo, d.interiorX.hi, d.interiorY.hi - nw, d.interiorY.hi, z.lo, z.hi), '+x', '+z', 'stretcher'))
  }
  if (d.nailers.bottom) {
    out.push(panel('nailer-bottom', 'Bottom rear nailer', box(d.interiorX.lo, d.interiorX.hi, d.interiorY.lo, d.interiorY.lo + nw, z.lo, z.hi), '+x', '+z', 'stretcher'))
  }
  return out
}
