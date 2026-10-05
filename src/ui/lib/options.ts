/** Select option lists and catalog helpers shared by the sidebar cards. */
import type {
  BackConstruction,
  BayKind,
  CabinetType,
  ConstructionStyle,
  DrawerJoinery,
  HardwareItem,
  HardwareKind,
  JoineryType,
  Project,
  SlideMount,
  ToeKickType,
  TopConstruction,
  TopKind,
} from '@/core/types'
import type { SelectOption } from '../components/fields'
import { hasSideMountSlides, slidesForMount } from './slides'

const opts = <T extends string>(pairs: [T, string][]): SelectOption<T>[] => pairs.map(([value, label]) => ({ value, label }))

export const CABINET_TYPES = opts<CabinetType>([
  ['base', 'Base'],
  ['wall', 'Wall'],
  ['tall', 'Tall / pantry'],
  ['drawer-bank', 'Drawer bank'],
  ['bookshelf', 'Bookshelf'],
  ['nightstand', 'Nightstand'],
  ['dresser', 'Dresser'],
  ['vanity', 'Vanity'],
  ['custom', 'Custom'],
  ['wardrobe', 'Wardrobe'],
])
export const STYLES = opts<ConstructionStyle>([
  ['frameless-overlay', 'Frameless, full overlay'],
  ['frameless-inset', 'Frameless, inset'],
  ['face-frame-overlay', 'Face frame, overlay'],
  ['face-frame-inset', 'Face frame, inset'],
])
export const JOINERY = opts<JoineryType>([
  ['none', 'Screws only'],
  ['dowel', 'Dowel'],
  ['domino', 'Domino'],
  ['dado', 'Dado / groove'],
])
export const DRAWER_JOINERY = opts<DrawerJoinery>([
  ['none', 'Screws only'],
  ['dowel', 'Dowel'],
  ['domino', 'Domino'],
  ['dado', 'Dado'],
])
export const BACKS = opts<BackConstruction>([
  ['captured', 'Captured in groove'],
  ['applied', 'Applied to rear'],
])
export const TOE_KICKS = opts<ToeKickType>([
  ['none', 'None'],
  ['panel', 'Panel'],
  ['full', 'Full (separate base)'],
])
export const TOP_CONSTRUCTIONS = opts<TopConstruction>([
  ['stretchers', 'Stretchers'],
  ['full-top', 'Full top panel'],
])
export const TOP_KINDS = opts<TopKind>([
  ['none', 'None'],
  ['finished', 'Finished top'],
  ['countertop', 'Countertop'],
])
export const BAY_KINDS = opts<BayKind>([
  ['drawer', 'Drawer'],
  ['door', 'Door'],
  ['open', 'Open'],
])

/** Side mount is offered only when the catalog has a side-mount slide (or the cabinet already uses it). */
export function slideMountOptions(project: Project, current: SlideMount): SelectOption<SlideMount>[] {
  const hasSide = hasSideMountSlides(project.hardware)
  return [
    { value: 'undermount', label: 'Undermount' },
    {
      value: 'side-mount',
      label: hasSide ? 'Side mount' : 'Side mount (no side-mount slides in catalog)',
      isDisabled: !hasSide && current !== 'side-mount',
    },
  ]
}

/** Sheet stock, or rectangular linear stock (round rod stock is offered by `rodMaterialOptions`). */
export function materialOptions(project: Project, kind: 'sheet' | 'linear'): SelectOption<string>[] {
  return project.materials
    .filter((m) => m.kind === kind && !(m.kind === 'linear' && m.profile === 'round'))
    .map((m) => ({ value: m.id, label: m.name }))
}

/** Round linear stock that hanging rods can be cut from. */
export function rodMaterialOptions(project: Project): SelectOption<string>[] {
  return project.materials.filter((m) => m.kind === 'linear' && m.profile === 'round').map((m) => ({ value: m.id, label: m.name }))
}

const hardwareOption = (h: HardwareItem): SelectOption<string> => ({ value: h.id, label: `${h.name} (${h.manufacturer} ${h.sku})` })

export function hardwareOptions(project: Project, kind: HardwareKind): SelectOption<string>[] {
  return project.hardware.filter((h) => h.kind === kind).map(hardwareOption)
}

/** Keep the current id selectable even if it is missing from the catalog. */
export function withCurrent(options: SelectOption<string>[], current: string): SelectOption<string>[] {
  return options.some((o) => o.value === current) ? options : [{ value: current, label: `${current} (missing)` }, ...options]
}

/** Slides of the cabinet's mount; a current slide of the other mount stays listed, marked as such. */
export function slideOptions(project: Project, mount: SlideMount, currentId: string): SelectOption<string>[] {
  const options = slidesForMount(project.hardware, mount).map(hardwareOption)
  const current = project.hardware.find((h) => h.id === currentId && h.kind === 'slide')
  if (!current || options.some((o) => o.value === currentId)) return withCurrent(options, currentId)
  return [{ value: current.id, label: `${current.name} (other mount)` }, ...options]
}
