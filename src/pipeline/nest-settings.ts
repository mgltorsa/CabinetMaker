/**
 * Nest settings the pipeline actually nests with. The stored `project.nest`
 * is never changed; it is widened here so the router's cuts cannot reach a
 * neighbouring part or leave the sheet:
 *
 * - Part gap (`kerf + partSpacing`) ≥ the profile tool **diameter**: a profile
 *   runs one radius outside the part, so it removes material up to one
 *   diameter from the part edge.
 * - Part gap ≥ half the dado tool diameter: a through dado keeps the tool
 *   centre on the part edge, so it overruns by one radius.
 * - Edge trim ≥ both of those reaches, so cuts at the trim line stay on the sheet.
 *
 * Only the kerf is raised (part spacing is kept as entered), and only by what
 * is missing. Missing, invalid or drill tools are ignored here: CAM reports
 * them as errors and does not cut with them.
 */
import type { Id, Mm, NestSettings, Project, Tool } from '@/core/types'

/** Diameter of a tool that can cut sideways, or 0 when the tool is unusable for that. */
function sideCuttingDiameter(tools: readonly Tool[], id: Id): Mm {
  const tool = tools.find((t) => t.id === id)
  if (!tool || tool.kind === 'drill') return 0
  return Number.isFinite(tool.diameter) && tool.diameter > 0 ? tool.diameter : 0
}

export function effectiveNestSettings(project: Pick<Project, 'nest' | 'machine' | 'tools'>): NestSettings {
  const { nest, machine, tools } = project
  const profileReach = sideCuttingDiameter(tools, machine.profileToolId)
  const dadoOverrun = sideCuttingDiameter(tools, machine.dadoToolId) / 2
  const reach = Math.max(profileReach, dadoOverrun)
  const neededKerf = reach - nest.partSpacing
  // Comparisons, not Math.max: a NaN setting must stay as entered so the nest reports that field, not a derived one.
  const kerf = neededKerf > nest.kerf ? neededKerf : nest.kerf
  const edgeTrim = reach > nest.edgeTrim ? reach : nest.edgeTrim
  if (kerf === nest.kerf && edgeTrim === nest.edgeTrim) return nest
  return { ...nest, kerf, edgeTrim }
}
