/**
 * Part schedule (cut list rows).
 *
 * One row per `build.parts` entry. Order: cabinet (as listed in
 * `project.cabinets`; cabinets missing from the project go last in the order
 * they first appear in the build), then part group (`GROUP_ORDER`: carcass
 * first, fronts and drawer boxes later, roughly assembly order), then name
 * with natural number ordering ("Shelf 2" before "Shelf 10"). Ties keep build
 * order (the sort is stable).
 */
import type { Part, PartGroup, PartScheduleRow, Project } from '@/core/types'

export const GROUP_ORDER: readonly PartGroup[] = [
  'carcass',
  'top',
  'stretcher',
  'back',
  'divider',
  'shelf',
  'toe-kick',
  'face-frame',
  'front',
  'drawer-box',
  'rod',
]

const nameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function rankMap<T>(values: readonly T[]): Map<T, number> {
  return new Map(values.map((v, i) => [v, i]))
}

function cabinetRanks(project: Project, parts: readonly Part[]): Map<string, number> {
  const known = project.cabinets.map((c) => c.id)
  const extra = parts.map((p) => p.cabinetId).filter((id) => !known.includes(id))
  return rankMap([...new Set([...known, ...extra])])
}

function toRow(p: Part): PartScheduleRow {
  return {
    partId: p.id,
    cabinetId: p.cabinetId,
    name: p.name,
    materialId: p.materialId,
    length: p.length,
    width: p.width,
    thickness: p.thickness,
    grain: p.grain,
    opCount: p.ops.length,
  }
}

export function buildPartSchedule(project: Project, parts: readonly Part[]): PartScheduleRow[] {
  const cabinetRank = cabinetRanks(project, parts)
  const groupRank = rankMap(GROUP_ORDER)
  const rank = (p: Part): [number, number] => [cabinetRank.get(p.cabinetId) ?? 0, groupRank.get(p.group) ?? GROUP_ORDER.length]
  const sorted = [...parts].sort((a, b) => {
    const [ca, ga] = rank(a)
    const [cb, gb] = rank(b)
    return ca - cb || ga - gb || nameCollator.compare(a.name, b.name)
  })
  return sorted.map(toRow)
}
