/**
 * Exports for other tools. Pure TS (no React):
 *   cabinet → GLB (glTF 2.0 binary, written by hand)
 *   project → Blender bundle zip (GLBs, thumbnails, manifest, import script, README)
 *   placed design assets → one room-space GLB (in the bundle as scene/placed-assets.glb)
 */
export { cabinetToGlb, exportParts, GLB_GENERATOR, type CabinetGlbOptions, type Extras, type ExtrasValue } from './cabinetGlb'
export { buildBlenderBundle, MANIFEST_NAME, SCENE_ASSETS_GLB, type BlenderBundleOptions } from './bundle'
export { ASSETS_ROOT_NAME, placedAssetsToGlb } from './assetsGlb'
export type { BundleManifest, ManifestAsset, ManifestCabinet, ManifestHardware, ManifestMaterial, ManifestSceneAssets } from './manifest'
export { BLENDER_SCRIPT, BLENDER_SCRIPT_NAME } from './blenderScript'
export { cabinetSlugs, slugify } from './slug'
