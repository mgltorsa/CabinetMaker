/**
 * Pull nodes for the cabinet GLB: one node per pull, a child of its front's
 * node (translation relative to the front), meshed from `pullBoxes`, with one
 * material per pull item in the handle's colour.
 */
import { resolveHandle, type ResolvedHandle } from '@/core/handles'
import { pullPlacements } from '@/core/pull-placement'
import type { Cabinet, HardwareItem, Mm, Part, Project } from '@/core/types'
import type { GeoBox, Triple } from './boxGeometry'
import { linearRgba } from './finish'
import { pullBoxes } from './pullBoxes'

const MM_PER_M = 1000
/** Degenerate boxes still get a visible size, as parts do. */
const MIN_SIZE_MM: Mm = 0.1
const PULL_ROUGHNESS = 0.3

export interface CabinetPull {
  item: HardwareItem
  handle: ResolvedHandle
}

export interface ExportPull {
  /** Index of the front in the exported parts. */
  partIndex: number
  name: string
  /** Node translation relative to the front's node, metres. */
  translation: Triple
  boxes: GeoBox[]
  extras: Record<string, string | number | boolean>
}

/** The cabinet's pull item and its resolved handle, or null without a pull. */
export function cabinetPull(cabinet: Cabinet, project: Project): CabinetPull | null {
  const item = project.hardware.find((h) => h.id === cabinet.hardware.pullId && h.kind === 'pull')
  return item ? { item, handle: resolveHandle(item) } : null
}

const m = (v: Mm): number => v / MM_PER_M

/** Every pull on the exported parts; `centres` are the parts' node translations (metres). */
export function exportPulls(parts: readonly Part[], cabinet: Cabinet, pull: CabinetPull, centres: readonly Triple[]): ExportPull[] {
  return parts.flatMap((part, partIndex) =>
    pullPlacements(part, cabinet, pull.handle).map((pl): ExportPull => {
      const c = centres[partIndex] ?? [0, 0, 0]
      const boxes = pullBoxes(pl, pull.handle, part.thickness).map(
        (b): GeoBox => ({
          size: [m(Math.max(b.size.x, MIN_SIZE_MM)), m(Math.max(b.size.y, MIN_SIZE_MM)), m(Math.max(b.size.z, MIN_SIZE_MM))],
          offset: [m(b.offset.x), m(b.offset.y), m(b.offset.z)],
        }),
      )
      return {
        partIndex,
        name: `${part.name} pull ${pl.index + 1}`,
        translation: [m(pl.centre.x) - c[0], m(pl.centre.y) - c[1], m(pl.centre.z) - c[2]],
        boxes,
        extras: {
          hardwareId: pull.item.id,
          hardwareName: pull.item.name,
          handleStyle: pull.handle.style,
          frontPartId: part.id,
          // The imported model is not embedded: Blender gets a bar of the handle's size.
          ...(pull.handle.style === 'custom' ? { placeholder: true } : {}),
        },
      }
    }),
  )
}

/** glTF material for a pull item (base colours are linear). */
export function pullMaterialJson(pull: CabinetPull, name: string): object {
  return {
    name,
    pbrMetallicRoughness: { baseColorFactor: linearRgba(pull.handle.color), metallicFactor: 0, roughnessFactor: PULL_ROUGHNESS },
    extras: { hardwareId: pull.item.id, handleStyle: pull.handle.style },
  }
}
