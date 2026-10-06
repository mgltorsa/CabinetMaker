/**
 * Hardware catalog lookups, slide selection and usage aggregation.
 */
import type { HardwareItem, HardwareKind, HardwareUsage, Id, Mm, SlideMount } from '@/core/types'
import { HINGE_PLATE_FACE_FRAME, SLIDE_MOUNT_SIDE, SLIDE_MOUNT_UNDERMOUNT } from './constants'
import type { HardwareNeed } from './context'

export function findHardware(catalog: readonly HardwareItem[], id: Id | null, kind: HardwareKind): HardwareItem | undefined {
  if (id === null) return undefined
  return catalog.find((h) => h.id === id && h.kind === kind)
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

/**
 * How the drawer slide was chosen:
 * - 'chosen': the cabinet's slide fits and is used as is;
 * - 'too-long': the cabinet's slide is longer than the available depth, so the
 *   longest fitting slide of its family (same manufacturer and mount) is used;
 * - 'mount-mismatch': the cabinet's slide is of the other mount, so the longest
 *   fitting slide of the construction's mount is used;
 * - 'unknown': the cabinet's slide id is not a catalog slide; as 'mount-mismatch'.
 * `slide` is undefined when nothing fits.
 */
export type SlideChoiceReason = 'chosen' | 'too-long' | 'mount-mismatch' | 'unknown'

export interface SlideChoice {
  slide: HardwareItem | undefined
  reason: SlideChoiceReason
  /** The cabinet's slide when it is in the catalog. */
  requested: HardwareItem | undefined
  /** Slides of the construction's mount (and the requested family) considered. */
  candidates: HardwareItem[]
}

/** Honour the cabinet's chosen slide when it fits; otherwise fall back to the longest fitting one. */
export function chooseSlide(catalog: readonly HardwareItem[], mount: SlideMount, requestedId: Id, available: Mm): SlideChoice {
  const requested = catalog.find((h) => h.id === requestedId && h.kind === 'slide')
  const candidates = slidesFor(catalog, mount, requestedId)
  const fallback = selectSlide(candidates, available)
  if (!requested) return { slide: fallback, reason: 'unknown', requested, candidates }
  if (!mountMatches(requested, mount)) return { slide: fallback, reason: 'mount-mismatch', requested, candidates }
  const length = requested.props.length
  if (typeof length === 'number' && length <= available) return { slide: requested, reason: 'chosen', requested, candidates }
  return { slide: fallback, reason: 'too-long', requested, candidates }
}

/** First hinge plate suited to the construction: face-frame plates carry `props.faceFrame = 1`. */
export function selectHingePlate(catalog: readonly HardwareItem[], faceFrame: boolean): HardwareItem | undefined {
  return catalog.find((h) => h.kind === 'hinge-plate' && (h.props.faceFrame === HINGE_PLATE_FACE_FRAME) === faceFrame)
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
