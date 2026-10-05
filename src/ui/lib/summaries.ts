/**
 * One-line summaries shown under each sidebar card title ("2 shelves",
 * "1 door · Slab"), so a closed card still tells the specialist what is set.
 */
import type { Cabinet, ConstructionStyle, HardwareItem, Project, UnitSystem } from '@/core/types'
import { formatLength } from '@/core/units'

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export const STYLE_LABELS: Record<ConstructionStyle, string> = {
  'frameless-overlay': 'Frameless · full overlay',
  'frameless-inset': 'Frameless · inset',
  'face-frame-overlay': 'Face frame · overlay',
  'face-frame-inset': 'Face frame · inset',
}

function len(mm: number, units: UnitSystem): string {
  return units === 'metric' ? `${formatLength(mm, units)} mm` : formatLength(mm, units)
}

export function dimensionsSummary(cab: Cabinet, units: UnitSystem): string {
  const f = (v: number): string => formatLength(v, units)
  return `${f(cab.width)} × ${f(cab.height)} × ${f(cab.depth)}${units === 'metric' ? ' mm' : ''}`
}

export function toeKickSummary(cab: Cabinet, units: UnitSystem): string {
  const k = cab.construction.toeKick
  if (k.type === 'none') return 'None'
  return `${k.type === 'panel' ? 'Panel' : 'Full base'} · ${len(k.height, units)}, ${len(k.setback, units)} setback`
}

export function topSummary(cab: Cabinet, units: UnitSystem): string {
  const construction = cab.construction.top === 'stretchers' ? 'Stretchers' : 'Full top'
  if (cab.top.kind === 'none') return `${construction} · no countertop`
  return `${construction} · ${cab.top.kind === 'countertop' ? 'countertop' : 'finished top'} ${len(cab.top.thickness, units)}`
}

export function layoutSummary(cab: Cabinet): string {
  const bays = cab.sections.reduce((n, s) => n + s.bays.length, 0)
  return `${plural(cab.sections.length, 'section')} · ${plural(bays, 'bay')}`
}

export function shelfCount(cab: Cabinet): number {
  return cab.sections.flatMap((s) => s.bays).reduce((n, b) => n + (b.kind === 'drawer' ? 0 : b.shelfCount), 0)
}

export function drawerCount(cab: Cabinet): number {
  return cab.sections.flatMap((s) => s.bays).filter((b) => b.kind === 'drawer').length
}

export function doorCount(cab: Cabinet): number {
  return cab.sections.flatMap((s) => s.bays).reduce((n, b) => n + (b.kind === 'door' ? b.doorCount : 0), 0)
}

export function shelvesSummary(cab: Cabinet): string {
  const n = shelfCount(cab)
  return n === 0 ? 'None' : plural(n, 'shelf', 'shelves')
}

/** Hanging rods (door and open bays only; the engine ignores a rod on a drawer bay). */
export function rodCount(cab: Cabinet): number {
  return cab.sections.flatMap((s) => s.bays).filter((b) => b.kind !== 'drawer' && b.rod !== undefined).length
}

/** Shelves card summary: shelves, plus hanging rods when there are any. */
export function shelvesAndRodsSummary(cab: Cabinet): string {
  const rods = rodCount(cab)
  if (rods === 0) return shelvesSummary(cab)
  const rodText = plural(rods, 'rod')
  return shelfCount(cab) === 0 ? rodText : `${shelvesSummary(cab)} · ${rodText}`
}

export function drawersSummary(cab: Cabinet, hardware: readonly HardwareItem[]): string {
  const n = drawerCount(cab)
  if (n === 0) return 'None'
  const slide = hardware.find((h) => h.id === cab.hardware.slideId)
  const mount = cab.construction.drawer.slideMount === 'undermount' ? 'undermount' : 'side mount'
  return `${plural(n, 'drawer')} · ${mount}${slide?.props.length ? ` ${slide.props.length}` : ''}`
}

export function doorsSummary(cab: Cabinet): string {
  const n = doorCount(cab)
  return n === 0 ? 'None' : `${plural(n, 'door')} · Slab`
}

export function backSummary(cab: Cabinet, units: UnitSystem): string {
  const b = cab.construction.back
  return b.construction === 'captured' ? `Captured · ${len(b.grooveDepth, units)} groove` : 'Applied'
}

export function materialsSummary(cab: Cabinet, project: Project): string {
  const name = (id: string): string => project.materials.find((m) => m.id === id)?.name ?? id
  return name(cab.construction.carcassMaterialId)
}
