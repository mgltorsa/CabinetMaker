import type { Axis, Mm, Part, SignedAxis, Vec3 } from './types'

const PANEL_AXES = ['x', 'y', 'z'] as const

function parse(s: SignedAxis): { axis: Axis; sign: 1 | -1 } {
  return { axis: s[1] as Axis, sign: s[0] === '-' ? -1 : 1 }
}

/**
 * Map a panel-space point (x along length, y along width, z from face B toward
 * face A) to cabinet space. Uses the engine's signed `Part.frame` when present;
 * otherwise assumes positive axes with face A on the max side of the thickness.
 */
export function panelToCabinet(part: Part, px: Mm, py: Mm, pz: Mm = part.thickness): Vec3 {
  const b = part.bounds
  const out: Vec3 = { x: b.min.x, y: b.min.y, z: b.min.z }
  const panel = { x: px, y: py, z: pz }
  if (part.frame) {
    for (const k of PANEL_AXES) {
      const d = parse(part.frame[k])
      const origin = d.sign > 0 ? b.min[d.axis] : b.max[d.axis]
      out[d.axis] = origin + d.sign * panel[k]
    }
    return out
  }
  out[part.axes.length] = b.min[part.axes.length] + px
  out[part.axes.width] = b.min[part.axes.width] + py
  out[part.axes.thickness] = b.min[part.axes.thickness] + pz
  return out
}
