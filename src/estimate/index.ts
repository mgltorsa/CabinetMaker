/**
 * BOM + cost estimate. Stub — the estimate work stream implements this.
 */
import type { Bom, Estimate, NestResult, Project, ProjectBuild } from '@/core/types'

export function buildBom(project: Project, build: ProjectBuild, nest: NestResult): Bom {
  void project
  void nest
  return {
    parts: build.parts.map((p) => ({
      partId: p.id,
      cabinetId: p.cabinetId,
      name: p.name,
      materialId: p.materialId,
      length: p.length,
      width: p.width,
      thickness: p.thickness,
      grain: p.grain,
      opCount: p.ops.length,
    })),
    lines: [],
  }
}

export function estimateCost(project: Project, build: ProjectBuild, nest: NestResult, bom: Bom): Estimate {
  void build
  void nest
  void bom
  return {
    currency: project.estimate.currency,
    materials: [],
    hardware: [],
    labor: [],
    materialCost: 0,
    hardwareCost: 0,
    laborCost: 0,
    subtotal: 0,
    marginAmount: 0,
    price: 0,
  }
}
