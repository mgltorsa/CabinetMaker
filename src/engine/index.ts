/**
 * Construction engine: Project → parts, ops, hardware. Pure functions, no UI.
 *
 * Bootstrap (P0) implementation: frameless carcass, captured back, adjustable
 * shelves. The engine work stream replaces this with the full rules engine.
 */
import type { Cabinet, CabinetBuild, Material, Part, Project, ProjectBuild } from '@/core/types'
import { box, makePart } from './geometry'

export interface EngineContext {
  materials: Material[]
}

function thicknessOf(ctx: EngineContext, materialId: string): number {
  const m = ctx.materials.find((mat) => mat.id === materialId)
  if (!m) throw new Error(`Unknown material ${materialId}`)
  return m.thickness
}

export function buildCabinet(cabinet: Cabinet, ctx: EngineContext): CabinetBuild {
  const { id, width: W, height: H, depth: D, construction: c } = cabinet
  const t = thicknessOf(ctx, c.carcassMaterialId)
  const bt = thicknessOf(ctx, c.backMaterialId)
  const g = c.back.construction === 'captured' ? c.back.grooveDepth : 0
  const y0 = c.toeKick.type === 'none' ? 0 : c.toeKick.height
  const base = { cabinetId: id, thickness: t, grain: 'length' as const, materialId: c.carcassMaterialId }
  const parts: Part[] = [
    makePart({ ...base, role: 'side-left', name: 'Left side', group: 'carcass', bounds: box(0, t, y0, H, 0, D), lengthAxis: 'y', thicknessAxis: 'x' }),
    makePart({ ...base, role: 'side-right', name: 'Right side', group: 'carcass', bounds: box(W - t, W, y0, H, 0, D), lengthAxis: 'y', thicknessAxis: 'x' }),
    makePart({ ...base, role: 'bottom', name: 'Bottom', group: 'carcass', bounds: box(t, W - t, y0, y0 + t, 0, D), lengthAxis: 'x', thicknessAxis: 'y' }),
    makePart({ ...base, role: 'top', name: 'Top', group: 'carcass', bounds: box(t, W - t, H - t, H, 0, D), lengthAxis: 'x', thicknessAxis: 'y' }),
    makePart({
      ...base,
      thickness: bt,
      materialId: c.backMaterialId,
      role: 'back',
      name: 'Back',
      group: 'back',
      bounds: box(t - g, W - t + g, y0 + t - g, H - t + g, c.back.inset, c.back.inset + bt),
      lengthAxis: 'y',
      thicknessAxis: 'z',
    }),
  ]
  const shelfCount = cabinet.sections.flatMap((s) => s.bays).reduce((n, b) => n + (b.kind === 'drawer' ? 0 : b.shelfCount), 0)
  const interiorBottom = y0 + t
  const interiorHeight = H - t - interiorBottom
  for (let i = 0; i < shelfCount; i++) {
    const y = interiorBottom + ((i + 1) * interiorHeight) / (shelfCount + 1) - t / 2
    parts.push(
      makePart({ ...base, role: `shelf-${i + 1}`, name: `Shelf ${i + 1}`, group: 'shelf', bounds: box(t + 1, W - t - 1, y, y + t, c.back.inset + bt, D - 2), lengthAxis: 'x', thicknessAxis: 'y' }),
    )
  }
  return { cabinetId: id, parts, hardware: [], warnings: [] }
}

export function buildProject(project: Project): ProjectBuild {
  const ctx: EngineContext = { materials: project.materials }
  const cabinets = project.cabinets.map((cab) => buildCabinet(cab, ctx))
  return {
    cabinets,
    parts: cabinets.flatMap((b) => b.parts),
    hardware: cabinets.flatMap((b) => b.hardware),
    warnings: cabinets.flatMap((b) => b.warnings),
  }
}
