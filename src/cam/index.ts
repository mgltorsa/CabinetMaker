/**
 * CAM: nested sheet → toolpaths → G-code (G21). Preview only; output must be
 * simulated before running on a machine.
 *
 * Frames: ops are in panel space; toolpaths are in sheet/machine space with
 * Z = 0 at the top of stock (face A up). See `transform.ts` for the exact
 * panel → sheet mapping of rotated placements.
 */
export { generateToolpaths } from './generate'
export { emitGcode } from './gcode'
export { parseGcode } from './parse'
export { panelToSheet } from './transform'
export type { CamInput, GcodeOptions, ParsedPolyline, ParsedProgram, ParsedToolChange } from './types'
