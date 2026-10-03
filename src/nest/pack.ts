/**
 * Multi-sheet packing for one material.
 *
 * Every strategy = sort order × fit heuristic × sheet choice. Each strategy
 * packs all items greedily (opening a new sheet when nothing fits), and the
 * best layout is kept by: fewest sheets, then the most compact last sheet
 * (smallest bounding box of its parts = biggest clean offcut), then strategy
 * order. Everything is deterministic: sorts tie-break on part id.
 *
 * This is a heuristic, not an optimizer (bin packing is NP-hard).
 */
import type { Id, Mm, Placement } from '@/core/types'
import type { Orientation, UsableArea } from './geometry'
import { compareScores, MaxRectsBin, type FitCandidate, type FitHeuristic, type Size } from './maxrects'

export interface NestItem {
  readonly id: Id
  readonly length: Mm
  readonly width: Mm
  /** Allowed orientations (non-empty), already filtered for grain. */
  readonly orientations: readonly Orientation[]
}

/** 'first-fit': earliest sheet with room. 'best-fit': best score over all open sheets. */
type SheetChoice = 'first-fit' | 'best-fit'

interface PackStrategy {
  readonly order: ItemOrder
  readonly heuristic: FitHeuristic
  readonly sheetChoice: SheetChoice
}

type ItemOrder = 'area' | 'long-side' | 'perimeter'

/** Packed layout: one placements list per sheet, in sheet order. */
export type PackedSheets = readonly (readonly Placement[])[]

const ORDERS: readonly ItemOrder[] = ['area', 'long-side', 'perimeter']
const HEURISTICS: readonly FitHeuristic[] = ['best-short-side', 'best-area', 'bottom-left']
const SHEET_CHOICES: readonly SheetChoice[] = ['first-fit', 'best-fit']

const STRATEGIES: readonly PackStrategy[] = ORDERS.flatMap((order) =>
  HEURISTICS.flatMap((heuristic) => SHEET_CHOICES.map((sheetChoice) => ({ order, heuristic, sheetChoice }))),
)

function orderKeys(item: NestItem, order: ItemOrder): readonly number[] {
  const long = Math.max(item.length, item.width)
  const short = Math.min(item.length, item.width)
  switch (order) {
    case 'area':
      return [long * short, long]
    case 'long-side':
      return [long, short]
    case 'perimeter':
      return [long + short, long]
  }
}

/** Descending by the order's keys, then ascending part id (deterministic). */
function sortItems(items: readonly NestItem[], order: ItemOrder): NestItem[] {
  const keyed = items.map((item) => ({ item, keys: orderKeys(item, order) }))
  keyed.sort((a, b) => {
    for (let i = 0; i < a.keys.length; i++) {
      const diff = (b.keys[i] ?? 0) - (a.keys[i] ?? 0)
      if (diff !== 0) return diff
    }
    return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0
  })
  return keyed.map((k) => k.item)
}

/** Inflated sizes (part + gap on +X/+Y), one per orientation. */
function inflatedSizes(item: NestItem, gap: Mm): Size[] {
  return item.orientations.map((o) => ({ w: o.sizeX + gap, h: o.sizeY + gap }))
}

/** True when the item fits an empty sheet; uses the exact same test as packing. */
export function fitsEmptySheet(item: NestItem, area: UsableArea, gap: Mm): boolean {
  return new MaxRectsBin(area.width + gap, area.height + gap).findPosition(inflatedSizes(item, gap), 'best-short-side') !== null
}

interface OpenSheet {
  readonly bin: MaxRectsBin
  readonly placements: Placement[]
}

interface Choice {
  readonly sheet: OpenSheet
  readonly candidate: FitCandidate
}

function chooseSheet(sheets: readonly OpenSheet[], sizes: readonly Size[], strategy: PackStrategy): Choice | null {
  let best: Choice | null = null
  for (const sheet of sheets) {
    const candidate = sheet.bin.findPosition(sizes, strategy.heuristic)
    if (candidate === null) continue
    if (strategy.sheetChoice === 'first-fit') return { sheet, candidate }
    if (best === null || compareScores(candidate.score, best.candidate.score) < 0) best = { sheet, candidate }
  }
  return best
}

/**
 * Packs items (in the given order) onto as many sheets as needed. Every item
 * must fit an empty sheet (`fitsEmptySheet`); otherwise this throws.
 */
function packItems(items: readonly NestItem[], area: UsableArea, gap: Mm, strategy: PackStrategy): PackedSheets {
  const sheets: OpenSheet[] = []
  for (const item of items) {
    const sizes = inflatedSizes(item, gap)
    let choice = chooseSheet(sheets, sizes, strategy)
    if (choice === null) {
      const sheet: OpenSheet = { bin: new MaxRectsBin(area.width + gap, area.height + gap), placements: [] }
      sheets.push(sheet)
      choice = chooseSheet([sheet], sizes, strategy)
    }
    const orientation = choice === null ? undefined : item.orientations[choice.candidate.sizeIndex]
    if (choice === null || orientation === undefined) {
      throw new Error(`nest invariant: part "${item.id}" does not fit an empty sheet`)
    }
    const { rect } = choice.candidate
    choice.sheet.bin.place(rect)
    choice.sheet.placements.push({
      partId: item.id,
      x: area.x0 + rect.x,
      y: area.y0 + rect.y,
      rotated: orientation.rotated,
      sizeX: orientation.sizeX,
      sizeY: orientation.sizeY,
    })
  }
  return sheets.map((s) => s.placements)
}

/** Bounding-box area of the last sheet's parts, measured from the usable origin. */
function lastSheetSpread(layout: PackedSheets, area: UsableArea): number {
  const last = layout[layout.length - 1] ?? []
  const maxX = last.reduce((m, p) => Math.max(m, p.x + p.sizeX - area.x0), 0)
  const maxY = last.reduce((m, p) => Math.max(m, p.y + p.sizeY - area.y0), 0)
  return maxX * maxY
}

function isBetter(candidate: PackedSheets, current: PackedSheets, area: UsableArea): boolean {
  if (candidate.length !== current.length) return candidate.length < current.length
  return lastSheetSpread(candidate, area) < lastSheetSpread(current, area)
}

/** Runs every strategy and keeps the best layout (see file header). */
export function packBest(items: readonly NestItem[], area: UsableArea, gap: Mm): PackedSheets {
  if (items.length === 0) return []
  const sorted = new Map(ORDERS.map((order) => [order, sortItems(items, order)]))
  let best: PackedSheets | null = null
  for (const strategy of STRATEGIES) {
    const layout = packItems(sorted.get(strategy.order) ?? [], area, gap, strategy)
    if (best === null || isBetter(layout, best, area)) best = layout
  }
  return best ?? []
}
