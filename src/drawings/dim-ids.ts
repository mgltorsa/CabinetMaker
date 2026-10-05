/**
 * Stable ids for the elevation dimensions that state a cabinet input, so a UI
 * can edit them in place (see `DrawingDimId` in core/types).
 */
import type { DrawingDimId, Part } from '@/core/types'

export interface FrontRef {
  /** 0-based index into `Cabinet.sections`. */
  section: number
  /** 0-based index into `Section.bays`. */
  bay: number
}

export function frontDimId(section: number, bay: number): DrawingDimId {
  return `front:${section}:${bay}`
}

const FRONT_ID = /^front:(\d+):(\d+)$/

export function parseFrontDimId(id: string): FrontRef | null {
  const m = FRONT_ID.exec(id)
  return m ? { section: Number(m[1]), bay: Number(m[2]) } : null
}

const NAMED_IDS: ReadonlySet<string> = new Set<DrawingDimId>(['width', 'height', 'depth', 'toe-kick', 'floor-height'])

export function isDrawingDimId(id: string): id is DrawingDimId {
  return NAMED_IDS.has(id) || parseFrontDimId(id) !== null
}

/** Engine front roles: `door-{s}-{b}`, `door-{s}-{b}-{n}` (pairs), `drawer-front-{s}-{b}`, 1-based. */
const FRONT_ROLE = /^(?:door|drawer-front)-(\d+)-(\d+)(?:-\d+)?$/

/** Section and bay (0-based) an engine-built front belongs to; null for other parts. */
export function frontRefOf(part: Pick<Part, 'group' | 'role'>): FrontRef | null {
  if (part.group !== 'front') return null
  const m = FRONT_ROLE.exec(part.role)
  if (!m) return null
  const section = Number(m[1]) - 1
  const bay = Number(m[2]) - 1
  return section >= 0 && bay >= 0 ? { section, bay } : null
}
