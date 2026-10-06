/**
 * The single derivation pipeline. Every view (3D, drawings, cut list, CAM,
 * estimate, PDF) reads from one `PipelineResult` so they cannot disagree.
 */
import type { Bom, Estimate, NestResult, NestSettings, Part, Project, ProjectBuild } from '@/core/types'
import { buildProject } from '@/engine'
import { buildBom, estimateCost } from '@/estimate'
import { nestParts } from '@/nest'
import { effectiveNestSettings } from './nest-settings'

export { effectiveNestSettings } from './nest-settings'

export interface PipelineResult {
  build: ProjectBuild
  partsById: ReadonlyMap<string, Part>
  nest: NestResult
  /**
   * Settings `nest` was computed with: `project.nest` widened for the router
   * tools (see `effectiveNestSettings`). Validate the nest and draw trim
   * margins with these, not `project.nest`. Optional only so hand-built
   * results (tests, empty placeholders) need not set it.
   */
  nestSettings?: NestSettings
  bom: Bom
  estimate: Estimate
}

export function runPipeline(project: Project): PipelineResult {
  const build = buildProject(project)
  const partsById = new Map(build.parts.map((p) => [p.id, p]))
  const nestSettings = effectiveNestSettings(project)
  const nest = nestParts(build.parts, project.materials, nestSettings)
  const bom = buildBom(project, build, nest)
  const estimate = estimateCost(project, build, nest, bom)
  return { build, partsById, nest, nestSettings, bom, estimate }
}
