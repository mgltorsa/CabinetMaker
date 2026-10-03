/** Public and shared types of the CAM module. */
import type { BuildWarning, Machine, Mm, Part, Sheet, Tool, ToolpathKind, Vec3 } from '@/core/types'

export interface CamInput {
  sheet: Sheet
  /** Parts by id (at least every part placed on the sheet). */
  parts: ReadonlyMap<string, Part>
  machine: Machine
  tools: Tool[]
}

export interface GcodeOptions {
  programName: string
  /** Sheet id for the banner; defaults to the toolpaths' sheet id. */
  sheetId?: string
  /** Material description for the banner, e.g. the material name. */
  material?: string
  /** Stock thickness (mm) for the banner, e.g. `sheet.thickness`. */
  thickness?: Mm
}

/** A run of consecutive G1 moves (between rapids / tool changes), absolute mm. */
export interface ParsedPolyline {
  /** Active tool number (T word of the last M6), `null` before any tool change. */
  tool: number | null
  points: Vec3[]
}

export interface ParsedToolChange {
  tool: number
  /** 1-based source line of the M6. */
  line: number
}

export interface ParsedProgram {
  polylines: ParsedPolyline[]
  toolChanges: ParsedToolChange[]
  /** Unsupported or suspicious input (arcs, moves before a known position…). */
  warnings: string[]
}

/** Which ordering phase a toolpath belongs to (drills → grooves/pockets → profiles). */
export type CamPhase = 'drill' | 'groove' | 'profile'

/** Toolpath plus ordering metadata, before the final sort. */
export interface PlannedToolpath {
  id: string
  partId: string
  kind: ToolpathKind
  phase: CamPhase
  tool: Tool
  /** Sheet-space passes. */
  passes: Vec3[][]
}

/** Outcome of planning one op: machined, or reported for manual work. */
export type OpPlan =
  | { status: 'machined'; toolpath: PlannedToolpath; warnings: BuildWarning[] }
  | { status: 'manual'; reason: string; warnings: BuildWarning[] }
