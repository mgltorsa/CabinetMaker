/** Tool-library checks for the machine settings and the G-code export. */
import type { Id, Machine, Tool } from '@/core/types'

/** Tools that can cut profiles and dados (drills only bore straight down). */
export function cuttingTools(tools: readonly Tool[]): Tool[] {
  return tools.filter((t) => t.kind !== 'drill')
}

/** Tool numbers used by more than one tool; the controller cannot tell them apart. */
export function duplicateToolNumbers(tools: readonly Tool[]): ReadonlySet<number> {
  const counts = new Map<number, number>()
  for (const t of tools) counts.set(t.number, (counts.get(t.number) ?? 0) + 1)
  return new Set([...counts].filter(([, n]) => n > 1).map(([number]) => number))
}

export function toolLabel(tool: Tool): string {
  return `T${tool.number} ${tool.name}`
}

/** Why the tool `id` cannot serve `role` (`mustCut`: profile/dado), or null when it can. */
export function toolRoleProblem(role: string, id: Id, tools: readonly Tool[], mustCut: boolean): string | null {
  const tool = tools.find((t) => t.id === id)
  if (!tool) return `${role} tool "${id}" is not in the tool library`
  if (mustCut && tool.kind === 'drill') return `${role} tool ${toolLabel(tool)} is a drill; choose an end mill or compression bit`
  return null
}

/** Problems that make the machine setup unsafe to post G-code for; empty when fine. */
export function toolSetupProblems(machine: Machine, tools: readonly Tool[]): string[] {
  const roles = [
    toolRoleProblem('Profile', machine.profileToolId, tools, true),
    toolRoleProblem('Dado', machine.dadoToolId, tools, true),
    toolRoleProblem('Drill', machine.drillToolId, tools, false),
  ].filter((p): p is string => p !== null)
  const duplicates = [...duplicateToolNumbers(tools)].map((n) => {
    const users = tools.filter((t) => t.number === n)
    return `T${n} is used by ${users.length} tools (${users.map((t) => t.name).join(', ')}); tool numbers must be unique`
  })
  return [...roles, ...duplicates]
}
