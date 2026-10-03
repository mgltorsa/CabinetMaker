/** Resolve and validate the tools the machine settings point at. */
import type { BuildWarning, Id, Machine, Tool } from '@/core/types'

export interface CamTools {
  drill: Tool | null
  dado: Tool | null
  profile: Tool | null
  /** Valid non-drill tools among dado/profile, largest diameter first. */
  endMills: Tool[]
}

export interface ResolvedTools {
  tools: CamTools
  warnings: BuildWarning[]
}

type ToolRole = 'drill' | 'dado' | 'profile'

const POSITIVE_FIELDS = ['diameter', 'fluteLength', 'rpm', 'plungeFeed', 'cutFeed', 'stepDown'] as const

/** Names of fields that make a tool unusable, empty when the tool is valid. */
export function invalidToolFields(tool: Tool): string[] {
  const bad: string[] = POSITIVE_FIELDS.filter((f) => !(Number.isFinite(tool[f]) && tool[f] > 0))
  if (!(Number.isInteger(tool.number) && tool.number >= 0)) bad.push('number')
  return bad
}

function resolveOne(role: ToolRole, id: Id, tools: readonly Tool[]): { tool: Tool | null; warning?: BuildWarning } {
  const tool = tools.find((t) => t.id === id)
  if (!tool) {
    return {
      tool: null,
      warning: { level: 'error', code: 'cam/tool-missing', message: `Machine ${role} tool "${id}" is not in the tool table` },
    }
  }
  const bad = invalidToolFields(tool)
  if (bad.length > 0) {
    return {
      tool: null,
      warning: {
        level: 'error',
        code: 'cam/tool-invalid',
        message: `Tool T${tool.number} "${tool.name}" (${role}) has invalid ${bad.join(', ')}`,
      },
    }
  }
  return { tool }
}

export function resolveTools(machine: Machine, tools: readonly Tool[]): ResolvedTools {
  const drill = resolveOne('drill', machine.drillToolId, tools)
  const dado = resolveOne('dado', machine.dadoToolId, tools)
  const profile = resolveOne('profile', machine.profileToolId, tools)
  const endMills = [dado.tool, profile.tool]
    .filter((t): t is Tool => t !== null && t.kind !== 'drill')
    .filter((t, i, all) => all.findIndex((o) => o.id === t.id) === i)
    .sort((a, b) => b.diameter - a.diameter)
  const warnings = [drill.warning, dado.warning, profile.warning].filter((w): w is BuildWarning => w !== undefined)
  return { tools: { drill: drill.tool, dado: dado.tool, profile: profile.tool, endMills }, warnings }
}
