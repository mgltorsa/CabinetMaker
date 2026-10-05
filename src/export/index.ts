/**
 * Exports for other tools. Pure TS (no React):
 *   cabinet → GLB (glTF 2.0 binary, written by hand)
 *   project → Blender bundle zip (GLBs, thumbnails, manifest, import script, README)
 */
export { cabinetToGlb, exportParts, GLB_GENERATOR, type CabinetGlbOptions, type Extras, type ExtrasValue } from './cabinetGlb'
export { buildBlenderBundle, MANIFEST_NAME, type BlenderBundleOptions } from './bundle'
export type { BundleManifest, ManifestCabinet, ManifestHardware, ManifestMaterial } from './manifest'
export { BLENDER_SCRIPT, BLENDER_SCRIPT_NAME } from './blenderScript'
export { cabinetSlugs, slugify } from './slug'
