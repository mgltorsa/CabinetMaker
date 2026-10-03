/**
 * Cut order on a sheet: drills → grooves/pockets → profiles. Inside a phase
 * toolpaths are grouped by tool (stable), and the groove phase starts with the
 * drill phase's last tool and ends with the profile tool to save tool changes.
 * Profiles keep the order they come in (the generator sorts smallest first).
 */
import type { Id } from '@/core/types'
import type { CamPhase, PlannedToolpath } from './types'

const PHASES: readonly CamPhase[] = ['drill', 'groove', 'profile']

function groupByTool(paths: readonly PlannedToolpath[]): PlannedToolpath[][] {
  const order: Id[] = []
  const groups = new Map<Id, PlannedToolpath[]>()
  for (const p of paths) {
    const group = groups.get(p.tool.id)
    if (group) group.push(p)
    else {
      order.push(p.tool.id)
      groups.set(p.tool.id, [p])
    }
  }
  return order.map((id) => groups.get(id) ?? [])
}

function groupRank(group: readonly PlannedToolpath[], previousTool: Id | null, nextTool: Id | null): number {
  const id = group[0]?.tool.id
  if (id === previousTool) return 0
  if (id === nextTool) return 2
  return 1
}

export function orderToolpaths(paths: readonly PlannedToolpath[]): PlannedToolpath[] {
  const byPhase = PHASES.map((phase) => paths.filter((p) => p.phase === phase))
  const ordered: PlannedToolpath[] = []
  byPhase.forEach((phasePaths, i) => {
    const previousTool = ordered.at(-1)?.tool.id ?? null
    const nextTool = byPhase.slice(i + 1).find((list) => list.length > 0)?.[0]?.tool.id ?? null
    const groups = groupByTool(phasePaths)
      .map((group, index) => ({ group, index, rank: groupRank(group, previousTool, nextTool) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
    groups.forEach(({ group }) => ordered.push(...group))
  })
  return ordered
}
