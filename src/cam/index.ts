/**
 * CAM: nested sheet → toolpaths → G-code (G21). Preview only; output must be
 * simulated before running on a machine. Stub — the CAM work stream implements this.
 */
import type { CamResult, Machine, Part, Sheet, Tool, Toolpath } from '@/core/types'

export interface CamInput {
  sheet: Sheet
  /** Parts by id (at least every part placed on the sheet). */
  parts: ReadonlyMap<string, Part>
  machine: Machine
  tools: Tool[]
}

export function generateToolpaths(input: CamInput): CamResult {
  return { sheetId: input.sheet.id, toolpaths: [], manualOps: [], warnings: [] }
}

export interface GcodeOptions {
  programName: string
}

export function emitGcode(toolpaths: Toolpath[], machine: Machine, tools: Tool[], options: GcodeOptions): string {
  void toolpaths
  void machine
  void tools
  return `(${options.programName})\n(CAM not implemented)\n`
}
