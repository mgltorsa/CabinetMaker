/** Everything an op planner needs to know about the part it works on. */
import type { BuildWarning, Id, Machine, Mm, Part, Placement, Sheet, Tool, ToolpathKind, Vec3 } from '@/core/types'
import { cleanPass } from './geometry'
import type { CamTools } from './tools'
import { panelToSheet, type PanelToSheet } from './transform'
import type { CamPhase, PlannedToolpath } from './types'

export interface PartContext {
  sheetId: Id
  part: Part
  placement: Placement
  /** Thickness of the stock on the sheet (machine Z = 0 is its top). */
  stockThickness: Mm
  toSheet: PanelToSheet
  machine: Machine
  tools: CamTools
}

export function makePartContext(sheet: Sheet, part: Part, placement: Placement, machine: Machine, tools: CamTools): PartContext {
  return {
    sheetId: sheet.id,
    part,
    placement,
    stockThickness: sheet.thickness,
    toSheet: panelToSheet(placement, part),
    machine,
    tools,
  }
}

export function partWarning(ctx: PartContext, level: BuildWarning['level'], code: string, message: string): BuildWarning {
  return { level, code, message, cabinetId: ctx.part.cabinetId, partId: ctx.part.id }
}

/** Build a toolpath from panel-space passes: map to sheet space and clean up. */
export function sheetToolpath(
  ctx: PartContext,
  suffix: string,
  kind: ToolpathKind,
  phase: CamPhase,
  tool: Tool,
  panelPasses: readonly (readonly Vec3[])[],
): PlannedToolpath {
  return {
    id: `${ctx.sheetId}:${ctx.part.id}:${suffix}`,
    partId: ctx.part.id,
    kind,
    phase,
    tool,
    passes: panelPasses.map((pass) => cleanPass(pass.map(ctx.toSheet))).filter((pass) => pass.length > 0),
  }
}
