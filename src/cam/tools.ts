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
  if (role !== 'drill' && tool.kind === 'drill') {
    return {
      tool: null,
      warning: {
        level: 'error',
        code: 'cam/tool-kind',
        message: `Tool T${tool.number} "${tool.name}" is a drill and cannot be the ${role} tool (it cannot cut sideways); ${role} cuts are not machined`,
      },
    }
  }
  return { tool }
}

/**
 * Errors for different tools that share a machine tool number: `Tn M6` would
 * load the same pocket for both, so the program could run with the wrong tool.
 */
function duplicateNumberWarnings(tools: readonly Tool[]): BuildWarning[] {
  const byNumber = new Map<number, Tool[]>()
  for (const tool of tools) {
    const group = byNumber.get(tool.number) ?? []
    if (!group.some((t) => t.id === tool.id)) byNumber.set(tool.number, [...group, tool])
  }
  return [...byNumber.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([number, group]) => ({
      level: 'error',
      code: 'cam/tool-number-duplicate',
      message: `Tools ${group.map((t) => `"${t.name}"`).join(' and ')} share tool number T${number}; give each tool a unique number (G-code export is refused)`,
    }))
}

export function resolveTools(machine: Machine, tools: readonly Tool[]): ResolvedTools {
  const drill = resolveOne('drill', machine.drillToolId, tools)
  const dado = resolveOne('dado', machine.dadoToolId, tools)
  const profile = resolveOne('profile', machine.profileToolId, tools)
  const endMills = [dado.tool, profile.tool]
    .filter((t): t is Tool => t !== null && t.kind !== 'drill')
    .filter((t, i, all) => all.findIndex((o) => o.id === t.id) === i)
    .sort((a, b) => b.diameter - a.diameter)
  const resolved = [drill.tool, dado.tool, profile.tool].filter((t): t is Tool => t !== null)
  const warnings = [
    ...[drill.warning, dado.warning, profile.warning].filter((w): w is BuildWarning => w !== undefined),
    ...duplicateNumberWarnings(resolved),
  ]
  return { tools: { drill: drill.tool, dado: dado.tool, profile: profile.tool, endMills }, warnings }
}
