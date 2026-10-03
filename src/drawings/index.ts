/**
 * Drawings: build/nest → neutral `Drawing` model → SVG string / PDF plan book.
 * Stub — the drawings work stream implements this.
 */
import type { Cabinet, CabinetBuild, Drawing, Part, Sheet, UnitSystem } from '@/core/types'

function emptyDrawing(id: string, title: string): Drawing {
  return { id, title, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, shapes: [] }
}

export function frontElevation(cabinet: Cabinet, build: CabinetBuild, units: UnitSystem): Drawing {
  void build
  void units
  return emptyDrawing(`${cabinet.id}:front`, `${cabinet.name} — front`)
}

export function sideElevation(cabinet: Cabinet, build: CabinetBuild, units: UnitSystem): Drawing {
  void build
  void units
  return emptyDrawing(`${cabinet.id}:side`, `${cabinet.name} — side`)
}

export function panelDetail(part: Part, units: UnitSystem): Drawing {
  void units
  return emptyDrawing(`${part.id}:detail`, part.name)
}

export function sheetLayout(sheet: Sheet, parts: ReadonlyMap<string, Part>, units: UnitSystem): Drawing {
  void parts
  void units
  return emptyDrawing(`${sheet.id}:layout`, sheet.id)
}

export interface SvgOptions {
  units: UnitSystem
  /** Output width in CSS px; height follows the aspect ratio. */
  widthPx?: number
}

export function renderSvg(drawing: Drawing, options: SvgOptions): string {
  void options
  const { minX, minY, maxX, maxY } = drawing.bounds
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${-maxY} ${maxX - minX} ${maxY - minY}"></svg>`
}
