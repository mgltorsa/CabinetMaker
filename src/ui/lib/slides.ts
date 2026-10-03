/**
 * Drawer slide catalog lookups for the cabinet form. Mirrors the engine's
 * rule: a slide's `props.mount` is 0 (undermount) or 1 (side mount); a slide
 * without a `mount` prop fits either.
 */
import type { HardwareItem, Id, SlideMount } from '@/core/types'

/** Catalog `props.mount` value per slide mount (catalog convention). */
export const SLIDE_MOUNT_PROP: Readonly<Record<SlideMount, number>> = { undermount: 0, 'side-mount': 1 }

function fitsMount(item: HardwareItem, mount: SlideMount): boolean {
  const m = item.props.mount
  return m === undefined || m === SLIDE_MOUNT_PROP[mount]
}

export function slidesForMount(catalog: readonly HardwareItem[], mount: SlideMount): HardwareItem[] {
  return catalog.filter((h) => h.kind === 'slide' && fitsMount(h, mount))
}

/** Side mount is only offered when the catalog has a slide explicitly marked side-mount. */
export function hasSideMountSlides(catalog: readonly HardwareItem[]): boolean {
  return catalog.some((h) => h.kind === 'slide' && h.props.mount === SLIDE_MOUNT_PROP['side-mount'])
}

/**
 * Slide id to use after switching to `mount`: the current slide when it fits,
 * otherwise the fitting slide closest in length; the current id when none fits.
 */
export function slideForMount(catalog: readonly HardwareItem[], mount: SlideMount, currentId: Id): Id {
  const candidates = slidesForMount(catalog, mount)
  if (candidates.some((h) => h.id === currentId)) return currentId
  const length = catalog.find((h) => h.id === currentId)?.props.length ?? 0
  const distance = (h: HardwareItem): number => Math.abs((h.props.length ?? 0) - length)
  const closest = candidates.reduce<HardwareItem | undefined>((best, h) => (!best || distance(h) < distance(best) ? h : best), undefined)
  return closest?.id ?? currentId
}
