/**
 * The single derivation pipeline. Every view (3D, drawings, cut list, CAM,
 * estimate, PDF) reads from one `PipelineResult` so they cannot disagree.
 */
import type { Bom, Estimate, NestResult, Part, Project, ProjectBuild } from '@/core/types'
import { buildProject } from '@/engine'
import { buildBom, estimateCost } from '@/estimate'
import { nestParts } from '@/nest'

export interface PipelineResult {
  build: ProjectBuild
  partsById: ReadonlyMap<string, Part>
  nest: NestResult
  bom: Bom
  estimate: Estimate
}

export function runPipeline(project: Project): PipelineResult {
  const build = buildProject(project)
  const partsById = new Map(build.parts.map((p) => [p.id, p]))
  const nest = nestParts(build.parts, project.materials, project.nest)
  const bom = buildBom(project, build, nest)
  const estimate = estimateCost(project, build, nest, bom)
  return { build, partsById, nest, bom, estimate }
}
