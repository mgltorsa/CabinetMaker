/**
 * Hardware catalog lookups, slide selection and usage aggregation.
 */
import type { HardwareItem, HardwareKind, HardwareUsage, Id, Mm, SlideMount } from '@/core/types'
import { SLIDE_MOUNT_SIDE, SLIDE_MOUNT_UNDERMOUNT } from './constants'
import type { HardwareNeed } from './context'

export function findHardware(catalog: readonly HardwareItem[], id: Id | null, kind: HardwareKind): HardwareItem | undefined {
  if (id === null) return undefined
  return catalog.find((h) => h.id === id && h.kind === kind)
}

export function firstOfKind(catalog: readonly HardwareItem[], kind: HardwareKind): HardwareItem | undefined {
  return catalog.find((h) => h.kind === kind)
}

function mountMatches(item: HardwareItem, mount: SlideMount): boolean {
  const m = item.props.mount
  if (m === undefined) return true
  return mount === 'undermount' ? m === SLIDE_MOUNT_UNDERMOUNT : m === SLIDE_MOUNT_SIDE
}

/**
 * Catalog slides (kind 'slide' with a `length` prop) of the requested mount.
 * When the cabinet's chosen slide is of that mount, only slides from the same
 * manufacturer are considered.
 */
export function slidesFor(catalog: readonly HardwareItem[], mount: SlideMount, preferredId: Id): HardwareItem[] {
  const preferred = catalog.find((h) => h.id === preferredId && h.kind === 'slide' && mountMatches(h, mount))
  return catalog
    .filter((h) => h.kind === 'slide' && typeof h.props.length === 'number' && mountMatches(h, mount))
    .filter((h) => !preferred || h.manufacturer === preferred.manufacturer)
}

/** Longest slide that fits `available` depth. */
export function selectSlide(slides: readonly HardwareItem[], available: Mm): HardwareItem | undefined {
  return slides
    .filter((h) => (h.props.length ?? Infinity) <= available)
    .reduce<HardwareItem | undefined>((best, h) => (!best || (h.props.length ?? 0) > (best.props.length ?? 0) ? h : best), undefined)
}

/** Sum needs per hardware id, keeping first-seen order and distinct notes. */
export function aggregateHardware(cabinetId: Id, needs: readonly HardwareNeed[]): HardwareUsage[] {
  const byId = new Map<Id, { qty: number; notes: string[] }>()
  for (const n of needs) {
    if (n.qty <= 0) continue
    const entry = byId.get(n.hardwareId) ?? { qty: 0, notes: [] }
    byId.set(n.hardwareId, { qty: entry.qty + n.qty, notes: entry.notes.includes(n.note) ? entry.notes : [...entry.notes, n.note] })
  }
  return [...byId.entries()].map(([hardwareId, { qty, notes }]) => ({ hardwareId, cabinetId, qty, note: notes.join('; ') }))
}
