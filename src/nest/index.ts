/**
 * Nesting: parts → sheets by material/thickness, respecting grain and kerf.
 * Stub — the nest work stream implements this.
 */
import type { Material, NestResult, NestSettings, Part } from '@/core/types'

export function nestParts(parts: Part[], materials: Material[], settings: NestSettings): NestResult {
  void materials
  void settings
  return {
    sheets: [],
    linearPartIds: [],
    unplaced: parts.map((p) => ({ partId: p.id, reason: 'nesting not implemented' })),
    summary: [],
  }
}
