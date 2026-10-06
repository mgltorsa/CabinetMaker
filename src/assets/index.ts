/**
 * Design asset catalog (pure TS, no React / three): parametric appliances,
 * furniture, lights and decor described as primitives and light sources.
 * The 3D view and the Blender export render these; the engine, cut list,
 * nest, CAM and estimate never see them.
 */
export { ASSET_CATALOG, ASSET_CATEGORIES, getAssetDef, searchAssets, type CategoryFilter } from './catalog'
export { eulerToQuaternion, hasPositiveDims, localHalfExtents, primitiveBounds, rotateEuler, type Bounds3 } from './geometry'
export { EMITTER_OFF_COLOR, resolveLook, ROLE_LOOK, type MaterialLook } from './materials'
export type {
  AssetCategory,
  AssetDef,
  AssetMount,
  BoxPrimitive,
  CylinderPrimitive,
  LightKind,
  LightSource,
  MaterialRole,
  Primitive,
  SpherePrimitive,
  TorusPrimitive,
  Tuple3,
} from './types'
