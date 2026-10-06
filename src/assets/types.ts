/**
 * Asset catalog contract: pure descriptions of parametric design assets
 * (appliances, furniture, lights, decor) that renderers and exporters turn
 * into meshes and lights. Nothing here reaches the engine or the cut list.
 *
 * Asset space: mm, origin at the floor centre of the asset's footprint,
 * +X right, +Y up, +Z toward the asset's front. An asset of size W × H × D
 * occupies x ∈ [-W/2, W/2], y ∈ [0, H], z ∈ [-D/2, D/2].
 */
import type { Mm, Vec3 } from '@/core/types'

export type Tuple3 = readonly [number, number, number]

export type AssetCategory = 'kitchen' | 'room' | 'lights' | 'decor'

/**
 * Where an asset goes when added (and what "snap" means for it):
 * `floor` in front of the run, `floor-wall` on the floor against the back wall,
 * `counter` on the worktop, `wall` on the back wall at `defaultLift`,
 * `ceiling` hanging from the ceiling, `under-cabinet` below the wall cabinets.
 */
export type AssetMount = 'floor' | 'floor-wall' | 'counter' | 'wall' | 'ceiling' | 'under-cabinet'

/**
 * Surface look of a primitive. `body` takes the asset's colour; `emitter`
 * glows in the light colour while the asset's light is on.
 */
export type MaterialRole =
  | 'body'
  | 'metal'
  | 'steel'
  | 'dark'
  | 'glass'
  | 'wood'
  | 'white'
  | 'fabric'
  | 'soft'
  | 'plant'
  | 'soil'
  | 'ceramic'
  | 'screen'
  | 'paper'
  | 'emitter'

interface PrimitiveBase {
  /** Centre of the primitive, asset space (mm). */
  position: Tuple3
  /** Euler angles, radians, three.js 'XYZ' order. Absent = no rotation. */
  rotation?: Tuple3
  role: MaterialRole
  /** Fixed colour (`#rrggbb`) instead of the role's colour (books, fruit…). */
  color?: string
}

export interface BoxPrimitive extends PrimitiveBase {
  kind: 'box'
  /** Full size along local x, y, z (mm). */
  size: Tuple3
}

/** Cylinder or cone frustum along local Y, centred on `position`. */
export interface CylinderPrimitive extends PrimitiveBase {
  kind: 'cylinder'
  radiusTop: Mm
  radiusBottom: Mm
  height: Mm
  /** No end caps (lamp shades): renderers draw both faces. */
  openEnded?: boolean
}

export interface SpherePrimitive extends PrimitiveBase {
  kind: 'sphere'
  radius: Mm
}

/** Ring in the local XY plane (around local Z), as three.js builds it. */
export interface TorusPrimitive extends PrimitiveBase {
  kind: 'torus'
  /** Centre-line radius. */
  radius: Mm
  /** Tube radius. */
  tube: Mm
}

export type Primitive = BoxPrimitive | CylinderPrimitive | SpherePrimitive | TorusPrimitive

export type LightKind = 'point' | 'spot' | 'rect'

/** A light source in asset space. Spot and rect lights point straight down (-Y). */
export interface LightSource {
  kind: LightKind
  position: Tuple3
  /** three.js intensity at brightness 1 (point / spot: candela; rect: nits). */
  intensity: number
  /** Default colour, `#rrggbb`. */
  color: string
  /** Range in mm (0 = unlimited). */
  distance: Mm
  /** Spot: cone half-angle in radians. */
  angle?: number
  /** Rect: emitting area along x and z (mm). */
  width?: Mm
  depth?: Mm
}

export interface AssetDef {
  id: string
  name: string
  category: AssetCategory
  /** Extra search words besides the name and category. */
  keywords: readonly string[]
  defaultSize: Vec3
  /** Default `body` colour, `#rrggbb`. */
  defaultColor: string
  mount: AssetMount
  /** `wall` mounts: height of the asset's bottom above the floor when added (mm). */
  defaultLift?: Mm
  /** Whether the asset casts shadows (flat things like rugs do not). Default true. */
  castsShadow?: boolean
  /** Primitives filling the W × H × D box of `size`. */
  build: (size: Vec3) => Primitive[]
  /** Light assets: the light source for `size`. */
  light?: (size: Vec3) => LightSource
}
