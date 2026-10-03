/**
 * Holes on the inside faces of the panels that bound a section (sides and
 * dividers): shelf pins, hinge mounting plates and runner screws. Dividers can
 * be drilled from both faces at the same spot, so their blind holes are kept
 * shallower than half the thickness.
 */
import type { Mm, OpPurpose } from '@/core/types'
import { MIN_WEB_BETWEEN_HOLES } from './constants'
import type { FramedPart } from './geometry'
import type { SectionLayout } from './layout'
import { holeOp, type PlacedOp } from './ops'

export interface SectionPanels {
  /** Panel on the section's left (its +X face faces the section) and right (−X face). */
  left: FramedPart
  right: FramedPart
}

export interface PanelFace {
  part: FramedPart
  /** Cabinet x of the face. */
  x: Mm
  normal: '+x' | '-x'
}

export interface SectionFaces {
  left: PanelFace
  right: PanelFace
}

/** A section's layout together with the inside faces of its bounding panels. */
export interface SectionUnit {
  layout: SectionLayout
  faces: SectionFaces
}

export function sectionFaces(panels: SectionPanels, section: SectionLayout): SectionFaces {
  return {
    left: { part: panels.left, x: section.carcassX.lo, normal: '+x' },
    right: { part: panels.right, x: section.carcassX.hi, normal: '-x' },
  }
}

export function blindDepth(part: FramedPart, requested: Mm): Mm {
  const max = part.group === 'divider' ? (part.thickness - MIN_WEB_BETWEEN_HOLES) / 2 : part.thickness - MIN_WEB_BETWEEN_HOLES
  return Math.min(requested, Math.floor(max))
}

export interface PanelHoleSpec {
  diameter: Mm
  depth: Mm
  purpose: OpPurpose
}

/** A hole on a section face at cabinet (y, z); null when it would not land fully on the panel. */
export function panelHole(face: PanelFace, y: Mm, z: Mm, spec: PanelHoleSpec): PlacedOp | null {
  const b = face.part.bounds
  const r = spec.diameter / 2
  if (y - r < b.min.y || y + r > b.max.y || z - r < b.min.z || z + r > b.max.z) return null
  return holeOp(face.part, { x: face.x, y, z }, face.normal, { ...spec, depth: blindDepth(face.part, spec.depth) })
}

export function panelHoles(face: PanelFace, points: readonly { y: Mm; z: Mm }[], spec: PanelHoleSpec): PlacedOp[] {
  return points.map((p) => panelHole(face, p.y, p.z, spec)).filter((op): op is PlacedOp => op !== null)
}
